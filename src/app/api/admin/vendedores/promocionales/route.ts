import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// POST: Toggle promotional flag for a SKU
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { sku } = await req.json();
    if (!sku) return NextResponse.json({ error: "SKU requerido" }, { status: 400 });

    const existing = await prisma.articuloPromocional.findUnique({ where: { sku } });
    if (existing) {
      await prisma.articuloPromocional.delete({ where: { sku } });
      return NextResponse.json({ ok: true, promocional: false });
    } else {
      await prisma.articuloPromocional.create({ data: { sku } });
      return NextResponse.json({ ok: true, promocional: true });
    }
  } catch (error) {
    console.error("Error toggling promotional:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
