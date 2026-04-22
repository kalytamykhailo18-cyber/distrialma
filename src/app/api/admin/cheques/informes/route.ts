import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const allCheques = await prisma.cheque.findMany({
      orderBy: { createdAt: "desc" },
    });

    // Por proveedor
    const provMap = new Map<string, { nombre: string; cantidad: number; total: number; pagados: number; pendientes: number }>();
    for (const c of allCheques) {
      if (!c.proveedorNombre) continue;
      const key = c.proveedorCod || c.proveedorNombre;
      const existing = provMap.get(key) || { nombre: c.proveedorNombre, cantidad: 0, total: 0, pagados: 0, pendientes: 0 };
      existing.cantidad++;
      existing.total += Number(c.monto);
      if (c.estado === "pagado" || c.estado === "depositado") existing.pagados++;
      else if (c.estado !== "anulado" && c.estado !== "rechazado") existing.pendientes++;
      provMap.set(key, existing);
    }
    const porProveedor = Array.from(provMap.values()).sort((a, b) => b.total - a.total);

    // Rechazados
    const rechazados = allCheques
      .filter((c) => c.estado === "rechazado")
      .map((c) => ({
        id: c.id,
        numero: c.numero,
        banco: c.banco,
        monto: Number(c.monto),
        tipo: c.tipo,
        fechaCobro: c.fechaCobro.toISOString().slice(0, 10),
        fechaEstado: c.fechaEstado.toISOString().slice(0, 10),
        proveedor: c.proveedorNombre || "",
        librador: c.librador || "",
        reemplazadoPor: null as string | null,
      }));

    // Check if any rechazado was replaced
    for (const r of rechazados) {
      const reemplazo = allCheques.find((c) => c.reemplazaId === r.id);
      if (reemplazo) r.reemplazadoPor = reemplazo.numero;
    }

    // Resumen mensual (last 6 months)
    const now = new Date();
    const months: Array<{ mes: string; propiosEmitidos: number; propiosTotal: number; tercerosRecibidos: number; tercerosTotal: number }> = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mesLabel = `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);

      const mesCheques = allCheques.filter((c) => c.createdAt >= d && c.createdAt < nextMonth);
      const propios = mesCheques.filter((c) => c.tipo === "propio");
      const terceros = mesCheques.filter((c) => c.tipo === "tercero");

      months.push({
        mes: mesLabel,
        propiosEmitidos: propios.length,
        propiosTotal: propios.reduce((s, c) => s + Number(c.monto), 0),
        tercerosRecibidos: terceros.length,
        tercerosTotal: terceros.reduce((s, c) => s + Number(c.monto), 0),
      });
    }

    return NextResponse.json({
      porProveedor,
      rechazados,
      resumenMensual: months,
    });
  } catch (error) {
    console.error("Cheques informes error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
