import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ products: [] });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    const result = await pool.request().input("q", `%${q}%`).query(`
      SELECT TOP 20
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        LTRIM(RTRIM(ISNULL(p.Codbar,''))) AS barcode,
        ISNULL(s.Stk, 0) AS currentStock,
        LTRIM(RTRIM(ISNULL(p.Unidad,''))) AS unit
      FROM [${dbProd}].dbo.Productos p
      LEFT JOIN [${dbProd}].dbo.Stock s
        ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
      WHERE LTRIM(RTRIM(p.Nombre)) LIKE @q
         OR LTRIM(RTRIM(p.Cod)) LIKE @q
         OR LTRIM(RTRIM(ISNULL(p.Codbar,''))) LIKE @q
      ORDER BY p.Nombre
    `);

    return NextResponse.json({ products: result.recordset });
  } catch (error) {
    console.error("Error searching products:", error);
    return NextResponse.json(
      { error: "Error al buscar productos" },
      { status: 500 }
    );
  }
}
