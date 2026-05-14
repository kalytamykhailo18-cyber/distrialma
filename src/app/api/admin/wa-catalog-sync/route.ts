import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
const CATALOG_ID = process.env.WA_CATALOG_ID || "";
const SITE_URL = "https://distrialma.com.ar";
const BATCH_SIZE = 1000; // Meta API allows up to 1000 per batch

export async function POST(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!CATALOG_ID || !FB_PAGE_TOKEN) {
    return NextResponse.json({ error: "WA_CATALOG_ID or FB_PAGE_TOKEN not configured" }, { status: 500 });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Get all active products with Precio2 > 0
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
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

    // Get product images
    const skus = result.recordset.map((r: { sku: string }) => r.sku);
    const images = await prisma.productImage.findMany({
      where: { sku: { in: skus } },
      orderBy: { position: "asc" },
    });
    const imageMap = new Map<string, string>();
    for (const img of images) {
      if (!imageMap.has(img.sku)) imageMap.set(img.sku, img.filename);
    }

    // Only sync products that have images
    const products = result.recordset.filter((p: { sku: string }) => imageMap.has(p.sku));

    // Build batch requests
    const requests = products.map((p: {
      sku: string; name: string; category: string; brand: string; price: number; stock: number;
    }) => {
      const description = [p.name, p.brand, p.category].filter(Boolean).join(" — ");
      return {
        method: "UPDATE" as const,
        retailer_id: p.sku,
        data: {
          name: p.name.trim(),
          description,
          currency: "ARS",
          price: Math.round(p.price * 100), // Price in cents
          availability: p.stock > 0 ? "in stock" : "out of stock",
          url: `${SITE_URL}/productos/${encodeURIComponent(p.sku)}`,
          image_url: imageMap.get(p.sku)!,
          brand: p.brand || undefined,
          product_type: p.category || undefined,
          category: p.category || undefined,
        },
      };
    });

    // Send in batches
    let totalSynced = 0;
    const errors: string[] = [];

    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      const batch = requests.slice(i, i + BATCH_SIZE);
      try {
        const formData = new URLSearchParams();
        formData.set("requests", JSON.stringify(batch));
        formData.set("access_token", FB_PAGE_TOKEN);

        const res = await fetch(`https://graph.facebook.com/v25.0/${CATALOG_ID}/batch`, {
          method: "POST",
          body: formData,
        });
        const data = await res.json();

        if (data.handles) {
          totalSynced += batch.length;
        }
        if (data.validation_status) {
          for (const vs of data.validation_status) {
            if (vs.errors?.length > 0) {
              errors.push(`${vs.retailer_id}: ${vs.errors[0].message}`);
            }
          }
        }
      } catch (e) {
        errors.push(`Batch ${i}-${i + batch.length}: ${(e as Error).message}`);
      }
    }

    // Create/update collections by rubro
    const rubroMap = new Map<string, string[]>();
    for (const p of products) {
      const cat = (p as { category: string }).category;
      if (!cat) continue;
      if (!rubroMap.has(cat)) rubroMap.set(cat, []);
      rubroMap.get(cat)!.push((p as { sku: string }).sku);
    }

    // Get existing product sets
    let existingSets: { id: string; name: string }[] = [];
    try {
      const setsRes = await fetch(`https://graph.facebook.com/v25.0/${CATALOG_ID}/product_sets?fields=id,name&limit=100&access_token=${FB_PAGE_TOKEN}`);
      const setsData = await setsRes.json();
      existingSets = setsData.data || [];
    } catch { /* ignore */ }
    const existingSetNames = new Map(existingSets.map((s) => [s.name, s.id]));

    let collectionsCreated = 0;
    for (const [rubro] of Array.from(rubroMap.entries())) {
      if (existingSetNames.has(rubro)) continue;
      try {
        const res = await fetch(`https://graph.facebook.com/v25.0/${CATALOG_ID}/product_sets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: rubro,
            filter: JSON.stringify({ product_type: { eq: rubro } }),
            access_token: FB_PAGE_TOKEN,
          }),
        });
        const data = await res.json();
        if (data.id) collectionsCreated++;
      } catch { /* ignore */ }
    }

    console.log(`[WA-CATALOG] Synced ${totalSynced}/${products.length} products, ${collectionsCreated} new collections, ${errors.length} errors`);

    return NextResponse.json({
      ok: true,
      total: products.length,
      synced: totalSynced,
      collections: rubroMap.size,
      newCollections: collectionsCreated,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
    });
  } catch (error) {
    console.error("[WA-CATALOG] Sync error:", error);
    return NextResponse.json({ error: "Error syncing catalog" }, { status: 500 });
  }
}
