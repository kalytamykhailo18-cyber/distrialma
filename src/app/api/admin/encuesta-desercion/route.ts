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

async function getSetting(key: string, def: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value || def;
}

// GET: preview clients who would receive the survey
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const data = await getDesertedClients();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Encuesta desercion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: send survey messages
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const enabled = (await getSetting("encuesta_desercion_enabled", "false")) === "true";
    if (!enabled) return NextResponse.json({ ok: true, skipped: true, reason: "deshabilitado" });

    const formUrl = await getSetting("encuesta_desercion_url", "");
    if (!formUrl) return NextResponse.json({ ok: true, skipped: true, reason: "sin URL de formulario" });

    const data = await getDesertedClients();
    if (data.clientes.length === 0) return NextResponse.json({ ok: true, sent: 0 });

    const maxPerRun = parseInt(await getSetting("encuesta_desercion_max", "10"));
    const template = await getSetting("encuesta_desercion_message",
      "Hola {nombre}, notamos que hace tiempo no nos pedis. Nos ayudaria mucho saber si tuvimos algun error para poder corregirlo. Nos regalas 1 minuto?\n\n{url}");

    let sent = 0;
    for (const client of data.clientes.slice(0, maxPerRun)) {
      const chatId = toWaChatId(client.telefono);
      if (!chatId) continue;

      const firstName = client.nombre.split(" ")[0];
      const msg = template
        .replace(/\{nombre\}/g, firstName)
        .replace(/\{dias\}/g, String(client.diasInactivo))
        .replace(/\{url\}/g, formUrl);

      try {
        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg, sender: "bot" }),
        });
        if (res.ok) {
          await prisma.notificationLog.create({
            data: { clientId: client.cod, tipo: "encuesta_desercion", mensaje: msg, telefono: client.telefono, enviadoPor: "sistema", ok: true },
          });
          sent++;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log(`[ENCUESTA-DESERCION] Sent ${sent} messages`);
    return NextResponse.json({ ok: true, sent, total: data.clientes.length });
  } catch (error) {
    console.error("Encuesta desercion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

async function getDesertedClients() {
  const pool = await getPool();
  const dbClientes = getDbName("clientes");
  const dbTransas = getDbName("transas");

  const diasMin = parseInt(await getSetting("encuesta_desercion_dias_min", "30"));
  const diasMax = parseInt(await getSetting("encuesta_desercion_dias_max", "90"));
  const minCompras = parseInt(await getSetting("encuesta_desercion_min_compras", "3"));
  const cooldownDays = parseInt(await getSetting("encuesta_desercion_cooldown", "60"));
  const sucDistribuidora = await getSetting("encuesta_desercion_sucursal", "7");

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const minDate = new Date(now.getTime() - diasMax * 24 * 60 * 60 * 1000);
  const maxDate = new Date(now.getTime() - diasMin * 24 * 60 * 60 * 1000);
  const minDateStr = minDate.getFullYear().toString()
    + String(minDate.getMonth() + 1).padStart(2, "0")
    + String(minDate.getDate()).padStart(2, "0") + "000000";
  const maxDateStr = maxDate.getFullYear().toString()
    + String(maxDate.getMonth() + 1).padStart(2, "0")
    + String(maxDate.getDate()).padStart(2, "0") + "235959";

  // Find distribuidora clients who stopped buying 30-90 days ago with 3+ purchases
  const result = await pool.request()
    .input("minDate", minDateStr)
    .input("maxDate", maxDateStr)
    .input("suc", sucDistribuidora)
    .input("minCompras", minCompras)
    .query(`
      SELECT
        LTRIM(RTRIM(c.Cod)) AS cod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono,
        (SELECT MAX(LTRIM(RTRIM(t2.Fechora))) FROM [${dbTransas}].dbo.Transas t2
         WHERE t2.Cliente = c.Cod AND t2.Tipo = 'V' AND (LTRIM(RTRIM(t2.Itm)) = '0' OR LTRIM(RTRIM(t2.Itm)) = '')) AS ultimaCompra
      FROM [${dbClientes}].dbo.Clientes c
      WHERE (c.DeBaja = 0 OR c.DeBaja IS NULL)
        AND (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
        -- At least N purchases in distribuidora sucursal
        AND (SELECT COUNT(DISTINCT t.Boleta) FROM [${dbTransas}].dbo.Transas t
             WHERE t.Cliente = c.Cod AND t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
             AND LTRIM(RTRIM(t.Sucursal)) = @suc) >= @minCompras
        -- Last purchase was between diasMin and diasMax ago
        AND (SELECT MAX(t3.Fechora) FROM [${dbTransas}].dbo.Transas t3
             WHERE t3.Cliente = c.Cod AND t3.Tipo = 'V' AND (LTRIM(RTRIM(t3.Itm)) = '0' OR LTRIM(RTRIM(t3.Itm)) = ''))
             BETWEEN @minDate AND @maxDate
      ORDER BY c.Nombre
    `);

  // Check cooldown
  const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
  const recentContacts = await prisma.notificationLog.findMany({
    where: { tipo: "encuesta_desercion", ok: true, createdAt: { gte: cooldownDate } },
    select: { clientId: true },
  });
  const contactedSet = new Set(recentContacts.map((r) => r.clientId));

  const clients = [];
  for (const r of result.recordset) {
    if (contactedSet.has(r.cod)) continue;

    let diasInactivo = diasMin;
    if (r.ultimaCompra) {
      const lastDate = new Date(
        parseInt(r.ultimaCompra.slice(0, 4)),
        parseInt(r.ultimaCompra.slice(4, 6)) - 1,
        parseInt(r.ultimaCompra.slice(6, 8))
      );
      diasInactivo = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    clients.push({
      cod: r.cod,
      nombre: r.nombre,
      telefono: r.telefono,
      diasInactivo,
    });
  }

  return { diasMin, diasMax, minCompras, cooldownDays, sucursal: sucDistribuidora, clientes: clients };
}
