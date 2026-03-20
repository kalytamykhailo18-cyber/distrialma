import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const comboId = parseInt(params.id);
  if (isNaN(comboId)) {
    return NextResponse.json({ error: "ID inválido" }, { status: 400 });
  }

  const combo = await prisma.combo.findUnique({
    where: { id: comboId },
    include: { items: true },
  });

  if (!combo || !combo.active) {
    return NextResponse.json({ error: "Combo no encontrado" }, { status: 404 });
  }

  // Get combo images
  const comboSku = `combo-${comboId}`;
  const images = await prisma.productImage.findMany({
    where: { sku: comboSku },
    orderBy: { position: "asc" },
  });

  // Get product details from SQL Server
  const skus = combo.items.map((i) => i.sku);
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
      LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unit
    FROM [${db}].dbo.Productos p
    JOIN [${db}].dbo.Stock s ON s.CodProducto = p.Cod
    WHERE p.Cod IN (${placeholders})
      AND LTRIM(RTRIM(s.Deposito)) = '0'
  `);

  const productMap = new Map(
    result.recordset.map((p: { sku: string; name: string; precioMayorista: number; unit: string }) => [p.sku, p])
  );

  // Get product images
  const productImages = await prisma.productImage.findMany({
    where: { sku: { in: skus } },
    orderBy: { position: "asc" },
  });
  const prodImageMap = new Map<string, string[]>();
  for (const img of productImages) {
    if (!prodImageMap.has(img.sku)) prodImageMap.set(img.sku, []);
    prodImageMap.get(img.sku)!.push(img.filename);
  }

  const items = combo.items.map((item) => {
    const prod = productMap.get(item.sku) as { name: string; precioMayorista: number; unit: string } | undefined;
    return {
      sku: item.sku,
      quantity: item.quantity,
      name: prod?.name || item.sku,
      unitPrice: prod?.precioMayorista || 0,
      unit: prod?.unit || "UN",
      images: prodImageMap.get(item.sku) || [],
    };
  });

  const autoPrice = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  return NextResponse.json({
    id: combo.id,
    name: combo.name,
    description: combo.description,
    price: combo.price ? Number(combo.price) : autoPrice,
    hasCustomPrice: combo.price !== null,
    originalPrice: autoPrice,
    items,
    images: images.map((img) => ({ id: img.id, url: img.filename })),
  });
}
