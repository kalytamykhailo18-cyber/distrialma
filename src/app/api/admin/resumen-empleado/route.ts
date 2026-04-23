import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

// GET: combined monthly summary per employee (movimientos + diferencias de caja)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || process.env.RESEND_API_KEY?.slice(0, 16);
  const isCron = !!secret && secret === cronSecret;

  if (!isCron && !(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const mes = searchParams.get("mes") || new Date().toISOString().slice(0, 7);
  const empleadoCod = searchParams.get("empleadoCod");

  try {
    const start = new Date(`${mes}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    // Get employees
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");
    const empResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
      ORDER BY Nombre
    `);
    const allEmpleados: Array<{ cod: string; nombre: string }> = empResult.recordset;
    const totalEmpleados = allEmpleados.length;

    // Get all approved movements for the month
    const movements = await prisma.internalMovement.findMany({
      where: { estado: "aprobado", createdAt: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    // Get all faltantes for the month, charged or not
    const cierres = await prisma.cierreCaja.findMany({
      where: { createdAt: { gte: start, lt: end } },
      select: { id: true, sucursal: true, responsable: true, usuario: true, diferencia: true, cantVentas: true, createdAt: true, chargedAt: true, chargedBy: true },
    });

    type DescuentoItem = { nombre: string; cantidad: number; costo: number };
    type Descuento = {
      fecha: string;
      concepto: string;
      detalle: string;
      items: DescuentoItem[];
      monto: number;
      origen: "movimiento" | "faltante";
      cargadoPor: string;
    };
    const empMap = new Map<string, { cod: string; nombre: string; descuentos: Descuento[]; total: number }>();

    const addDescuento = (cod: string, nombre: string, d: Descuento) => {
      if (!empMap.has(cod)) empMap.set(cod, { cod, nombre, descuentos: [], total: 0 });
      const entry = empMap.get(cod)!;
      entry.descuentos.push(d);
      entry.total += d.monto;
    };

    // Movements
    for (const mov of movements) {
      const productos = mov.items.map((i) => `${i.productName} x${Number(i.cantidad)}`).join(", ");
      const itemsList: DescuentoItem[] = mov.items.map((i) => ({ nombre: i.productName, cantidad: Number(i.cantidad), costo: Number(i.costo || 0) }));
      const fecha = mov.createdAt.toISOString();
      const montoTotal = mov.items.reduce((sum, i) => sum + Number(i.costo || 0) * Number(i.cantidad), 0);

      if ((mov.destino === "Rotura de empleado" || mov.destino === "Descuento empleados") && mov.empleados) {
        const emps: Array<{ cod: string; nombre: string }> = JSON.parse(mov.empleados);
        const shareCount = emps.length;
        const montoPorEmp = shareCount > 0 ? Math.round(montoTotal / shareCount) : 0;
        for (const emp of emps) {
          addDescuento(emp.cod, emp.nombre, {
            fecha,
            concepto: mov.destino || "Descuento",
            detalle: productos + (shareCount > 1 ? ` (compartido con ${shareCount})` : ""),
            items: itemsList,
            monto: montoPorEmp,
            origen: "movimiento",
            cargadoPor: mov.usuario || "",
          });
        }
      }

      if (mov.destino === "Descuento global" && totalEmpleados > 0) {
        const montoPorEmp = Math.round(montoTotal / totalEmpleados);
        for (const emp of allEmpleados) {
          addDescuento(emp.cod, emp.nombre, {
            fecha,
            concepto: "Descuento global",
            detalle: productos + ` (prorrateado entre ${totalEmpleados} empleados)`,
            items: itemsList,
            monto: montoPorEmp,
            origen: "movimiento",
            cargadoPor: mov.usuario || "",
          });
        }
      }
    }

    // Diferencias de caja (only faltantes that are charged get included — se asume que ya se decidio descontarlos)
    for (const c of cierres) {
      const dif = Number(c.diferencia);
      if (dif >= 0) continue; // skip non-negative
      if (!c.chargedAt) continue; // only include those charged to employee
      // Find employee by name (responsable or usuario)
      const nombre = (c.responsable || c.usuario || "").trim();
      if (!nombre) continue;
      // Try exact match first
      let emp = allEmpleados.find((e) => e.nombre.toUpperCase() === nombre.toUpperCase());
      if (!emp) {
        // Try contains match
        emp = allEmpleados.find((e) => e.nombre.toUpperCase().includes(nombre.toUpperCase()) || nombre.toUpperCase().includes(e.nombre.toUpperCase()));
      }
      if (!emp) continue;
      addDescuento(emp.cod, emp.nombre, {
        fecha: c.createdAt.toISOString(),
        concepto: "Faltante de caja",
        detalle: `Suc ${c.sucursal} - ${c.cantVentas} ventas`,
        items: [],
        monto: Math.abs(dif),
        origen: "faltante",
        cargadoPor: (c.chargedBy || c.usuario || "").toString(),
      });
    }

    let empleados = Array.from(empMap.values())
      .filter((e) => e.total > 0)
      .map((e) => ({
        ...e,
        descuentos: e.descuentos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
      }))
      .sort((a, b) => b.total - a.total);

    if (empleadoCod) {
      empleados = empleados.filter((e) => e.cod === empleadoCod);
    }

    return NextResponse.json({ mes, empleados });
  } catch (error) {
    console.error("resumen empleado error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
