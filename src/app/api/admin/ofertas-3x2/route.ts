import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await requireStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const ofertas = await prisma.oferta3x2.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ ofertas });
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { sku } = await req.json();
  if (!sku) return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
  const existing = await prisma.oferta3x2.findUnique({ where: { sku } });
  if (existing) {
    await prisma.oferta3x2.update({ where: { sku }, data: { activo: !existing.activo } });
  } else {
    await prisma.oferta3x2.create({ data: { sku } });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { sku } = await req.json();
  if (!sku) return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
  await prisma.oferta3x2.deleteMany({ where: { sku } });
  return NextResponse.json({ ok: true });
}
