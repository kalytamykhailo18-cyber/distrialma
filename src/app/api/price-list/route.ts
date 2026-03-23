import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

export async function GET() {
  try {
    const pool = await getPool();
    const db = getDbName("productos");

    const [hideOutOfStock, stockThreshold] = await Promise.all([
      getSetting("hide_out_of_stock"),
      getSetting("stock_threshold"),
    ]);

    const threshold = parseInt(stockThreshold || "0") || 0;
    const stockFilter = hideOutOfStock === "true" ? `AND s.Stk > ${threshold}` : "";

    const hiddenCats = await prisma.hiddenCategory.findMany();
    const hiddenIds = hiddenCats.map((h) => h.categoryId);

    let hiddenFilter = "";
    if (hiddenIds.length > 0) {
      const placeholders = hiddenIds.map((_, i) => `@hidden${i}`).join(",");
      hiddenFilter = `AND LTRIM(RTRIM(p.Rubro)) NOT IN (${placeholders})`;
    }

    const req = pool.request();
    hiddenIds.forEach((id, i) => req.input(`hidden${i}`, id));

    const result = await req.query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS category,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS brand,
        LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unit,
        s.Precio2 AS precioMayorista,
        s.Precio4 AS precioCajaCerrada,
        LTRIM(RTRIM(ISNULL(p.Palabra3, ''))) AS cantidadPorCaja
      FROM [${db}].dbo.Productos p
      JOIN [${db}].dbo.Stock s ON s.CodProducto = p.Cod
      LEFT JOIN [${db}].dbo.Rubros r ON r.Cod = p.Rubro
      LEFT JOIN [${db}].dbo.Marcas m ON m.Cod = p.Marca
      WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND s.Precio2 > 0
        ${hiddenFilter}
        ${stockFilter}
      ORDER BY r.[Desc], p.Nombre
    `);

    return NextResponse.json({ products: result.recordset });
  } catch (error) {
    console.error("Price list error:", error);
    return NextResponse.json({ products: [] });
  }
}
