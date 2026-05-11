import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";
import { generateFlyer, generateStoryFlyer } from "@/lib/flyer-generator";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
const FB_PAGE_ID = process.env.FB_PAGE_ID || "";
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
const IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID || "";

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

async function generatePostText(productName: string, price: number, priceCC?: number): Promise<string> {
  const prompt = `Genera un texto corto para una publicación de Instagram/Facebook de un producto de supermercado mayorista.

Producto: ${productName}
Precio mayorista: ${formatPrice(price)}${priceCC ? `\nPrecio caja cerrada: ${formatPrice(priceCC)}` : ""}

Reglas:
- Máximo 3 líneas de texto
- Usar emojis relevantes (2-3 máximo)
- Incluir el precio
- Tono: oferta atractiva, informal argentino
- NO usar hashtags (se agregan aparte)
- NO usar markdown ni negritas
- Terminar con "Distrialma - Av. Calle Real 387, Merlo"`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY || "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return (data.content?.[0]?.text || productName).trim();
}

async function publishToInstagramStory(imageUrl: string): Promise<string | null> {
  if (!IG_ACCOUNT_ID || !FB_PAGE_TOKEN) return null;
  try {
    const containerRes = await fetch(`https://graph.facebook.com/v25.0/${IG_ACCOUNT_ID}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_url: imageUrl, media_type: "STORIES", access_token: FB_PAGE_TOKEN }),
    });
    const containerData = await containerRes.json();
    if (!containerData.id) { console.error("[SOCIAL] IG story container error:", containerData); return null; }
    const publishRes = await fetch(`https://graph.facebook.com/v25.0/${IG_ACCOUNT_ID}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ creation_id: containerData.id, access_token: FB_PAGE_TOKEN }),
    });
    const publishData = await publishRes.json();
    if (!publishData.id) { console.error("[SOCIAL] IG story publish error:", publishData); return null; }
    return publishData.id;
  } catch (e) { console.error("[SOCIAL] IG story error:", e); return null; }
}

async function publishToFacebookStory(imageUrl: string): Promise<string | null> {
  if (!FB_PAGE_ID || !FB_PAGE_TOKEN) return null;
  try {
    // Step 1: Upload photo as unpublished (must use form data)
    const photoForm = new URLSearchParams();
    photoForm.set("url", imageUrl);
    photoForm.set("published", "false");
    photoForm.set("access_token", FB_PAGE_TOKEN);
    const photoRes = await fetch(`https://graph.facebook.com/v25.0/${FB_PAGE_ID}/photos`, {
      method: "POST",
      body: photoForm,
    });
    const photoData = await photoRes.json();
    if (!photoData.id) { console.error("[SOCIAL] FB story photo upload error:", photoData); return null; }

    // Step 2: Create story with the uploaded photo
    const storyForm = new URLSearchParams();
    storyForm.set("photo_id", photoData.id);
    storyForm.set("access_token", FB_PAGE_TOKEN);
    const storyRes = await fetch(`https://graph.facebook.com/v25.0/${FB_PAGE_ID}/photo_stories`, {
      method: "POST",
      body: storyForm,
    });
    const storyData = await storyRes.json();
    if (!storyData.success && !storyData.post_id) { console.error("[SOCIAL] FB story error:", storyData); return null; }
    console.log("[SOCIAL] FB story published:", storyData.post_id);
    return storyData.post_id || null;
  } catch (e) { console.error("[SOCIAL] FB story error:", e); return null; }
}

async function publishToInstagram(imageUrl: string, caption: string): Promise<string | null> {
  if (!IG_ACCOUNT_ID || !FB_PAGE_TOKEN) return null;

  // Step 1: Create media container
  const containerRes = await fetch(
    `https://graph.facebook.com/v25.0/${IG_ACCOUNT_ID}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: FB_PAGE_TOKEN,
      }),
    }
  );
  const containerData = await containerRes.json();
  if (!containerData.id) {
    console.error("[SOCIAL] IG container error:", containerData);
    return null;
  }

  // Step 2: Publish the container
  const publishRes = await fetch(
    `https://graph.facebook.com/v25.0/${IG_ACCOUNT_ID}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerData.id,
        access_token: FB_PAGE_TOKEN,
      }),
    }
  );
  const publishData = await publishRes.json();
  if (!publishData.id) {
    console.error("[SOCIAL] IG publish error:", publishData);
    return null;
  }

  return publishData.id;
}

