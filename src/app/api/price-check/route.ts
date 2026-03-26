import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q || q.length < 2) {
    return NextResponse.json({ product: null });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Try exact barcode or SKU first, then name search
    const result = await pool.request().input("q", q).input("pattern", `%${q}%`).query(`
      SELECT TOP 1
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS category,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS brand,
        LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unit,
        ISNULL(s.Precio, 0) AS precioMinorista,
        ISNULL(s.Precio2, 0) AS precioMayorista,
        ISNULL(s.Precio4, 0) AS precioCajaCerrada,
        ISNULL(s.Precio5, 0) AS precioLista5,
        ISNULL(s.Stk, 0) AS stock,
        LTRIM(RTRIM(ISNULL(p.Palabra3, ''))) AS cantidadPorCaja
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND (
          LTRIM(RTRIM(ISNULL(p.Codbar, ''))) = @q
          OR LTRIM(RTRIM(p.Cod)) = @q
          OR LTRIM(RTRIM(p.Nombre)) LIKE @pattern
        )
      ORDER BY
        CASE
          WHEN LTRIM(RTRIM(ISNULL(p.Codbar, ''))) = @q THEN 0
          WHEN LTRIM(RTRIM(p.Cod)) = @q THEN 1
          ELSE 2
        END,
        p.Nombre
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ product: null });
    }

    return NextResponse.json({ product: result.recordset[0] });
  } catch (error) {
    console.error("Price check error:", error);
    return NextResponse.json({ product: null });
  }
}
