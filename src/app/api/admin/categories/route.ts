import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCategories } from "@/lib/queries";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (
    !session?.user ||
    (session.user as { role?: string }).role !== "admin"
  ) {
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
  const session = await getServerSession(authOptions);
  if (
    !session?.user ||
    (session.user as { role?: string }).role !== "admin"
  ) {
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
