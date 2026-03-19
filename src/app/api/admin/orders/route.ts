import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";

export async function GET() {
  try {
    const pool = await getPool();
    const dbPed = getDbName("pedidos");
    const dbCli = getDbName("clientes");
    const dbProd = getDbName("productos");

    // Get order headers (Tipo=V) with client zona
    const headers = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Nroped)) AS nroped,
        LTRIM(RTRIM(p.Fechora)) AS fechora,
        p.Cant AS totalCant,
        p.Total AS total,
        LTRIM(RTRIM(p.Cliente)) AS clienteCod,
        LTRIM(RTRIM(p.Nombre)) AS clienteNombre,
        LTRIM(RTRIM(ISNULL(p.Observaciones,''))) AS notas,
        LTRIM(RTRIM(ISNULL(p.Telefono,''))) AS telefono,
        LTRIM(RTRIM(ISNULL(z.[Desc],''))) AS deliveryDay
      FROM [${dbPed}].dbo.Pedidos p
      LEFT JOIN [${dbCli}].dbo.Clientes c ON c.Cod = p.Cliente
      LEFT JOIN [${dbCli}].dbo.Zonas z ON z.Cod = c.Zona
      WHERE p.Tipo = 'V'
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
      ORDER BY p.Fechora DESC
    `);

    // Get all item rows (Tipo=I)
    const items = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(pr.Nombre,''))) AS productName,
        p.Cant AS cant,
        p.Precio AS precio,
        p.Impo AS impo,
        p.ListaPrecio AS listaPrecio
      FROM [${dbPed}].dbo.Pedidos p
      LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = p.Producto
      WHERE p.Tipo = 'I'
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
    `);

    // Group items by boleta
    const itemsByBoleta = new Map<string, Array<{ boleta: string; sku: string; productName: string; cant: number; precio: number; impo: number; listaPrecio: number }>>();
    for (const item of items.recordset) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    // Build orders
    const orders = headers.recordset.map((h) => ({
      boleta: h.boleta,
      nroped: h.nroped,
      date: h.fechora,
      totalCant: h.totalCant,
      total: h.total,
      clienteCod: h.clienteCod,
      clienteNombre: h.clienteNombre,
      notas: h.notas,
      telefono: h.telefono,
      deliveryDay: h.deliveryDay || "Sin asignar",
      items: (itemsByBoleta.get(h.boleta) || []).map((i) => ({
        sku: i.sku,
        name: i.productName,
        cant: i.cant,
        precio: i.precio,
        impo: i.impo,
        listaPrecio: i.listaPrecio,
      })),
    }));

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Error al cargar pedidos" },
      { status: 500 }
    );
  }
}
