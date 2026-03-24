import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/queries";
import { requireStaff } from "@/lib/api-auth";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const [allCategories, hiddenCategories] = await Promise.all([
    getCategories(true),
    prisma.hiddenCategory.findMany(),
  ]);

  const hiddenIds = new Set(hiddenCategories.map((h) => h.categoryId));

  const categories = allCategories.map((cat) => ({
    ...cat,
    hidden: hiddenIds.has(cat.id),
  }));

  return NextResponse.json(categories);
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { categoryId, hidden } = await request.json();

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId requerido" }, { status: 400 });
  }

  if (hidden) {
    await prisma.hiddenCategory.upsert({
      where: { categoryId },
      update: {},
      create: { categoryId },
    });
  } else {
    await prisma.hiddenCategory.deleteMany({
      where: { categoryId },
    });
  }

  return NextResponse.json({ ok: true });
}
