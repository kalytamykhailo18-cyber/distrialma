/**
 * Fetch product images from Coto Digital for products without images.
 *
 * Modes:
 *   --dry      Generate a CSV preview of matches without uploading anything
 *   --apply    Actually upload to Cloudinary and save to product_images
 *   --limit N  Only process N products (for testing). Default: 50 in dry, 0 (all) in apply
 *   --min N    Minimum similarity score 0..1 (default 0.6)
 *
 * Run from /home/distrialma:
 *   npx tsx scripts/fetch-coto-images.ts --dry --limit 30
 *   npx tsx scripts/fetch-coto-images.ts --apply --min 0.7
 */
import * as fs from "fs";
import * as path from "path";
import sql from "mssql";
import { v2 as cloudinary } from "cloudinary";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const COTO_KEY = "key_r6xzz4IAoTWcipni";

const args = process.argv.slice(2);
const DRY = args.includes("--dry") || !args.includes("--apply");

function getArg(name: string, defaultVal: string): string {
  const i = args.indexOf(name);
  if (i === -1) return defaultVal;
  return args[i + 1] || defaultVal;
}

const LIMIT = parseInt(getArg("--limit", DRY ? "30" : "0"));
const MIN_SIM = parseFloat(getArg("--min", "0.6"));

interface Product {
  sku: string;
  name: string;
  marca: string;
  rubro: string;
}

interface CotoMatch {
  name: string;
  imageUrl: string;
  similarity: number;
}

// Strip accents, punctuation, lowercase, collapse whitespace
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(s: string): string[] {
  return normalize(s).split(" ").filter((t) => t.length > 1);
}

// Jaccard similarity on tokens
function similarity(a: string, b: string): number {
  const ta = new Set(tokens(a));
  const tb = new Set(tokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersect = 0;
  for (const t of Array.from(ta)) if (tb.has(t)) intersect++;
  return intersect / Math.max(ta.size, tb.size);
}

async function searchCoto(query: string): Promise<Array<{ name: string; image: string }>> {
  const url = `https://ac.cnstrc.com/search/${encodeURIComponent(query)}?key=${COTO_KEY}&num_results_per_page=5&c=ciojs-client-2.50.5&_dt=${Date.now()}&i=test`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const data = await res.json();
    const results = data?.response?.results || [];
    return results
      .map((r: { value?: string; data?: { image_url?: string } }) => ({
        name: r.value || "",
        image: r.data?.image_url || "",
      }))
      .filter((r: { name: string; image: string }) => r.name && r.image);
  } catch {
    return [];
  }
}

function bestMatch(productName: string, results: Array<{ name: string; image: string }>): CotoMatch | null {
  if (results.length === 0) return null;
  let best: CotoMatch | null = null;
  for (const r of results) {
    const sim = similarity(productName, r.name);
    if (!best || sim > best.similarity) {
      best = { name: r.name, imageUrl: r.image, similarity: sim };
    }
  }
  return best;
}

async function uploadImage(url: string, sku: string): Promise<string | null> {
  try {
    const res = await cloudinary.uploader.upload(url, {
      folder: "distrialma",
      public_id: `${sku}-coto-${Date.now()}`,
      overwrite: false,
      resource_type: "image",
      transformation: [{ width: 800, height: 800, crop: "limit", quality: "auto" }],
    });
    return res.secure_url;
  } catch (e) {
    console.error(`  Upload failed for ${sku}:`, (e as Error).message);
    return null;
  }
}

