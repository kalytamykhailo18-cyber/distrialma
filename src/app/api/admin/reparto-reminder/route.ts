import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DAY_ZONES: Record<string, string> = {
  "0": "DOMINGO",
  "1": "LUNES",
  "2": "MARTES",
  "3": "MIERCOLES",
  "4": "JUEVES",
  "5": "VIERNES",
  "6": "SABADO",
};

function zoneMatchesDay(zoneName: string, dayName: string): boolean {
  return zoneName.toUpperCase().includes(dayName);
}

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

interface ReminderClient {
  cod: string; nombre: string; telefono: string; zona: string;
  suggestedProduct: string | null; suggestedPrice: number | null; suggestedSku: string | null;
}

interface ReminderData {
  deliveryDay: string;
  zonesMatched: string[];
  totalClients: number;
  withOrder: number;
  needReminder: number;
  clients: ReminderClient[];
}

async function getClientsForReminder(targetDay?: string): Promise<ReminderData> {
  const pool = await getPool();
  const dbClientes = getDbName("clientes");
  const dbPedidos = getDbName("pedidos");
  const dbTransas = getDbName("transas");
  const dbProd = getDbName("productos");

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const deliveryDayName = targetDay?.toUpperCase() || DAY_ZONES[String(tomorrow.getDay())] || "";

  if (!deliveryDayName) {
    return { deliveryDay: "", zonesMatched: [], totalClients: 0, withOrder: 0, needReminder: 0, clients: [] };
  }

  const zonesResult = await pool.request().query(`
    SELECT Cod AS cod, LTRIM(RTRIM([Desc])) AS nombre
    FROM [${dbClientes}].dbo.Zonas
    WHERE [Desc] IS NOT NULL AND LTRIM(RTRIM([Desc])) <> ''
  `);

  const matchingZones = zonesResult.recordset.filter(
    (z: { nombre: string }) => zoneMatchesDay(z.nombre, deliveryDayName)
  );

  if (matchingZones.length === 0) {
    return { deliveryDay: deliveryDayName, zonesMatched: [], totalClients: 0, withOrder: 0, needReminder: 0, clients: [] };
  }

  const zoneList = matchingZones.map((z: { cod: string }) => `'${z.cod}'`).join(",");

  const clients = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(c.Cod)) AS cod,
      LTRIM(RTRIM(c.Nombre)) AS nombre,
      LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono,
      LTRIM(RTRIM(ISNULL(z.[Desc], ''))) AS zona
    FROM [${dbClientes}].dbo.Clientes c
    LEFT JOIN [${dbClientes}].dbo.Zonas z ON z.Cod = c.Zona
    WHERE c.Zona IN (${zoneList})
      AND (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
  `);

  if (clients.recordset.length === 0) {
    return { deliveryDay: deliveryDayName, zonesMatched: matchingZones.map((z: { nombre: string }) => z.nombre), totalClients: 0, withOrder: 0, needReminder: 0, clients: [] };
  }

  const clientCods = clients.recordset.map((c: { cod: string }) => c.cod);
  const codList = clientCods.map((c: string) => `'${c.padStart(7, " ")}'`).join(",");

  const pendingOrders = await pool.request().query(`
    SELECT DISTINCT LTRIM(RTRIM(p.Cliente)) AS clienteCod
    FROM [${dbPedidos}].dbo.Pedidos p
    WHERE p.Tipo = 'V'
      AND p.Cliente IN (${codList})
      AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
  `);
  const clientsWithOrder = new Set(pendingOrders.recordset.map((r: { clienteCod: string }) => r.clienteCod));

  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const sinceStr = threeDaysAgo.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);

  const recentTransas = await pool.request().input("since", sinceStr).query(`
    SELECT DISTINCT LTRIM(RTRIM(t.Cliente)) AS clienteCod
    FROM [${dbTransas}].dbo.Transas t
    WHERE t.Tipo = 'V'
      AND t.Cliente IN (${codList})
      AND t.Fechora >= @since
      AND LTRIM(RTRIM(t.Sucursal)) = '7'
      AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
  `);
  const clientsWithRecent = new Set(recentTransas.recordset.map((r: { clienteCod: string }) => r.clienteCod));

  const needReminder = clients.recordset.filter(
    (c: { cod: string }) => !clientsWithOrder.has(c.cod) && !clientsWithRecent.has(c.cod)
  );

  const suggestions: ReminderClient[] = [];

  for (const client of needReminder) {
    let suggestedProduct: string | null = null;
    let suggestedPrice: number | null = null;
    let suggestedSku: string | null = null;

    try {
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      const sinceMonth = threeMonthsAgo.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);

      const topProducts = await pool.request()
        .input("cli", client.cod.padStart(7, " "))
        .input("sinceM", sinceMonth)
        .query(`
          SELECT TOP 5
            LTRIM(RTRIM(t.Producto)) AS sku,
            LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
            SUM(t.Cant) AS totalCant
          FROM [${dbTransas}].dbo.Transas t
          LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
          WHERE t.Tipo = 'I'
            AND t.Cliente = @cli
            AND t.Fechora >= @sinceM
            AND LTRIM(RTRIM(t.Sucursal)) = '7'
            AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
            AND t.Cant > 0
          GROUP BY LTRIM(RTRIM(t.Producto)), LTRIM(RTRIM(ISNULL(pr.Nombre, '')))
          ORDER BY SUM(t.Cant) DESC
        `);

      if (topProducts.recordset.length > 0) {
        const pick = topProducts.recordset[0];
        suggestedSku = pick.sku;
        suggestedProduct = pick.nombre;

        const priceResult = await pool.request()
          .input("sku", pick.sku.padStart(7, " "))
          .query(`
            SELECT TOP 1 s.Precio2 AS precio
            FROM [${dbProd}].dbo.Stock s
            WHERE s.CodProducto = @sku
              AND LTRIM(RTRIM(s.Deposito)) = '0'
              AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          `);

        if (priceResult.recordset.length > 0) {
          suggestedPrice = Number(priceResult.recordset[0].precio);
        }
      }
    } catch { /* skip suggestion if query fails */ }

    suggestions.push({ cod: client.cod, nombre: client.nombre, telefono: client.telefono, zona: client.zona, suggestedProduct, suggestedPrice, suggestedSku });
  }

  return {
    deliveryDay: deliveryDayName,
    zonesMatched: matchingZones.map((z: { nombre: string }) => z.nombre),
    totalClients: clients.recordset.length,
    withOrder: clientsWithOrder.size + clientsWithRecent.size,
    needReminder: suggestions.length,
    clients: suggestions,
  };
}

// GET: preview
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== "re_5wSDTNZc_3ZCp") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const data = await getClientsForReminder(req.nextUrl.searchParams.get("day") || undefined);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Reparto reminder error:", error);
    return NextResponse.json({ error: "Error al buscar clientes" }, { status: 500 });
  }
}

// POST: send the reminders
export async function POST(req: NextRequest) {
  const { secret } = await req.json();
  if (secret !== "re_5wSDTNZc_3ZCp") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const data = await getClientsForReminder();

    if (!data.clients.length) {
      return NextResponse.json({ sent: 0, message: "No hay clientes para recordar", deliveryDay: data.deliveryDay });
    }

    const results: Array<{ cod: string; nombre: string; ok: boolean; error?: string }> = [];

    // Check 24h duplicate block
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLogs = await prisma.notificationLog.findMany({
      where: { tipo: "recordatorio_reparto", ok: true, createdAt: { gte: since24h } },
      select: { clientId: true },
    });
    const recentlySent = new Set(recentLogs.map((l) => l.clientId));

    for (const client of data.clients) {
      if (recentlySent.has(client.cod)) {
        results.push({ cod: client.cod, nombre: client.nombre, ok: false, error: "Ya contactado en 24hs" });
        continue;
      }

      const chatId = toWaChatId(client.telefono);
      if (!chatId) {
        results.push({ cod: client.cod, nombre: client.nombre, ok: false, error: "Telefono invalido" });
        continue;
      }

      let msg = `Hola ${client.nombre.split(" ")[0]}! 👋 Mañana es tu dia de entrega y todavia no pasaste el pedido. Podes hacerlo en distrialma.com.ar 🛒`;

      if (client.suggestedProduct && client.suggestedPrice) {
        const priceStr = client.suggestedPrice.toLocaleString("es-AR", { maximumFractionDigits: 0 });
        msg += `\n\nVi que no pediste ${client.suggestedProduct} que sueles llevar, hoy esta a $${priceStr} 🔥 Lo necesitas?`;
      }

      try {
        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg, addToContext: true, sender: "bot" }),
        });

        const ok = res.ok;
        results.push({ cod: client.cod, nombre: client.nombre, ok });

        await prisma.notificationLog.create({
          data: {
            clientId: client.cod,
            tipo: "recordatorio_reparto",
            mensaje: msg,
            telefono: client.telefono,
            enviadoPor: "cron",
            ok,
            error: ok ? null : "Error al enviar",
          },
        });
      } catch (e) {
        results.push({ cod: client.cod, nombre: client.nombre, ok: false, error: e instanceof Error ? e.message : "Error" });
      }

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ sent, failed: results.length - sent, deliveryDay: data.deliveryDay, results });
  } catch (error) {
    console.error("Reparto reminder send error:", error);
    return NextResponse.json({ error: "Error al enviar recordatorios" }, { status: 500 });
  }
}
