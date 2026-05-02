import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");
    const dbPed = getDbName("pedidos");

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const todayStr = now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, "0")
      + String(now.getDate()).padStart(2, "0") + "000000";

    // Today's sales
    const ventas = await pool.request().input("desde", todayStr).query(`
      SELECT COUNT(DISTINCT Boleta) AS tickets, SUM(ISNULL(Total, 0)) AS total,
        SUM(ISNULL(Efectivo, 0)) AS efectivo, SUM(ISNULL(Tarjeta, 0)) AS tarjeta
      FROM [${dbTransas}].dbo.Transas
      WHERE Tipo = 'V' AND (LTRIM(RTRIM(Itm)) = '0' OR LTRIM(RTRIM(Itm)) = '')
        AND Fechora >= @desde
        AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
    `);
    const v = ventas.recordset[0] || { tickets: 0, total: 0, efectivo: 0, tarjeta: 0 };

    // Pending web orders
    const pedidos = await pool.request().query(`
      SELECT COUNT(DISTINCT Boleta) AS cnt
      FROM [${dbPed}].dbo.Pedidos
      WHERE Tipo = 'V'
        AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
        AND Fechora >= CONVERT(VARCHAR(8), DATEADD(DAY, -7, GETDATE()), 112) + '000000'
    `);

    // Stock alerts (products below 3 days)
    const stockSince = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const stockSinceStr = stockSince.getFullYear().toString()
      + String(stockSince.getMonth() + 1).padStart(2, "0")
      + String(stockSince.getDate()).padStart(2, "0") + "000000";

    const stockAlerts = await pool.request().input("desde", stockSinceStr).query(`
      SELECT COUNT(*) AS cnt FROM (
        SELECT LTRIM(RTRIM(s.CodProducto)) AS sku, s.Stk,
          (SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
           WHERE t.Producto = s.CodProducto AND t.Tipo = 'I' AND t.Fechora >= @desde
           AND t.Cant > 0 AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '')) AS vendido
        FROM [${dbProd}].dbo.Stock s
        JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        WHERE LTRIM(RTRIM(s.Deposito)) = '0' AND s.Precio2 > 0 AND s.Stk > 0
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      ) sub WHERE vendido > 0 AND Stk / (vendido / 14.0) <= 3
    `);

    // Unread WhatsApp chats
    const unreadChats = await prisma.whatsAppChat.count({ where: { unread: { gt: 0 } } });

    // Today's deliveries
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const deliveries = await prisma.deliveryStatus.groupBy({
      by: ["estado"],
      where: { fecha: today },
      _count: true,
    });
    const entregados = deliveries.find((d) => d.estado === "entregado")?._count || 0;
    const pendientesReparto = deliveries.find((d) => d.estado === "pendiente")?._count || 0;

    // Bot status
    let botOk = false;
    try {
      const r = await fetch("http://127.0.0.1:3099/status");
      const s = await r.json();
      botOk = s.status === "conectado" || s.status === "autenticado";
    } catch {}

    return NextResponse.json({
      ventas: {
        tickets: Number(v.tickets),
        total: Number(v.total),
        efectivo: Number(v.efectivo),
        tarjeta: Number(v.tarjeta),
      },
      pedidosWeb: Number(pedidos.recordset[0]?.cnt || 0),
      stockCritico: Number(stockAlerts.recordset[0]?.cnt || 0),
      whatsappSinLeer: unreadChats,
      reparto: { entregados, pendientes: pendientesReparto },
      botConectado: botOk,
      fecha: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`,
      hora: `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`,
    });
  } catch (error) {
    console.error("Resumen diario error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
