import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

async function getSetting(key: string, def: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value || def;
}

// GET: preview
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const data = await getInactiveClients();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Reactivacion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: send reactivation messages
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const enabled = (await getSetting("reactivacion_auto_enabled", "false")) === "true";
    if (!enabled) return NextResponse.json({ ok: true, skipped: true, reason: "deshabilitado" });

    const data = await getInactiveClients();
    if (data.clientes.length === 0) return NextResponse.json({ ok: true, sent: 0 });

    const maxPerRun = parseInt(await getSetting("reactivacion_auto_max", "10"));
    const template = await getSetting("reactivacion_auto_message",
      "Hola {nombre}! Hace {dias} dias que no te vemos por Distrialma. Tus productos habituales te estan esperando:\n\n{productos}\n\nHace tu pedido en distrialma.com.ar o respondenos aca!");

    let sent = 0;
    for (const client of data.clientes.slice(0, maxPerRun)) {
      const chatId = toWaChatId(client.telefono);
      if (!chatId) continue;

      const firstName = client.nombre.split(" ")[0];
      const productosText = client.topProducts.map((p: { nombre: string; precio: number }) =>
        `- ${p.nombre} ${formatPrice(p.precio)}`
      ).join("\n");

      const msg = template
        .replace(/\{nombre\}/g, firstName)
        .replace(/\{dias\}/g, String(client.diasInactivo))
        .replace(/\{productos\}/g, productosText);

      try {
        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg, sender: "bot" }),
        });
        if (res.ok) {
          await prisma.notificationLog.create({
            data: { clientId: client.cod, tipo: "reactivacion_auto", mensaje: msg, telefono: client.telefono, enviadoPor: "sistema", ok: true },
          });
          sent++;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log(`[REACTIVACION] Sent ${sent} messages`);
    return NextResponse.json({ ok: true, sent, total: data.clientes.length });
  } catch (error) {
    console.error("Reactivacion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

async function getInactiveClients() {
  const pool = await getPool();
  const dbClientes = getDbName("clientes");
  const dbTransas = getDbName("transas");

  const diasThreshold = parseInt(await getSetting("reactivacion_auto_dias", "30"));
  const cooldownDays = parseInt(await getSetting("reactivacion_auto_cooldown", "30"));

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const thresholdDate = new Date(now.getTime() - diasThreshold * 24 * 60 * 60 * 1000);
  const thresholdStr = thresholdDate.getFullYear().toString()
    + String(thresholdDate.getMonth() + 1).padStart(2, "0")
    + String(thresholdDate.getDate()).padStart(2, "0") + "000000";

  // Find clients who haven't bought since threshold
  const result = await pool.request().input("threshold", thresholdStr).query(`
    SELECT TOP 50
      LTRIM(RTRIM(c.Cod)) AS cod,
      LTRIM(RTRIM(c.Nombre)) AS nombre,
      LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono,
      (SELECT MAX(LTRIM(RTRIM(t.Fechora))) FROM [${dbTransas}].dbo.Transas t
       WHERE t.Cliente = c.Cod AND t.Tipo = 'V' AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')) AS ultimaCompra
    FROM [${dbClientes}].dbo.Clientes c
    WHERE (c.DeBaja = 0 OR c.DeBaja IS NULL)
      AND (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
      AND c.TotalVeces > 3
      AND NOT EXISTS (
        SELECT 1 FROM [${dbTransas}].dbo.Transas t
        WHERE t.Cliente = c.Cod AND t.Tipo = 'V' AND t.Fechora >= @threshold
      )
    ORDER BY c.TotalVeces DESC
  `);

  // Check cooldown
  const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
  const recentContacts = await prisma.notificationLog.findMany({
    where: { tipo: { in: ["reactivacion", "reactivacion_auto"] }, ok: true, createdAt: { gte: cooldownDate } },
    select: { clientId: true },
  });
  const contactedSet = new Set(recentContacts.map((r) => r.clientId));

  const clients = [];
  for (const r of result.recordset) {
    if (contactedSet.has(r.cod)) continue;

    // Calculate days inactive
    let diasInactivo = diasThreshold;
    if (r.ultimaCompra) {
      const lastDate = new Date(
        parseInt(r.ultimaCompra.slice(0, 4)),
        parseInt(r.ultimaCompra.slice(4, 6)) - 1,
        parseInt(r.ultimaCompra.slice(6, 8))
      );
      diasInactivo = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    // Get top 3 products this client used to buy
    let topProducts: Array<{ nombre: string; precio: number }> = [];
    try {
      const prods = await pool.request().input("cod", r.cod.padStart(7, " ")).query(`
        SELECT TOP 3 LTRIM(RTRIM(t.Producto)) AS sku, LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
          ISNULL(s.Precio2, 0) AS precio
        FROM [${dbTransas}].dbo.Transas t
        LEFT JOIN [${getDbName("productos")}].dbo.Productos p ON p.Cod = t.Producto
        LEFT JOIN [${getDbName("productos")}].dbo.Stock s ON s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0'
        WHERE t.Cliente = @cod AND t.Tipo = 'I' AND t.Cant > 0
        GROUP BY LTRIM(RTRIM(t.Producto)), LTRIM(RTRIM(ISNULL(p.Nombre, ''))), ISNULL(s.Precio2, 0)
        ORDER BY COUNT(*) DESC
      `);
      topProducts = prods.recordset
        .filter((p: { precio: number }) => Number(p.precio) > 0)
        .map((p: { nombre: string; precio: number }) => ({ nombre: p.nombre.trim(), precio: Number(p.precio) }));
    } catch {}

    if (topProducts.length === 0) continue;

    clients.push({
      cod: r.cod,
      nombre: r.nombre,
      telefono: r.telefono,
      diasInactivo,
      topProducts,
    });
  }

  return { diasThreshold, cooldownDays, clientes: clients };
}
