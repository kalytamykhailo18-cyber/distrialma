import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SITE_URL = "https://distrialma.com.ar";
const STORE_NAME = "Distrialma";
const CURRENCY = "ARS";

export async function GET() {
  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Get all visible products with Precio2 > 0
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS category,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS brand,
        ISNULL(s.Precio2, 0) AS price,
        ISNULL(s.Stk, 0) AS stock
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND s.Precio2 > 0
    `);

    // Get product images from PostgreSQL
    const skus = result.recordset.map((r: { sku: string }) => r.sku);
    const images = await prisma.productImage.findMany({
      where: { sku: { in: skus } },
      orderBy: { position: "asc" },
    });
    const imageMap = new Map<string, string>();
    for (const img of images) {
      if (!imageMap.has(img.sku)) imageMap.set(img.sku, img.filename);
    }

    // Build XML feed
    const items = result.recordset.map((p: {
      sku: string; name: string; barcode: string; category: string;
      brand: string; price: number; stock: number;
    }) => {
      const imageUrl = imageMap.get(p.sku);
      const availability = p.stock > 0 ? "in_stock" : "out_of_stock";
      const link = `${SITE_URL}/productos/${encodeURIComponent(p.sku)}`;

      return `    <item>
      <g:id>${escXml(p.sku)}</g:id>
      <title>${escXml(p.name)}</title>
      <link>${escXml(link)}</link>
      ${imageUrl ? `<g:image_link>${escXml(imageUrl)}</g:image_link>` : ""}
      <g:price>${p.price.toFixed(2)} ${CURRENCY}</g:price>
      <g:availability>${availability}</g:availability>
      <g:condition>new</g:condition>
      ${p.barcode ? `<g:gtin>${escXml(p.barcode)}</g:gtin>` : `<g:identifier_exists>false</g:identifier_exists>`}
      ${p.brand ? `<g:brand>${escXml(p.brand)}</g:brand>` : ""}
      ${p.category ? `<g:product_type>${escXml(p.category)}</g:product_type>` : ""}
    </item>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
  <channel>
    <title>${STORE_NAME}</title>
    <link>${SITE_URL}</link>
    <description>Productos de ${STORE_NAME}</description>
${items}
  </channel>
</rss>`;

    return new NextResponse(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Google feed error:", error);
    return NextResponse.json({ error: "Error generando feed" }, { status: 500 });
  }
}

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
