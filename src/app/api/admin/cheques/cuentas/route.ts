import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cuentas = await prisma.cuentaBancaria.findMany({
    where: { activa: true },
    orderBy: [{ banco: "asc" }, { cuit: "asc" }],
  });
  return NextResponse.json({ cuentas });
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { banco, cuit, alias } = await req.json();
    if (!banco || !cuit || !alias) {
      return NextResponse.json({ error: "banco, cuit y alias requeridos" }, { status: 400 });
    }
    const cuenta = await prisma.cuentaBancaria.create({
      data: { banco, cuit, alias },
    });
    return NextResponse.json({ cuenta });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id, ...rest } = await req.json();
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const cuenta = await prisma.cuentaBancaria.update({ where: { id }, data: rest });
    return NextResponse.json({ cuenta });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    // Soft delete
    await prisma.cuentaBancaria.update({ where: { id }, data: { activa: false } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
