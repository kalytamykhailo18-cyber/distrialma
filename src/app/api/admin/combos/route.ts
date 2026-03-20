import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET — list all combos with items
export async function GET() {
  const combos = await prisma.combo.findMany({
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ combos });
}

// POST — create a new combo
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, description, price, items } = body as {
    name: string;
    description?: string;
    price: number | null;
    items: { sku: string; quantity: number }[];
  };

  if (!name || !items || items.length < 2) {
    return NextResponse.json(
      { error: "Nombre y al menos 2 productos son requeridos" },
      { status: 400 }
    );
  }

  const combo = await prisma.combo.create({
    data: {
      name,
      description: description || null,
      price: price || null,
      items: {
        create: items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
      },
    },
    include: { items: true },
  });

  return NextResponse.json({ combo });
}

// PUT — update a combo
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, name, description, price, active, items } = body as {
    id: number;
    name: string;
    description?: string;
    price: number | null;
    active: boolean;
    items: { sku: string; quantity: number }[];
  };

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  // Delete old items and recreate
  await prisma.comboItem.deleteMany({ where: { comboId: id } });

  const combo = await prisma.combo.update({
    where: { id },
    data: {
      name,
      description: description || null,
      price: price || null,
      active,
      items: {
        create: items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
      },
    },
    include: { items: true },
  });

  return NextResponse.json({ combo });
}

// DELETE — delete a combo
export async function DELETE(req: NextRequest) {
  const { id } = await req.json();
  await prisma.combo.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
