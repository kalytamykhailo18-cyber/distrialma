import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function PUT(request: NextRequest) {
  if (!(await requireStaff())) {
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
