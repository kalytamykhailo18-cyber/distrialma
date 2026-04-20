import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: search products for POS
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const q = req.nextUrl.searchParams.get("q") || "";
  const barcode = req.nextUrl.searchParams.get("barcode") || "";

  if (!q && !barcode) {
    return NextResponse.json({ products: [] });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    let query: string;
    const request = pool.request();

    if (barcode) {
      // Exact barcode match
      request.input("barcode", barcode.trim());
      query = `
        SELECT TOP 1
          LTRIM(RTRIM(p.Cod)) AS sku,
          LTRIM(RTRIM(p.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unidad,
          ISNULL(s.Precio, 0) AS precio1,
          ISNULL(s.Precio2, 0) AS precio2,
          ISNULL(s.Precio3, 0) AS precio3,
          ISNULL(s.Precio4, 0) AS precio4,
          ISNULL(s.Precio5, 0) AS precio5,
          ISNULL(s.Stk, 0) AS stock,
          LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS codBarra,
          LTRIM(RTRIM(ISNULL(p.Filler1, ''))) AS filler1,
          LTRIM(RTRIM(ISNULL(p.Filler2, ''))) AS filler2,
          ISNULL(TRY_CAST(LTRIM(RTRIM(p.Palabra3)) AS INT), 0) AS cantPorCaja
        FROM [${dbProd}].dbo.Productos p
        OUTER APPLY (
          SELECT TOP 1 s.Precio, s.Precio2, s.Precio3, s.Precio4, s.Precio5, s.Stk
          FROM [${dbProd}].dbo.Stock s
          WHERE s.CodProducto = p.Cod
            AND LTRIM(RTRIM(s.Deposito)) = '0'
            AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        ) s
        WHERE LTRIM(RTRIM(p.Codbar)) COLLATE Modern_Spanish_CI_AS = @barcode
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      `;
    } else {
      // Search by name or SKU
      request.input("q", `%${q.trim()}%`);
      request.input("exact", q.trim().padStart(7, " "));
      query = `
        SELECT TOP 20
          LTRIM(RTRIM(p.Cod)) AS sku,
          LTRIM(RTRIM(p.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unidad,
          ISNULL(s.Precio, 0) AS precio1,
          ISNULL(s.Precio2, 0) AS precio2,
          ISNULL(s.Precio3, 0) AS precio3,
          ISNULL(s.Precio4, 0) AS precio4,
          ISNULL(s.Precio5, 0) AS precio5,
          ISNULL(s.Stk, 0) AS stock,
          LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS codBarra,
          LTRIM(RTRIM(ISNULL(p.Filler1, ''))) AS filler1,
          LTRIM(RTRIM(ISNULL(p.Filler2, ''))) AS filler2,
          ISNULL(TRY_CAST(LTRIM(RTRIM(p.Palabra3)) AS INT), 0) AS cantPorCaja
        FROM [${dbProd}].dbo.Productos p
        OUTER APPLY (
          SELECT TOP 1 s.Precio, s.Precio2, s.Precio3, s.Precio4, s.Precio5, s.Stk
          FROM [${dbProd}].dbo.Stock s
          WHERE s.CodProducto = p.Cod
            AND LTRIM(RTRIM(s.Deposito)) = '0'
            AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        ) s
        WHERE (p.Nombre COLLATE Modern_Spanish_CI_AS LIKE @q OR p.Cod = @exact)
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        ORDER BY CASE WHEN p.Cod = @exact THEN 0 ELSE 1 END, p.Nombre
      `;
    }

    const result = await request.query(query);

    return NextResponse.json({
      products: result.recordset.map((p: Record<string, unknown>) => ({
        sku: p.sku as string,
        nombre: p.nombre as string,
        unidad: p.unidad as string,
        precios: {
          1: Number(p.precio1),
          2: Number(p.precio2),
          3: Number(p.precio3),
          4: Number(p.precio4),
          5: Number(p.precio5),
        },
        stock: Number(p.stock),
        codBarra: p.codBarra as string,
        filler1: p.filler1 as string,
        filler2: p.filler2 as string,
        cantPorCaja: Number(p.cantPorCaja),
      })),
    });
  } catch (error) {
    console.error("POS product search error:", error);
    return NextResponse.json({ error: "Error al buscar productos" }, { status: 500 });
  }
}
