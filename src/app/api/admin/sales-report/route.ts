import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clienteCod = searchParams.get("cliente") || undefined;
  const days = parseInt(searchParams.get("days") || "7");

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.getFullYear().toString()
    + String(since.getMonth() + 1).padStart(2, "0")
    + String(since.getDate()).padStart(2, "0")
    + "000000";

  const orders = await prisma.archivedOrder.findMany({
    where: {
      ...(clienteCod ? { clienteCod } : {}),
      fechora: { gte: sinceStr },
    },
    include: { items: true },
    orderBy: { fechora: "asc" },
  });

  // Group by day, then by product
  const dailySales = new Map<string, Map<string, { name: string; totalCant: number; totalImpo: number }>>();

  for (const order of orders) {
    const date = order.fechora.substring(0, 8); // YYYYMMDD
    const dateKey = `${date.substring(6, 8)}/${date.substring(4, 6)}/${date.substring(0, 4)}`;

    if (!dailySales.has(dateKey)) dailySales.set(dateKey, new Map());
    const dayMap = dailySales.get(dateKey)!;

    for (const item of order.items) {
      const existing = dayMap.get(item.sku);
      if (existing) {
        existing.totalCant += Number(item.cant);
        existing.totalImpo += Number(item.impo);
      } else {
        dayMap.set(item.sku, {
          name: item.productName,
          totalCant: Number(item.cant),
          totalImpo: Number(item.impo),
        });
      }
    }
  }

  // Convert to array
  const report = Array.from(dailySales.entries()).map(([date, products]) => ({
    date,
    products: Array.from(products.entries()).map(([sku, data]) => ({
      sku,
      ...data,
    })),
    dayTotal: Array.from(products.values()).reduce((sum, p) => sum + p.totalImpo, 0),
  }));

  const grandTotal = report.reduce((sum, day) => sum + day.dayTotal, 0);

  // Period summary — totals per product across all days
  const summary = new Map<string, { name: string; totalCant: number; totalImpo: number }>();
  for (const order of orders) {
    for (const item of order.items) {
      const existing = summary.get(item.sku);
      if (existing) {
        existing.totalCant += Number(item.cant);
        existing.totalImpo += Number(item.impo);
      } else {
        summary.set(item.sku, {
          name: item.productName,
          totalCant: Number(item.cant),
          totalImpo: Number(item.impo),
        });
      }
    }
  }

  // Fetch units from SQL Server
  const allSkus = Array.from(summary.keys());
  const unitMap = new Map<string, string>();
  if (allSkus.length > 0) {
    try {
      const pool = await getPool();
      const db = getDbName("productos");
      const placeholders = allSkus.map((_, i) => `@sku${i}`).join(",");
      const req = pool.request();
      allSkus.forEach((sku, i) => req.input(`sku${i}`, sku.padStart(7, " ")));
      const unitResult = await req.query(`
        SELECT LTRIM(RTRIM(Cod)) AS sku, LTRIM(RTRIM(ISNULL(Unidad, 'UN'))) AS unit
        FROM [${db}].dbo.Productos WHERE Cod IN (${placeholders})
      `);
      for (const r of unitResult.recordset) {
        unitMap.set(r.sku, r.unit || "UN");
      }
    } catch { /* fallback to UN */ }
  }

  const periodSummary = Array.from(summary.entries())
    .map(([sku, data]) => ({ sku, ...data, unit: unitMap.get(sku) || "UN" }))
    .sort((a, b) => b.totalImpo - a.totalImpo);

  return NextResponse.json({
    report,
    periodSummary,
    grandTotal,
    period: `${days} días`,
    orders: orders.length,
  });
}
