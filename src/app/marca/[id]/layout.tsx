import { Metadata } from "next";
import { getPool } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

function db() { return process.env.MSSQL_DB_PRODUCTOS!; }

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const pool = await getPool();
  const brandResult = await pool.request().input("cod", params.id.padStart(4, " ")).query(`
    SELECT LTRIM(RTRIM([Desc])) AS name FROM [${db()}].dbo.Marcas WHERE Cod = @cod
  `);
  const brandName = brandResult.recordset[0]?.name || "Marca";

  // Get first product image for this brand
  const productResult = await pool.request().input("marca", params.id.padStart(4, " ")).query(`
    SELECT LTRIM(RTRIM(p.Cod)) AS sku
    FROM [${db()}].dbo.Productos p
    WHERE p.Marca = @marca AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
  `);
  let ogImage = "https://distrialma.com.ar/logo.png";
  const skus = productResult.recordset.map((r: { sku: string }) => r.sku);
  if (skus.length > 0) {
    const img = await prisma.productImage.findFirst({
      where: { sku: { in: skus } },
      orderBy: { position: "asc" },
    });
    if (img) ogImage = img.filename;
  }

  return {
    title: `${brandName} — Distrialma`,
    description: `Productos ${brandName} en Distrialma. Mayorista de alimentos, Merlo, Buenos Aires.`,
    openGraph: {
      title: `${brandName} — Distrialma`,
      description: `Productos ${brandName} en Distrialma`,
      images: [{ url: ogImage, width: 400, height: 400 }],
    },
  };
}

export default function MarcaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
