import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    // Get all active cheques (not anulado, not pagado/depositado)
    const propios = await prisma.cheque.findMany({
      where: { tipo: "propio", estado: { in: ["en-circulacion"] } },
      orderBy: { fechaCobro: "asc" },
    });

    const terceros = await prisma.cheque.findMany({
      where: { tipo: "tercero", estado: { in: ["en-cartera"] } },
      orderBy: { fechaCobro: "asc" },
    });

    // Group by week
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    interface WeekData {
      weekStart: string;
      weekEnd: string;
      label: string;
      salidas: Array<{ id: number; numero: string; monto: number; fecha: string; proveedor: string }>;
      entradas: Array<{ id: number; numero: string; monto: number; fecha: string; librador: string }>;
      totalSalidas: number;
      totalEntradas: number;
      balance: number;
    }

    const weeks: WeekData[] = [];

    // Generate 12 weeks from today
    for (let w = 0; w < 12; w++) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() + w * 7 - now.getDay() + 1); // Monday
      if (w === 0) { weekStart.setTime(now.getTime()); weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1); }
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6); // Sunday

      const ws = weekStart.toISOString().slice(0, 10);
      const we = weekEnd.toISOString().slice(0, 10);

      const weekPropios = propios.filter((c) => {
        const d = c.fechaCobro.toISOString().slice(0, 10);
        return d >= ws && d <= we;
      });

      const weekTerceros = terceros.filter((c) => {
        const d = c.fechaCobro.toISOString().slice(0, 10);
        return d >= ws && d <= we;
      });

      const totalSalidas = weekPropios.reduce((s, c) => s + Number(c.monto), 0);
      const totalEntradas = weekTerceros.reduce((s, c) => s + Number(c.monto), 0);

      weeks.push({
        weekStart: ws,
        weekEnd: we,
        label: `${weekStart.getDate()}/${weekStart.getMonth() + 1} — ${weekEnd.getDate()}/${weekEnd.getMonth() + 1}`,
        salidas: weekPropios.map((c) => ({
          id: c.id,
          numero: c.numero,
          monto: Number(c.monto),
          fecha: c.fechaCobro.toISOString().slice(0, 10),
          proveedor: c.proveedorNombre || "",
        })),
        entradas: weekTerceros.map((c) => ({
          id: c.id,
          numero: c.numero,
          monto: Number(c.monto),
          fecha: c.fechaCobro.toISOString().slice(0, 10),
          librador: c.librador || "",
        })),
        totalSalidas,
        totalEntradas,
        balance: totalEntradas - totalSalidas,
      });
    }

    // Vencidos: past cheques that should have been deposited/paid
    const vencidosPropios = propios.filter((c) => c.fechaCobro < now);
    const vencidosTerceros = terceros.filter((c) => c.fechaCobro < now);

    return NextResponse.json({
      weeks,
      vencidos: {
        propios: vencidosPropios.map((c) => ({ id: c.id, numero: c.numero, monto: Number(c.monto), fecha: c.fechaCobro.toISOString().slice(0, 10), proveedor: c.proveedorNombre || "" })),
        terceros: vencidosTerceros.map((c) => ({ id: c.id, numero: c.numero, monto: Number(c.monto), fecha: c.fechaCobro.toISOString().slice(0, 10), librador: c.librador || "" })),
        totalPropios: vencidosPropios.reduce((s, c) => s + Number(c.monto), 0),
        totalTerceros: vencidosTerceros.reduce((s, c) => s + Number(c.monto), 0),
      },
      totales: {
        propiosActivos: propios.length,
        tercerosActivos: terceros.length,
        totalSalidas: propios.reduce((s, c) => s + Number(c.monto), 0),
        totalEntradas: terceros.reduce((s, c) => s + Number(c.monto), 0),
      },
    });
  } catch (error) {
    console.error("Cheques flujo error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
