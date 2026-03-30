import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as { role?: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  const cierres = await prisma.cierreCaja.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    cierres: cierres.map((c) => ({
      id: c.id,
      sucursal: c.sucursal,
      usuario: c.usuario,
      desde: c.desde,
      cantVentas: c.cantVentas,
      totalVentas: c.totalVentas.toString(),
      efectivo: c.efectivo.toString(),
      tarjeta: c.tarjeta.toString(),
      nuevoInicio: c.nuevoInicio.toString(),
      emailSent: c.emailSent,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}
