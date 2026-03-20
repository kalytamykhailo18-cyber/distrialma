import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const combos = await prisma.combo.findMany({
      where: { active: true },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    if (combos.length === 0) {
      return NextResponse.json({ combos: [] });
    }

    // Get all unique SKUs from combo items
    const allSkus = Array.from(
      new Set(combos.flatMap((c) => c.items.map((i) => i.sku)))
    );

    if (allSkus.length === 0) {
      return NextResponse.json({ combos: [] });
    }

    // Fetch product details from SQL Server
    const pool = await getPool();
    const db = getDbName("productos");

    const placeholders = allSkus.map((_, i) => `@sku${i}`).join(",");
    const req = pool.request();
    allSkus.forEach((sku, i) => req.input(`sku${i}`, sku.padStart(7, " ")));

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

    const enrichedCombos = combos.map((combo) => ({
      id: combo.id,
      name: combo.name,
      description: combo.description,
      hasCustomPrice: combo.price !== null,
      items: combo.items.map((item) => {
        const prod = productMap.get(item.sku) as { sku: string; name: string; precioMayorista: number; unit: string } | undefined;
        return {
          sku: item.sku,
          quantity: item.quantity,
          name: prod?.name || item.sku,
          unitPrice: prod?.precioMayorista || 0,
          unit: prod?.unit || "UN",
        };
      }),
    })).map((combo) => {
      const autoPrice = combo.items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);
      return {
        ...combo,
        price: combo.hasCustomPrice ? Number(combos.find((c) => c.id === combo.id)!.price) : autoPrice,
        originalPrice: autoPrice,
      };
    });

    return NextResponse.json({ combos: enrichedCombos });
  } catch (error) {
    console.error("Error fetching combos:", error);
    return NextResponse.json({ combos: [] });
  }
}
