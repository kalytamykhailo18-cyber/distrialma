import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const margins = await prisma.priceMargin.findMany({ orderBy: { lista: "asc" } });
  return NextResponse.json({
    margins: margins.map((m) => ({ lista: m.lista, margen: Number(m.margen) })),
  });
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { margins } = await req.json();
  if (!Array.isArray(margins)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  for (const m of margins) {
    const lista = parseInt(m.lista);
    const margen = parseFloat(m.margen);
    if (isNaN(lista) || lista < 1 || lista > 5 || isNaN(margen)) continue;

    await prisma.priceMargin.upsert({
      where: { lista },
      update: { margen },
      create: { lista, margen },
    });
  }

  const updated = await prisma.priceMargin.findMany({ orderBy: { lista: "asc" } });
  return NextResponse.json({
    margins: updated.map((m) => ({ lista: m.lista, margen: Number(m.margen) })),
  });
}
