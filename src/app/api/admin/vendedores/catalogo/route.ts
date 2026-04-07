import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const rubros = req.nextUrl.searchParams.get("rubros") || ""; // comma-separated
  const marcas = req.nextUrl.searchParams.get("marcas") || "";
  const conStock = req.nextUrl.searchParams.get("conStock") === "1";
  const lista = req.nextUrl.searchParams.get("lista") || "vendedor"; // vendedor | mayorista | especial

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Get markup setting
    const markupSetting = await prisma.setting.findUnique({ where: { key: "vendedor_markup" } });
    const markup = parseFloat(markupSetting?.value || "3");
    const factor = 1 + markup / 100;

    // Build WHERE clause
    let where = "WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL) AND s.Precio2 > 0 AND LTRIM(RTRIM(s.Deposito)) = '0'";
    if (conStock) where += " AND s.Stk > 0";
    if (rubros) {
      const list = rubros.split(",").map((r) => `'${r.trim()}'`).join(",");
      where += ` AND LTRIM(RTRIM(p.Rubro)) IN (${list})`;
    }
    if (marcas) {
      const list = marcas.split(",").map((m) => `'${m.trim()}'`).join(",");
      where += ` AND LTRIM(RTRIM(p.Marca)) IN (${list})`;
    }

    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        LTRIM(RTRIM(p.Rubro)) AS rubroCod,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
        LTRIM(RTRIM(p.Marca)) AS marcaCod,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
        s.Precio2 AS mayorista,
        ISNULL(s.Precio3, 0) AS especial,
        s.Stk AS stock
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      ${where}
      ORDER BY r.[Desc], p.Nombre
    `);

    const products = result.recordset;
    const skus = products.map((p) => p.sku);

    // Get first image per SKU
    const images = await prisma.productImage.findMany({
      where: { sku: { in: skus } },
      orderBy: { position: "asc" },
    });
    const imageMap = new Map<string, string>();
    for (const img of images) {
      if (!imageMap.has(img.sku)) imageMap.set(img.sku, img.filename);
    }

    // Get rubros and marcas that actually have visible products
    const [allRubros, allMarcas] = await Promise.all([
      pool.request().query(`
        SELECT LTRIM(RTRIM(r.Cod)) AS cod, LTRIM(RTRIM(r.[Desc])) AS nombre
        FROM [${dbProd}].dbo.Rubros r
        WHERE r.[Desc] IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM [${dbProd}].dbo.Productos p
            JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
            WHERE LTRIM(RTRIM(p.Rubro)) = LTRIM(RTRIM(r.Cod))
              AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
              AND s.Precio2 > 0
          )
        ORDER BY r.[Desc]
      `),
      pool.request().query(`
        SELECT LTRIM(RTRIM(m.Cod)) AS cod, LTRIM(RTRIM(m.[Desc])) AS nombre
        FROM [${dbProd}].dbo.Marcas m
        WHERE m.[Desc] IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM [${dbProd}].dbo.Productos p
            JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
            WHERE LTRIM(RTRIM(p.Marca)) = LTRIM(RTRIM(m.Cod))
              AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
              AND s.Precio2 > 0
          )
        ORDER BY m.[Desc]
      `),
    ]);

    const priceFor = (p: { mayorista: number; especial: number }): number => {
      const may = Number(p.mayorista);
      const esp = Number(p.especial);
      if (lista === "mayorista") return Math.round(may);
      if (lista === "especial") return esp > 0 ? Math.round(esp) : Math.round(may);
      return Math.round(may * factor); // vendedor
    };

    // Filter out products without an especial price if "especial" lista is selected
    const filteredProducts = lista === "especial"
      ? products.filter((p) => Number(p.especial) > 0)
      : products;

    return NextResponse.json({
      markup,
      lista,
      products: filteredProducts.map((p) => ({
        sku: p.sku,
        name: p.name,
        rubro: p.rubro || "Sin rubro",
        marca: p.marca || "",
        barcode: p.barcode,
        mayorista: Number(p.mayorista),
        especial: Number(p.especial),
        precioVenta: priceFor(p),
        stock: Number(p.stock),
        image: imageMap.get(p.sku) || null,
      })),
      rubros: allRubros.recordset,
      marcas: allMarcas.recordset,
    });
  } catch (error) {
    console.error("Error generating catalog:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
