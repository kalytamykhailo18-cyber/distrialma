import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = session.user as { clientId?: string; role?: string };
  if (!user.clientId || user.role === "admin" || user.role === "staff") {
    return NextResponse.json({ orders: [] });
  }

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbProductos = getDbName("productos");

    // Get order headers for this client
    const headers = await pool
      .request()
      .input("cliente", user.clientId.padStart(7, " "))
      .query(
        `SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Nroped)) AS nroped,
          LTRIM(RTRIM(p.Fechora)) AS fechora,
          p.Cant AS totalCant,
          p.Total AS total,
          LTRIM(RTRIM(ISNULL(p.Observaciones,''))) AS notas,
          LTRIM(RTRIM(ISNULL(p.Filler1,''))) AS estado
        FROM [${dbPedidos}].dbo.Pedidos p
        WHERE p.Tipo = 'V'
          AND p.Cliente = @cliente
          AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
        ORDER BY p.Fechora DESC`
      );

    // Get items for this client's orders
    const items = await pool
      .request()
      .input("cliente", user.clientId.padStart(7, " "))
      .query(
        `SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Producto)) AS sku,
          LTRIM(RTRIM(ISNULL(pr.Nombre,''))) AS name,
          p.Cant AS cant,
          p.Precio AS precio,
          p.Impo AS impo
        FROM [${dbPedidos}].dbo.Pedidos p
        LEFT JOIN [${dbProductos}].dbo.Productos pr ON pr.Cod = p.Producto
        WHERE p.Tipo = 'I'
          AND p.Cliente = @cliente
          AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')`
      );

    const itemsByBoleta = new Map<string, Array<{ sku: string; name: string; cant: number; precio: number; impo: number }>>();
    for (const item of items.recordset) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    const orders = headers.recordset.map((h) => ({
      boleta: h.boleta,
      nroped: h.nroped,
      date: h.fechora,
      totalCant: h.totalCant,
      total: h.total,
      notas: h.notas,
      estado: h.estado || "Pendiente",
      items: itemsByBoleta.get(h.boleta) || [],
    }));

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Error fetching client orders:", error);
    return NextResponse.json(
      { error: "Error al cargar pedidos" },
      { status: 500 }
    );
  }
}
