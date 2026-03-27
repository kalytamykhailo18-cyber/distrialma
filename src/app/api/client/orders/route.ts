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
    const dbTransas = getDbName("transas");
    const dbProductos = getDbName("productos");
    const clientePadded = user.clientId.padStart(7, " ");

    // Get web order headers (Pedidos)
    const webHeaders = await pool
      .request()
      .input("cliente", clientePadded)
      .query(
        `SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Nroped)) AS nroped,
          LTRIM(RTRIM(p.Fechora)) AS fechora,
          p.Cant AS totalCant,
          p.Total AS total,
          LTRIM(RTRIM(ISNULL(p.Observaciones,''))) AS notas,
          LTRIM(RTRIM(ISNULL(p.Filler1,''))) AS estado,
          'web' AS origen
        FROM [${dbPedidos}].dbo.Pedidos p
        WHERE p.Tipo = 'V'
          AND p.Cliente = @cliente
          AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
        ORDER BY p.Fechora DESC`
      );

    // Get PunTouch invoice headers (Transas)
    const invoiceHeaders = await pool
      .request()
      .input("cliente", clientePadded)
      .query(
        `SELECT TOP 30
          LTRIM(RTRIM(t.Boleta)) AS boleta,
          LTRIM(RTRIM(ISNULL(t.Nroped,''))) AS nroped,
          LTRIM(RTRIM(t.Fechora)) AS fechora,
          t.Cant AS totalCant,
          t.Total AS total,
          LTRIM(RTRIM(ISNULL(t.Observaciones,''))) AS notas,
          'Facturado' AS estado,
          'factura' AS origen
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo IN ('V', 'N')
          AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
          AND t.Cliente = @cliente
        ORDER BY t.Fechora DESC`
      );

    // Combine headers
    const allHeaders = [...webHeaders.recordset, ...invoiceHeaders.recordset]
      .sort((a, b) => (b.fechora || "").localeCompare(a.fechora || ""));

    // Get items for web orders
    const webItems = await pool
      .request()
      .input("cliente", clientePadded)
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

    // Get items for invoices
    const invoiceItems = await pool
      .request()
      .input("cliente", clientePadded)
      .query(
        `SELECT
          LTRIM(RTRIM(t.Boleta)) AS boleta,
          LTRIM(RTRIM(t.Producto)) AS sku,
          LTRIM(RTRIM(ISNULL(pr.Nombre,''))) AS name,
          t.Cant AS cant,
          t.Precio AS precio,
          t.Impo AS impo
        FROM [${dbTransas}].dbo.Transas t
        LEFT JOIN [${dbProductos}].dbo.Productos pr ON pr.Cod = t.Producto
        WHERE t.Tipo = 'I'
          AND t.Cliente = @cliente`
      );

    const itemsByBoleta = new Map<string, Array<{ sku: string; name: string; cant: number; precio: number; impo: number }>>();
    for (const item of [...webItems.recordset, ...invoiceItems.recordset]) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    const orders = allHeaders.map((h: { boleta: string; nroped: string; fechora: string; totalCant: number; total: number; notas: string; estado: string; origen: string }) => ({
      boleta: h.boleta,
      nroped: h.nroped,
      date: h.fechora,
      totalCant: h.totalCant,
      total: h.total,
      notas: h.notas,
      estado: h.estado || "Pendiente",
      origen: h.origen,
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
