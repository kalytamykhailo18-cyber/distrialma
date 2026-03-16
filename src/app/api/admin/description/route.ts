import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user ||
    (session.user as { role?: string }).role !== "admin"
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { sku, description } = await request.json();

  if (!sku) {
    return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
  }

  const result = await prisma.productDescription.upsert({
    where: { sku: sku.trim() },
    update: { description: description || "" },
    create: { sku: sku.trim(), description: description || "" },
  });

  return NextResponse.json(result);
}