async function main() {
  console.log(`Mode: ${DRY ? "DRY (preview only)" : "APPLY (will upload + save)"}`);
  console.log(`Limit: ${LIMIT || "all"}, Min similarity: ${MIN_SIM}`);

  const pool = await sql.connect({
    server: process.env.MSSQL_HOST!,
    port: parseInt(process.env.MSSQL_PORT || "1433"),
    user: process.env.MSSQL_USER!,
    password: process.env.MSSQL_PASSWORD!,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 30000,
    requestTimeout: 60000,
  });

  const dbp = process.env.MSSQL_DB_PRODUCTOS!;

  // Get visible products (with mayorista price > 0) without an image in PG
  const skusWithImg = await prisma.productImage.findMany({ select: { sku: true } });
  const skipSet = new Set(skusWithImg.map((p) => p.sku));

  console.log(`Skipping ${skipSet.size} products that already have images`);

  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(p.Cod)) AS sku,
      LTRIM(RTRIM(p.Nombre)) AS name,
      LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
      LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro
    FROM [${dbp}].dbo.Productos p
    JOIN [${dbp}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
    LEFT JOIN [${dbp}].dbo.Marcas m ON m.Cod = p.Marca
    LEFT JOIN [${dbp}].dbo.Rubros r ON r.Cod = p.Rubro
    WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
      AND s.Precio2 > 0
    ORDER BY p.Nombre
  `);

  const allProducts: Product[] = result.recordset.filter((p: Product) => !skipSet.has(p.sku));
  console.log(`Total visible products without image: ${allProducts.length}`);

  const toProcess = LIMIT > 0 ? allProducts.slice(0, LIMIT) : allProducts;
  console.log(`Processing: ${toProcess.length}\n`);

  const log: Array<{
    sku: string;
    name: string;
    matchName: string;
    similarity: number;
    imageUrl: string;
    status: string;
  }> = [];

  let matched = 0, applied = 0, skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const p = toProcess[i];
    process.stdout.write(`[${i + 1}/${toProcess.length}] ${p.sku} ${p.name.substring(0, 50)} ... `);

    // Build smart query: name + brand
    const query = (p.name + " " + p.marca).trim();
    const results = await searchCoto(query);
    const match = bestMatch(p.name + " " + p.marca, results);

    if (!match || match.similarity < MIN_SIM) {
      console.log(`no match (${match?.similarity?.toFixed(2) || "0"})`);
      log.push({
        sku: p.sku,
        name: p.name,
        matchName: match?.name || "",
        similarity: match?.similarity || 0,
        imageUrl: match?.imageUrl || "",
        status: "skipped",
      });
      skipped++;
    } else {
      matched++;
      console.log(`MATCH (${match.similarity.toFixed(2)}) → ${match.name.substring(0, 50)}`);

      if (!DRY) {
        const cloudUrl = await uploadImage(match.imageUrl, p.sku);
        if (cloudUrl) {
          await prisma.productImage.create({
            data: { sku: p.sku, filename: cloudUrl, position: 0 },
          });
          applied++;
          log.push({
            sku: p.sku,
            name: p.name,
            matchName: match.name,
            similarity: match.similarity,
            imageUrl: cloudUrl,
            status: "uploaded",
          });
        } else {
          log.push({
            sku: p.sku,
            name: p.name,
            matchName: match.name,
            similarity: match.similarity,
            imageUrl: match.imageUrl,
            status: "upload_failed",
          });
        }
      } else {
        log.push({
          sku: p.sku,
          name: p.name,
          matchName: match.name,
          similarity: match.similarity,
          imageUrl: match.imageUrl,
          status: "preview",
        });
      }
    }

    // Be polite to Coto
    await new Promise((r) => setTimeout(r, 250));
  }

  // Write CSV report
  const reportPath = path.join(process.cwd(), `coto-images-${DRY ? "dry" : "apply"}-${new Date().toISOString().slice(0, 10)}.csv`);
  const header = "sku,name,matchName,similarity,imageUrl,status\n";
  const rows = log.map((r) =>
    [r.sku, `"${r.name.replace(/"/g, '""')}"`, `"${r.matchName.replace(/"/g, '""')}"`, r.similarity.toFixed(2), r.imageUrl, r.status].join(",")
  ).join("\n");
  fs.writeFileSync(reportPath, header + rows);

  console.log(`\n=== Resumen ===`);
  console.log(`Procesados:    ${toProcess.length}`);
  console.log(`Coincidencias: ${matched}`);
  console.log(`Sin match:     ${skipped}`);
  if (!DRY) console.log(`Subidas a Cloudinary: ${applied}`);
  console.log(`Reporte CSV:   ${reportPath}`);

  await pool.close();
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
