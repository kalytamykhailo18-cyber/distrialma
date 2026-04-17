import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: fetch delivery statuses for a given date
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get("fecha") || new Date().toISOString().slice(0, 10);

  try {
    const dia = new Date(fecha + "T00:00:00");
    const statuses = await prisma.deliveryStatus.findMany({
      where: { fecha: dia },
    });
    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("delivery status GET error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: mark delivery status for a client on a specific date
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { clientId, fecha, estado, observaciones } = await req.json();
    if (!clientId || !fecha || !estado) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const userName = (session.user as { name?: string })?.name || "staff";
    const dia = new Date(fecha + "T00:00:00");

    const status = await prisma.deliveryStatus.upsert({
      where: { clientId_fecha: { clientId, fecha: dia } },
      update: { estado, observaciones: observaciones || null, deliveredBy: userName },
      create: { clientId, fecha: dia, estado, observaciones: observaciones || null, deliveredBy: userName },
    });

    return NextResponse.json({ status });
  } catch (error) {
    console.error("delivery status POST error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// DELETE: clear a delivery status (undo)
export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const fecha = searchParams.get("fecha");
    if (!clientId || !fecha) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    const dia = new Date(fecha + "T00:00:00");
    await prisma.deliveryStatus.delete({
      where: { clientId_fecha: { clientId, fecha: dia } },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
