import sql from "mssql";
import { v2 as cloudinary } from "cloudinary";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const mssqlConfig: sql.config = {
  server: process.env.MSSQL_HOST!,
  port: parseInt(process.env.MSSQL_PORT || "1433"),
  user: process.env.MSSQL_USER!,
  password: process.env.MSSQL_PASSWORD!,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

async function main() {
  console.log("Connecting to SQL Server...");
  const pool = await sql.connect(mssqlConfig);

  const dbp = process.env.MSSQL_DB_PRODUCTOS!;
  const dbi = "C:\\PUNTOUCH\\BDELEMENUS.MDF";

  // Get all products with images in PuntoTouch
  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(p.Cod)) AS sku,
      LTRIM(RTRIM(p.Nombre)) AS name,
      LTRIM(RTRIM(p.ImagenId)) AS imagenId,
      i.Imagen AS imageData
    FROM [${dbp}].dbo.Productos p
    JOIN [${dbi}].dbo.Imagenus i ON i.Cod = p.ImagenId COLLATE Modern_Spanish_CI_AS
    WHERE p.TieneImagen = 1
      AND i.Imagen IS NOT NULL
      AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
  `);

  console.log(`Found ${result.recordset.length} products with images`);

  // Get existing images from PostgreSQL
  const existing = await prisma.productImage.findMany({
    select: { sku: true },
  });
  const existingSkus = new Set(existing.map((e) => e.sku));

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of result.recordset) {
    const sku = row.sku.trim();

    if (existingSkus.has(sku)) {
      skipped++;
      continue;
    }

    try {
      const buffer = row.imageData as Buffer;
      const base64 = `data:image/jpeg;base64,${buffer.toString("base64")}`;

      const uploadResult = await cloudinary.uploader.upload(base64, {
        folder: "distrialma",
        public_id: `${sku}-puntouch`,
        transformation: [
          {
            width: 800,
            height: 800,
            crop: "limit",
            quality: "auto",
            format: "webp",
          },
        ],
      });

      await prisma.productImage.create({
        data: {
          sku,
          filename: uploadResult.secure_url,
          position: 0,
        },
      });

      uploaded++;
      console.log(`[${uploaded}] Uploaded: ${sku} — ${row.name}`);
    } catch (err) {
      failed++;
      console.error(`Failed: ${sku} — ${(err as Error).message}`);
    }
  }

  console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped (already exist), ${failed} failed`);

  await pool.close();
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
