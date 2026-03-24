import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const DAYS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

function getTodayDay(): string {
  // Argentina time (UTC-3)
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const dayIndex = now.getUTCDay(); // 0=Sunday
  const map = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
  return map[dayIndex];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const day = searchParams.get("day") || getTodayDay();

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbPedidos = getDbName("pedidos");

    // Get clients with this delivery day from our table
    const ourDays = await prisma.clientDeliveryDay.findMany({
      where: { day },
    });
    const ourClientIds = ourDays.map((d) => d.clientId);

    // Also get clients with this day from PunTouch Zona (fallback)
    const zonaResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(c.Cod)) AS cod
      FROM [${dbClientes}].dbo.Clientes c
      JOIN [${dbClientes}].dbo.Zonas z ON z.Cod = c.Zona
      WHERE UPPER(LTRIM(RTRIM(z.[Desc]))) = '${day}'
        AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
    `);
    const zonaClientIds = zonaResult.recordset.map((r: { cod: string }) => r.cod);

    // Merge: our days take priority, add zona clients that don't have our days
    const clientsWithOurDays = new Set(
      (await prisma.clientDeliveryDay.findMany({ select: { clientId: true } })).map((d) => d.clientId)
    );
    const allClientIds = Array.from(new Set([
      ...ourClientIds,
      ...zonaClientIds.filter((id: string) => !clientsWithOurDays.has(id)),
    ]));

    if (allClientIds.length === 0) {
      return NextResponse.json({ clients: [], day, today: getTodayDay(), availableDays: DAYS });
    }

    // Get client details from SQL Server
    const placeholders = allClientIds.map((_, i) => `@c${i}`).join(",");
    const clientReq = pool.request();
    allClientIds.forEach((id, i) => clientReq.input(`c${i}`, id.padStart(7, " ")));

    const clientsResult = await clientReq.query(`
      SELECT LTRIM(RTRIM(c.Cod)) AS cod,
             LTRIM(RTRIM(c.Nombre)) AS nombre,
             LTRIM(RTRIM(ISNULL(c.Calle, ''))) AS calle,
             LTRIM(RTRIM(ISNULL(c.Nume, ''))) AS numero,
             LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono
      FROM [${dbClientes}].dbo.Clientes c
      WHERE c.Cod IN (${placeholders})
        AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
      ORDER BY c.Nombre
    `);

    // Calculate date range for the selected delivery day
    const dbTransas = "c:\\puntouch\\bdtransas.mdf";
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const dayMap: Record<string, number> = { DOMINGO: 0, LUNES: 1, MARTES: 2, MIERCOLES: 3, JUEVES: 4, VIERNES: 5, SABADO: 6 };
    const targetDayNum = dayMap[day] ?? 1;
    const todayDayNum = now.getUTCDay();
    const daysDiff = targetDayNum - todayDayNum;
    // daysDiff > 0 means future day this week
    // daysDiff = 0 means today
    // daysDiff < 0 means past day this week
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysDiff);
    targetDate.setUTCHours(0, 0, 0, 0);
    const sinceStr = targetDate.getUTCFullYear().toString()
      + String(targetDate.getUTCMonth() + 1).padStart(2, "0")
      + String(targetDate.getUTCDate()).padStart(2, "0") + "000000";
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const untilStr = nextDay.getUTCFullYear().toString()
      + String(nextDay.getUTCMonth() + 1).padStart(2, "0")
      + String(nextDay.getUTCDate()).padStart(2, "0") + "000000";

    // Check who has pending web orders (Pedidos) — no date filter because
    // orders can be placed days before the delivery day
    const orderReq = pool.request();
    allClientIds.forEach((id, i) => orderReq.input(`o${i}`, id.padStart(7, " ")));
    const ordPlaceholders = allClientIds.map((_, i) => `@o${i}`).join(",");

    const ordersResult = await orderReq.query(`
      SELECT LTRIM(RTRIM(p.Cliente)) AS clienteCod,
             LTRIM(RTRIM(p.Boleta)) AS boleta,
             LTRIM(RTRIM(p.Fechora)) AS fechora,
             p.Total AS total,
             p.Cant AS cant,
             'pendiente' AS origen
      FROM [${dbPedidos}].dbo.Pedidos p
      WHERE p.Tipo = 'V'
        AND p.Cliente IN (${ordPlaceholders})
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
    `);

    const transReq = pool.request();
    allClientIds.forEach((id, i) => transReq.input(`t${i}`, id.padStart(7, " ")));
    transReq.input("since", sinceStr);
    transReq.input("until", untilStr);
    const transPlaceholders = allClientIds.map((_, i) => `@t${i}`).join(",");

    const transResult = await transReq.query(`
      SELECT LTRIM(RTRIM(t.Cliente)) AS clienteCod,
             LTRIM(RTRIM(t.Boleta)) AS boleta,
             LTRIM(RTRIM(t.Fechora)) AS fechora,
             t.Total AS total,
             t.Cant AS cant,
             'facturado' AS origen
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo IN ('N', 'V')
        AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
        AND t.Cliente IN (${transPlaceholders})
        AND t.Fechora >= @since
        AND t.Fechora < @until
    `);

    // Merge both sources
    const allOrders = [...ordersResult.recordset, ...transResult.recordset];

    // Group orders by client
    const ordersByClient = new Map<string, { boleta: string; fechora: string; total: number; cant: number; origen: string }[]>();
    for (const o of allOrders) {
      if (!ordersByClient.has(o.clienteCod)) ordersByClient.set(o.clienteCod, []);
      ordersByClient.get(o.clienteCod)!.push(o);
    }

    // Build result
    const clients = clientsResult.recordset.map((c: { cod: string; nombre: string; calle: string; numero: string; telefono: string }) => {
      const orders = ordersByClient.get(c.cod) || [];
      const hasOrder = orders.length > 0;
      const latestOrder = hasOrder ? orders.sort((a, b) => b.fechora.localeCompare(a.fechora))[0] : null;
      const address = [c.calle, c.numero].filter(Boolean).join(" ");

      const hasPendiente = orders.some((o) => o.origen === "pendiente");
      const hasFacturado = orders.some((o) => o.origen === "facturado");
      // Status: facturado > pendiente > none
      let status: "facturado" | "pendiente" | "none";
      if (hasFacturado) {
        status = "facturado";
      } else if (hasPendiente) {
        status = "pendiente";
      } else {
        status = "none";
      }

      return {
        cod: c.cod,
        nombre: c.nombre,
        address,
        telefono: c.telefono,
        hasOrder,
        status,
        orderCount: orders.length,
        lastOrderTotal: latestOrder?.total || 0,
        lastOrderDate: latestOrder ? `${latestOrder.fechora.slice(6, 8)}/${latestOrder.fechora.slice(4, 6)}/${latestOrder.fechora.slice(0, 4)}` : null,
      };
    });

    // Sort: red first, then yellow, then green
    const statusOrder: Record<string, number> = { none: 0, pendiente: 1, facturado: 2 };
    clients.sort((a: { status: string; nombre: string }, b: { status: string; nombre: string }) => {
      const diff = (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0);
      if (diff !== 0) return diff;
      return a.nombre.localeCompare(b.nombre);
    });

    const facturado = clients.filter((c: { status: string }) => c.status === "facturado").length;
    const pendiente = clients.filter((c: { status: string }) => c.status === "pendiente").length;
    const sinPedido = clients.filter((c: { status: string }) => c.status === "none").length;

    return NextResponse.json({
      clients,
      day,
      today: getTodayDay(),
      availableDays: DAYS,
      stats: { total: clients.length, facturado, pendiente, sinPedido },
    });
  } catch (error) {
    console.error("Reparto error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
