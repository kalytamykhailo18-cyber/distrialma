import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbProductos = getDbName("productos");
    const dbClientes = getDbName("clientes");

    // Get pending order headers (Tipo=V, Filler1=WEB, not annulled)
    const headers = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Nroped)) AS nroped,
        LTRIM(RTRIM(p.Fechora)) AS fechora,
        LTRIM(RTRIM(p.Cliente)) AS clienteCod,
        LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS clienteNombre,
        LTRIM(RTRIM(ISNULL(p.Observaciones, ''))) AS notas,
        p.Total AS total,
        p.Cant AS totalCant
      FROM [${dbPedidos}].dbo.Pedidos p
      WHERE p.Tipo = 'V'
        AND LTRIM(RTRIM(ISNULL(p.Filler1, ''))) = 'WEB'
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
      ORDER BY p.Fechora DESC
    `);

    // Get all items for these orders
    const items = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS productName,
        p.Cant AS cant,
        p.Precio AS precio,
        p.Impo AS impo,
        LTRIM(RTRIM(ISNULL(pr.Unidad, ''))) AS unit
      FROM [${dbPedidos}].dbo.Pedidos p
      LEFT JOIN [${dbProductos}].dbo.Productos pr ON pr.Cod = p.Producto
      WHERE p.Tipo = 'I'
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
    `);

    // Get client delivery days and addresses
    const clientCods = Array.from(new Set(headers.recordset.map((h: { clienteCod: string }) => h.clienteCod)));
    const clientInfo: Record<string, { telefono: string; direccion: string }> = {};

    if (clientCods.length > 0) {
      const placeholders = clientCods.map((_, i) => `@c${i}`).join(",");
      const req = pool.request();
      clientCods.forEach((cod, i) => req.input(`c${i}`, cod.padStart(7, " ")));
      const clients = await req.query(`
        SELECT
          LTRIM(RTRIM(Cod)) AS cod,
          LTRIM(RTRIM(ISNULL(Calle, ''))) + ' ' + LTRIM(RTRIM(ISNULL(Nume, ''))) AS direccion,
          LTRIM(RTRIM(ISNULL(TelClave3, ISNULL(TelClave1, '')))) AS telefono
        FROM [${dbClientes}].dbo.Clientes
        WHERE Cod IN (${placeholders})
      `);
      for (const c of clients.recordset) {
        clientInfo[c.cod] = { telefono: c.telefono, direccion: c.direccion.trim() };
      }
    }

    // Group items by boleta
    const itemsByBoleta = new Map<string, Array<{ sku: string; productName: string; cant: number; precio: number; impo: number; unit: string }>>();
    for (const item of items.recordset) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    const orders = headers.recordset.map((h) => ({
      boleta: h.boleta,
      nroped: h.nroped,
      fechora: h.fechora,
      clienteCod: h.clienteCod,
      clienteNombre: h.clienteNombre,
      telefono: clientInfo[h.clienteCod]?.telefono || "",
      direccion: clientInfo[h.clienteCod]?.direccion || "",
      notas: h.notas,
      total: h.total,
      totalCant: h.totalCant,
      items: itemsByBoleta.get(h.boleta) || [],
    }));

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Error fetching picking orders:", error);
    return NextResponse.json({ error: "Error al cargar pedidos" }, { status: 500 });
  }
}
