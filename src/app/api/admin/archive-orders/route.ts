import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

// GET — list archived orders
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clienteCod = searchParams.get("cliente") || undefined;
  const days = parseInt(searchParams.get("days") || "30");

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.getFullYear().toString()
    + String(since.getMonth() + 1).padStart(2, "0")
    + String(since.getDate()).padStart(2, "0")
    + "000000";

  const orders = await prisma.archivedOrder.findMany({
    where: {
      ...(clienteCod ? { clienteCod } : {}),
      fechora: { gte: sinceStr },
    },
    include: { items: true },
    orderBy: { fechora: "desc" },
  });

  return NextResponse.json({ orders });
}

// POST — archive orders from PunTouch and delete them
export async function POST(req: NextRequest) {
  const { clienteCod, cronSecret } = (await req.json()) as {
    clienteCod: string;
    cronSecret?: string;
  };

  // Allow access from admin session OR cron secret
  if (cronSecret !== process.env.NEXTAUTH_SECRET) {
    // Check admin session if no cron secret
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth");
    const session = await getServerSession(authOptions);
    if (!session?.user || (session.user as { role?: string }).role !== "admin") {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  if (!clienteCod) {
    return NextResponse.json({ error: "clienteCod requerido" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbProductos = getDbName("productos");

    // Get order headers
    const headers = await pool
      .request()
      .input("cliente", clienteCod.padStart(7, " "))
      .query(`
        SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Nroped)) AS nroped,
          LTRIM(RTRIM(p.Fechora)) AS fechora,
          LTRIM(RTRIM(p.Cliente)) AS clienteCod,
          LTRIM(RTRIM(p.Nombre)) AS clienteName,
          p.Cant AS totalCant,
          p.Total AS total,
          LTRIM(RTRIM(ISNULL(p.Observaciones,''))) AS notas
        FROM [${dbPedidos}].dbo.Pedidos p
        WHERE p.Tipo = 'V' AND p.Cliente = @cliente
          AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
        ORDER BY p.Fechora DESC
      `);

    if (headers.recordset.length === 0) {
      return NextResponse.json({ archived: 0, deleted: 0, message: "No hay pedidos pendientes" });
    }

    // Get items
    const items = await pool
      .request()
      .input("cliente", clienteCod.padStart(7, " "))
      .query(`
        SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Producto)) AS sku,
          LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS productName,
          p.Cant AS cant,
          p.Precio AS precio,
          p.Impo AS impo,
          p.ListaPrecio AS listaPrecio
        FROM [${dbPedidos}].dbo.Pedidos p
        LEFT JOIN [${dbProductos}].dbo.Productos pr ON pr.Cod = p.Producto
        WHERE p.Tipo = 'I' AND p.Cliente = @cliente
          AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
      `);

    // Group items by boleta
    const itemsByBoleta = new Map<string, Array<{ boleta: string; sku: string; productName: string; cant: number; precio: number; impo: number; listaPrecio: number }>>();
    for (const item of items.recordset) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    // Store in PostgreSQL
    let archived = 0;
    for (const h of headers.recordset) {
      const orderItems = itemsByBoleta.get(h.boleta) || [];
      await prisma.archivedOrder.create({
        data: {
          boleta: h.boleta,
          nroped: h.nroped,
          fechora: h.fechora,
          clienteCod: h.clienteCod,
          clienteName: h.clienteName,
          totalCant: h.totalCant,
          total: h.total,
          notas: h.notas || null,
          items: {
            create: orderItems.map((i) => ({
              sku: i.sku,
              productName: i.productName,
              cant: i.cant,
              precio: i.precio,
              impo: i.impo,
              listaPrecio: i.listaPrecio,
            })),
          },
        },
      });
      archived++;
    }

    // Delete from PunTouch
    const del = await pool
      .request()
      .input("cliente", clienteCod.padStart(7, " "))
      .query(`
        DELETE FROM [${dbPedidos}].dbo.Pedidos
        WHERE Cliente = @cliente
          AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
      `);

    return NextResponse.json({
      archived,
      deleted: del.rowsAffected[0],
      message: `${archived} pedidos archivados y eliminados de PunTouch`,
    });
  } catch (error) {
    console.error("Archive error:", error);
    return NextResponse.json({ error: "Error al archivar pedidos" }, { status: 500 });
  }
}
