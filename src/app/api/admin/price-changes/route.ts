import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "7");
  const since = new Date();
  since.setDate(since.getDate() - days);

  const changes = await prisma.priceChange.findMany({
    where: { detectedAt: { gte: since } },
    orderBy: { detectedAt: "desc" },
  });

  // Group by SKU to get unique products that changed
  const bySku = new Map<string, typeof changes>();
  for (const c of changes) {
    if (!bySku.has(c.sku)) bySku.set(c.sku, []);
    bySku.get(c.sku)!.push(c);
  }

  return NextResponse.json({
    changes,
    uniqueProducts: bySku.size,
    total: changes.length,
  });
}

export async function DELETE() {
  // Clear old changes (e.g. after generating labels)
  await prisma.priceChange.deleteMany({});
  return NextResponse.json({ ok: true });
}