async function publishToFacebook(message: string, imageUrl?: string): Promise<string | null> {
  if (!FB_PAGE_ID || !FB_PAGE_TOKEN) return null;

  const body: Record<string, string> = {
    message,
    access_token: FB_PAGE_TOKEN,
  };
  if (imageUrl) body.url = imageUrl;

  const endpoint = imageUrl
    ? `https://graph.facebook.com/v25.0/${FB_PAGE_ID}/photos`
    : `https://graph.facebook.com/v25.0/${FB_PAGE_ID}/feed`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.id && !data.post_id) {
    console.error("[SOCIAL] FB post error:", data);
    return null;
  }

  return data.id || data.post_id;
}

// GET: preview post for a product
export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const sku = new URL(req.url).searchParams.get("sku");
  if (!sku) return NextResponse.json({ error: "SKU requerido" }, { status: 400 });

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = sku.padStart(7, " ");

    const result = await pool.request().input("cod", codPadded).query(`
      SELECT LTRIM(RTRIM(p.Nombre)) AS nombre, s.Precio2 AS precio2, s.Precio4 AS precio4,
        LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad, s.Stk AS stock
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE s.CodProducto = @cod AND LTRIM(RTRIM(s.Deposito)) = '0'
    `);

    if (result.recordset.length === 0) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const prod = result.recordset[0];
    const price = Number(prod.precio2);
    const priceCC = Number(prod.precio4) > 0 ? Number(prod.precio4) : undefined;

    // Get image
    const image = await prisma.productImage.findFirst({
      where: { sku: sku.trim() },
      orderBy: { position: "asc" },
    });

    const hashtagSetting = await prisma.setting.findUnique({ where: { key: "social_post_hashtags" } });
    const hashtags = hashtagSetting?.value || "#distrialma #mayorista #merlo #ofertas #alimentos";

    const text = await generatePostText(prod.nombre.trim(), price, priceCC);
    const caption = `${text}\n\n${hashtags}`;

    return NextResponse.json({
      sku: sku.trim(),
      nombre: prod.nombre.trim(),
      precio: price,
      precioCC: priceCC,
      stock: Number(prod.stock),
      imageUrl: image?.filename || null,
      text,
      caption,
      hashtags,
    });
  } catch (error) {
    console.error("Social post preview error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: publish to Instagram and/or Facebook
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    const session = await requireStaff();
    if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { sku, caption: customCaption, platforms } = body;

    // Auto-detect mode: find slow-moving product
    let targetSku = sku;
    let autoMode = false;

    if (!targetSku) {
      autoMode = true;
      const pool = await getPool();
      const dbProd = getDbName("productos");
      const dbTransas = getDbName("transas");

      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
      const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      const sinceStr = since.getFullYear().toString() + String(since.getMonth() + 1).padStart(2, "0") + String(since.getDate()).padStart(2, "0") + "000000";

      // Find products with stock > 0, low sales, has image, not posted recently
      const recentPosts = await prisma.socialPost.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
        select: { sku: true },
      });
      const recentSkus = new Set(recentPosts.map((p) => p.sku));

      const result = await pool.request().input("desde", sinceStr).query(`
        SELECT TOP 20
          LTRIM(RTRIM(p.Cod)) AS sku, LTRIM(RTRIM(p.Nombre)) AS nombre,
          s.Stk AS stock, s.Precio2 AS precio2,
          ISNULL((SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
            WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Cant > 0 AND t.Fechora >= @desde), 0) AS vendido
        FROM [${dbProd}].dbo.Stock s
        JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        WHERE LTRIM(RTRIM(s.Deposito)) = '0' AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND s.Stk > 10 AND s.Precio2 > 0
        ORDER BY ISNULL((SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
          WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Cant > 0 AND t.Fechora >= @desde), 0) ASC
      `);

      // Find first product with image that wasn't posted recently
      for (const p of result.recordset) {
        const skuTrimmed = p.sku.trim();
        if (recentSkus.has(skuTrimmed)) continue;
        const img = await prisma.productImage.findFirst({ where: { sku: skuTrimmed } });
        if (img) { targetSku = skuTrimmed; break; }
      }

      if (!targetSku) return NextResponse.json({ ok: true, skipped: true, reason: "No hay productos con imagen para publicar" });
    }

    // Get product data
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = targetSku.padStart(7, " ");

    const prodResult = await pool.request().input("cod", codPadded).query(`
      SELECT LTRIM(RTRIM(p.Nombre)) AS nombre, s.Precio2 AS precio2, s.Precio4 AS precio4
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE s.CodProducto = @cod AND LTRIM(RTRIM(s.Deposito)) = '0'
    `);
    if (prodResult.recordset.length === 0) return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });

    const prod = prodResult.recordset[0];
    const image = await prisma.productImage.findFirst({
      where: { sku: targetSku.trim() },
      orderBy: { position: "asc" },
    });
    if (!image?.filename) return NextResponse.json({ error: "Producto sin imagen" }, { status: 400 });

    const price = Number(prod.precio2);
    const priceCC = Number(prod.precio4) > 0 ? Number(prod.precio4) : undefined;
    const hashtagSetting = await prisma.setting.findUnique({ where: { key: "social_post_hashtags" } });
    const hashtags = hashtagSetting?.value || "#distrialma #mayorista #merlo #ofertas #alimentos";

    const text = customCaption || await generatePostText(prod.nombre.trim(), price, priceCC);
    const caption = `${text}\n\n${hashtags}`;

    // Generate flyer image and upload to Cloudinary
    let flyerUrl = image.filename; // fallback to product image
    try {
      const flyerBuffer = await generateFlyer({
        productName: prod.nombre.trim(),
        price,
        priceCC,
        imageUrl: image.filename,
      });
      const base64 = `data:image/png;base64,${flyerBuffer.toString("base64")}`;
      const uploadResult = await cloudinary.uploader.upload(base64, {
        folder: "distrialma/flyers",
        public_id: `flyer-${targetSku.trim()}-${Date.now()}`,
      });
      flyerUrl = uploadResult.secure_url;
    } catch (e) {
      console.error("[SOCIAL] Flyer generation error:", e);
    }

    const publishTo = platforms || ["instagram", "facebook"];
    let igPostId: string | null = null;
    let fbPostId: string | null = null;

    // Generate vertical story flyer (9:16)
    let storyFlyerUrl = flyerUrl;
    try {
      const storyBuffer = await generateStoryFlyer({ productName: prod.nombre.trim(), price, priceCC, imageUrl: image.filename });
      const storyBase64 = `data:image/png;base64,${storyBuffer.toString("base64")}`;
      const storyUpload = await cloudinary.uploader.upload(storyBase64, {
        folder: "distrialma/flyers",
        public_id: `story-${targetSku.trim()}-${Date.now()}`,
      });
      storyFlyerUrl = storyUpload.secure_url;
    } catch (e) {
      console.error("[SOCIAL] Story flyer generation error:", e);
    }

    if (publishTo.includes("instagram")) {
      igPostId = await publishToInstagram(flyerUrl, caption);
      await publishToInstagramStory(storyFlyerUrl);
    }
    if (publishTo.includes("facebook")) {
      fbPostId = await publishToFacebook(caption, flyerUrl);
      await publishToFacebookStory(storyFlyerUrl);
    }

    // Log post
    await prisma.socialPost.create({
      data: {
        sku: targetSku.trim(),
        productName: prod.nombre.trim(),
        caption,
        imageUrl: flyerUrl,
        igPostId,
        fbPostId,
        auto: autoMode,
      },
    });

    console.log(`[SOCIAL] Posted SKU ${targetSku}: IG=${igPostId}, FB=${fbPostId}`);
    return NextResponse.json({ ok: true, sku: targetSku, igPostId, fbPostId, caption });
  } catch (error) {
    console.error("Social post error:", error);
    return NextResponse.json({ error: "Error al publicar" }, { status: 500 });
  }
}
