import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") || "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Get markup setting
    const markupSetting = await prisma.setting.findUnique({ where: { key: "vendedor_markup" } });
    const markup = parseFloat(markupSetting?.value || "3");
    const factor = 1 + markup / 100;

    const result = await pool
      .request()
      .input("q", `%${q}%`)
      .query(`
        SELECT TOP 30
          LTRIM(RTRIM(p.Cod)) AS sku,
          LTRIM(RTRIM(p.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
          LTRIM(RTRIM(ISNULL(p.Rubro, ''))) AS rubro,
          ISNULL(s.Precio2, 0) AS mayorista,
          ISNULL(s.Stk, 0) AS stock
        FROM [${dbProd}].dbo.Productos p
        LEFT JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
        WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND s.Precio2 > 0
          AND (p.Nombre LIKE @q OR p.Cod LIKE @q OR p.Codbar LIKE @q)
        ORDER BY p.Nombre
      `);

    // Get promotional flags
    const promocionales = await prisma.articuloPromocional.findMany();
    const promoSet = new Set(promocionales.map((p) => p.sku));

    const products = result.recordset.map((p: { sku: string; nombre: string; barcode: string; rubro: string; mayorista: number; stock: number }) => ({
      sku: p.sku,
      name: p.nombre,
      barcode: p.barcode,
      rubro: p.rubro,
      mayorista: Number(p.mayorista),
      precioVenta: Math.round(Number(p.mayorista) * factor),
      stock: Number(p.stock),
      promocional: promoSet.has(p.sku),
    }));

    return NextResponse.json({ products, markup });
  } catch (error) {
    console.error("Error searching products:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
