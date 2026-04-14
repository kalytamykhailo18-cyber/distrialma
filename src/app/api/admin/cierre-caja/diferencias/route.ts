import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const sucursal = searchParams.get("sucursal") || "";

  const [year, month] = mes.split("-").map(Number);
  const desde = new Date(year, month - 1, 1);
  const hasta = new Date(year, month, 1);

  try {
    const cierres = await prisma.cierreCaja.findMany({
      where: {
        createdAt: { gte: desde, lt: hasta },
        ...(sucursal ? { sucursal } : {}),
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        sucursal: true,
        responsable: true,
        usuario: true,
        diferencia: true,
        totalCaja: true,
        nuevoInicio: true,
        cantVentas: true,
        createdAt: true,
      },
    });

    // Group by responsable
    const byEmpleado = new Map<string, { nombre: string; cierres: number; totalDiferencia: number; diferencias: Array<{ id: number; fecha: string; sucursal: string; diferencia: number; ventas: number }> }>();

    for (const c of cierres) {
      const dif = Number(c.diferencia);
      // Only count faltantes (negative). Positive differences are errors, skip them.
      if (dif >= 0) continue;

      const nombre = c.responsable || c.usuario || "Sin nombre";
      if (!byEmpleado.has(nombre)) {
        byEmpleado.set(nombre, { nombre, cierres: 0, totalDiferencia: 0, diferencias: [] });
      }
      const emp = byEmpleado.get(nombre)!;
      emp.cierres++;
      emp.totalDiferencia += dif;
      emp.diferencias.push({
        id: c.id,
        fecha: c.createdAt.toISOString(),
        sucursal: c.sucursal,
        diferencia: dif,
        ventas: c.cantVentas,
      });
    }

    return NextResponse.json({
      mes,
      empleados: Array.from(byEmpleado.values()).sort((a, b) => a.totalDiferencia - b.totalDiferencia),
      totalCierres: cierres.length,
    });
  } catch (error) {
    console.error("Error diferencias:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id, diferencia } = await req.json();
    if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    await prisma.cierreCaja.update({
      where: { id },
      data: { diferencia: parseFloat(diferencia) || 0 },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating diferencia:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
