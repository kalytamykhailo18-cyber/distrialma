import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Get price changes from the last 3 days
    const since = new Date();
    since.setDate(since.getDate() - 3);

    const changes = await prisma.priceChange.findMany({
      where: { detectedAt: { gte: since } },
      orderBy: { detectedAt: "desc" },
    });

    if (changes.length === 0) {
      return NextResponse.json({ products: [] });
    }

    // Get unique SKUs
    const skuSet = new Set(changes.map((c) => c.sku));
    const skus = Array.from(skuSet).slice(0, 12); // max 12

    // Fetch product details + images
    const pool = await getPool();
    const db = getDbName("productos");

    const placeholders = skus.map((_, i) => `@sku${i}`).join(",");
    const req = pool.request();
    skus.forEach((sku, i) => req.input(`sku${i}`, sku.padStart(7, " ")));

    const result = await req.query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        s.Precio2 AS precioMayorista,
        s.Precio4 AS precioCajaCerrada
      FROM [${db}].dbo.Productos p
      JOIN [${db}].dbo.Stock s ON s.CodProducto = p.Cod
      WHERE p.Cod IN (${placeholders})
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND s.Precio2 > 0
    `);

    const productMap = new Map(
      result.recordset.map((p: { sku: string; name: string; precioMayorista: number; precioCajaCerrada: number }) => [p.sku, p])
    );

    const images = await prisma.productImage.findMany({
      where: { sku: { in: skus } },
      orderBy: { position: "asc" },
    });
    const imageMap = new Map<string, string>();
    for (const img of images) {
      if (!imageMap.has(img.sku)) imageMap.set(img.sku, img.filename);
    }

    // Build product list with change info
    const products = skus
      .map((sku) => {
        const prod = productMap.get(sku);
        if (!prod) return null;
        const change = changes.find((c) => c.sku === sku && c.field === "precio2");
        return {
          sku,
          name: prod.name,
          precioMayorista: prod.precioMayorista,
          oldPrice: change ? Number(change.oldPrice) : null,
          image: imageMap.get(sku) || null,
        };
      })
      .filter(Boolean);

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Error fetching price news:", error);
    return NextResponse.json({ products: [] });
  }
}
