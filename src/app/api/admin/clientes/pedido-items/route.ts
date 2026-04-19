import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const boleta = req.nextUrl.searchParams.get("boleta");
  if (!boleta) return NextResponse.json({ error: "boleta requerida" }, { status: 400 });

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbProd = getDbName("productos");

    const result = await pool.request().input("boleta", boleta.padStart(9, " ")).query(`
      SELECT
        LTRIM(RTRIM(p.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
        p.Cant AS cantidad,
        p.Precio AS precio,
        p.Impo AS impo,
        LTRIM(RTRIM(ISNULL(pr.Unidad, ''))) AS unidad,
        p.ListaPrecio AS listaPrecio
      FROM [${dbPedidos}].dbo.Pedidos p
      LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = p.Producto
      WHERE p.Boleta = @boleta AND p.Tipo = 'I'
      ORDER BY CAST(p.Itm AS INT)
    `);

    const LISTA_LABELS: Record<number, string> = { 1: "Minorista", 2: "Mayorista", 3: "Especial", 4: "Caja Cerrada", 5: "PedidosYa" };

    return NextResponse.json({
      items: result.recordset.map((i: { sku: string; nombre: string; cantidad: number; precio: number; impo: number; unidad: string; listaPrecio: number }) => ({
        sku: i.sku,
        nombre: i.nombre,
        cantidad: Number(i.cantidad),
        precio: Number(i.precio),
        impo: Number(i.impo),
        unidad: i.unidad,
        listaPrecio: Number(i.listaPrecio) || 0,
        listaLabel: LISTA_LABELS[Number(i.listaPrecio)] || `Lista ${i.listaPrecio}`,
      })),
    });
  } catch (error) {
    console.error("Pedido items error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
