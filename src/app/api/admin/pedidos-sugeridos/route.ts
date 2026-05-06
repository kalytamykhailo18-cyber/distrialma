import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const proveedorCod = searchParams.get("proveedor");
  const semanas = parseInt(searchParams.get("semanas") || "2");

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const dbTransas = getDbName("transas");

    // Date range for sales average
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const since = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000); // 4 weeks
    const sinceStr = since.getFullYear().toString()
      + String(since.getMonth() + 1).padStart(2, "0")
      + String(since.getDate()).padStart(2, "0") + "000000";

    // Build query — filter by proveedor if specified
    let provFilter = "";
    if (proveedorCod) {
      provFilter = `AND (LTRIM(RTRIM(s.Proveedor1)) = '${proveedorCod}' OR LTRIM(RTRIM(s.Proveedor2)) = '${proveedorCod}' OR LTRIM(RTRIM(s.Proveedor3)) = '${proveedorCod}')`;
    }

    const result = await pool.request().input("desde", sinceStr).query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad,
        s.Stk AS stock,
        s.Costo AS costo,
        LTRIM(RTRIM(ISNULL(s.Proveedor1, ''))) AS proveedor1,
        (SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
         WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Fechora >= @desde
         AND t.Cant > 0 AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '')) AS vendido4sem
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = '0'
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Precio2 > 0
        ${provFilter}
      ORDER BY p.Nombre
    `);

    const products = result.recordset
      .map((p: { sku: string; nombre: string; unidad: string; stock: number; costo: number; proveedor1: string; vendido4sem: number | null }) => {
        const vendido = Number(p.vendido4sem) || 0;
        const ventaSemanal = vendido / 4;
        const stock = Number(p.stock);
        const coberturaDias = ventaSemanal > 0 ? Math.round(stock / (ventaSemanal / 7) * 10) / 10 : 999;
        const sugerido = Math.max(0, Math.ceil(ventaSemanal * semanas - stock));
        return {
          sku: p.sku.trim(),
          nombre: p.nombre.trim(),
          unidad: p.unidad.trim(),
          stock: Math.round(stock * 100) / 100,
          costo: Number(p.costo),
          ventaSemanal: Math.round(ventaSemanal * 100) / 100,
          coberturaDias,
          sugerido,
          proveedor: p.proveedor1.trim(),
        };
      })
      .filter((p: { ventaSemanal: number }) => p.ventaSemanal > 0)
      .sort((a: { coberturaDias: number }, b: { coberturaDias: number }) => a.coberturaDias - b.coberturaDias);

    return NextResponse.json({ products, semanas });
  } catch (error) {
    console.error("Pedidos sugeridos error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
