import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: salary config for all employees, or liquidacion calc for specific employee+month
export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const empleadoCod = searchParams.get("empleado");
  const mes = searchParams.get("mes"); // YYYY-MM

  // If no specific employee, return all salary configs
  if (!empleadoCod) {
    const sueldos = await prisma.empleadoSueldo.findMany();
    const fichadorEmps = await prisma.fichadorEmpleado.findMany({
      where: { activo: true, empleadoCod: { not: null } },
      orderBy: { nombre: "asc" },
    });
    return NextResponse.json({
      empleados: fichadorEmps.map((e) => {
        const sueldo = sueldos.find((s) => s.empleadoCod === e.empleadoCod);
        return {
          id: e.id,
          nombre: e.nombre,
          area: e.area,
          empleadoCod: e.empleadoCod,
          basico: Number(sueldo?.basico || 0),
          presentismo: Number(sueldo?.presentismo || 0),
          adicionalCaja: Number(sueldo?.adicionalCaja || 0),
          bono: Number(sueldo?.bono || 0),
          viatico: Number(sueldo?.viatico || 0),
          plus: Number(sueldo?.plus || 0),
        };
      }),
    });
  }

  // Specific employee + month: calculate liquidacion
  if (!mes) return NextResponse.json({ error: "mes requerido" }, { status: 400 });

  try {
    const fichEmp = await prisma.fichadorEmpleado.findFirst({
      where: { empleadoCod: empleadoCod },
    });
    if (!fichEmp) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

    // Get salary config
    const sueldo = await prisma.empleadoSueldo.findUnique({ where: { empleadoCod } });
    const basico = Number(sueldo?.basico || 0);
    const presentismo = Number(sueldo?.presentismo || 0);
    const adicionalCaja = Number(sueldo?.adicionalCaja || 0);
    const bono = Number(sueldo?.bono || 0);
    const viatico = Number(sueldo?.viatico || 0);
    const plus = Number(sueldo?.plus || 0);

    // Get hours data from control-horario logic
    const [year, month] = mes.split("-").map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const punches = await prisma.fichadorPunch.findMany({
      where: { empleadoId: fichEmp.id, fecha: { gte: startDate, lte: endDate } },
      orderBy: [{ fecha: "asc" }, { hora: "asc" }],
    });

    // Calculate hours (simplified - same logic as control-horario)
    const byDate = new Map<string, Array<{ hora: string; tipo: string }>>();
    for (const p of punches) {
      const key = p.fecha.toISOString().slice(0, 10);
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push({ hora: p.hora, tipo: p.tipo });
    }

    const timeToMin = (h: string) => { const p = h.split(":"); return parseInt(p[0]) * 60 + parseInt(p[1]); };
    const shiftMin = (fichEmp.horasTurno || 9) * 60;
    let totalMinutos = 0;
    let totalExtra = 0;
    let diasTrabajados = 0;

    for (const dayPunches of Array.from(byDate.values())) {
      const entradas: string[] = [];
      const salidas: string[] = [];
      for (const p of dayPunches) {
        const list = p.tipo === "Entrada" ? entradas : salidas;
        const last = list.length > 0 ? list[list.length - 1] : null;
        if (last && Math.abs(timeToMin(p.hora) - timeToMin(last)) < 2) continue;
        list.push(p.hora.slice(0, 5));
      }
      let worked = 0;
      if (entradas.length > 0 && salidas.length > 0) {
        const all = [...entradas.map((h) => ({ time: h, type: "E" })), ...salidas.map((h) => ({ time: h, type: "S" }))].sort((a, b) => a.time.localeCompare(b.time));
        let cur: string | null = null;
        for (const ev of all) {
          if (ev.type === "E") cur = ev.time;
          else if (ev.type === "S" && cur) { worked += timeToMin(ev.time) - timeToMin(cur); cur = null; }
        }
      }
      if (worked > 0) {
        diasTrabajados++;
        totalMinutos += worked;
        if (fichEmp.horasExtras && worked > shiftMin) totalExtra += worked - shiftMin;
      }
    }

    // Hourly rate for overtime: basico / (shift hours * working days in month)
    const daysInMonth = new Date(year, month, 0).getDate();
    const workingDays = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month - 1, i + 1).getDay()).filter((d) => d !== 0).length; // exclude sundays
    const hourlyRate = basico > 0 && workingDays > 0 ? basico / (workingDays * (fichEmp.horasTurno || 9)) : 0;
    const extraAmount = Math.round(hourlyRate * 2 * (totalExtra / 60)); // overtime at 100% = x2

    // Get descuentos from existing module (InternalMovement + CierreCaja diferencias)
    const descuentosResult = await getDescuentos(empleadoCod, mes);

    // Get manual adjustments
    const ajustes = await prisma.liquidacionAjuste.findMany({
      where: { empleadoCod, mes },
      orderBy: { createdAt: "asc" },
    });

    const totalHaberes = basico + presentismo + adicionalCaja + bono + viatico + plus + extraAmount;
    const totalAjustes = ajustes.reduce((s, a) => s + Number(a.monto), 0);
    const totalDescuentos = descuentosResult.total;
    const totalACobrar = totalHaberes + totalAjustes - totalDescuentos;

    return NextResponse.json({
      empleado: { cod: empleadoCod, nombre: fichEmp.nombre, area: fichEmp.area },
      mes,
      haberes: {
        basico, presentismo, adicionalCaja, bono, viatico, plus,
        extraHoras: Math.floor(totalExtra / 60) + ":" + String(totalExtra % 60).padStart(2, "0"),
        extraAmount,
        hourlyRate: Math.round(hourlyRate),
      },
      horas: {
        totalMinutos,
        totalHoras: Math.floor(totalMinutos / 60) + ":" + String(totalMinutos % 60).padStart(2, "0"),
        diasTrabajados,
        extraMinutos: totalExtra,
      },
      descuentos: descuentosResult,
      ajustes: ajustes.map((a) => ({ id: a.id, concepto: a.concepto, monto: Number(a.monto), createdAt: a.createdAt.toISOString() })),
      resumen: { totalHaberes, totalAjustes, totalDescuentos, totalACobrar },
    });
  } catch (error) {
    console.error("Liquidacion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: save salary config or add adjustment
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const body = await req.json();

  // Save salary config
  if (body.action === "sueldo") {
    const { empleadoCod, basico, presentismo, adicionalCaja, bono, viatico, plus } = body;
    if (!empleadoCod) return NextResponse.json({ error: "empleadoCod requerido" }, { status: 400 });
    await prisma.empleadoSueldo.upsert({
      where: { empleadoCod },
      update: {
        basico: parseFloat(basico) || 0,
        presentismo: parseFloat(presentismo) || 0,
        adicionalCaja: parseFloat(adicionalCaja) || 0,
        bono: parseFloat(bono) || 0,
        viatico: parseFloat(viatico) || 0,
        plus: parseFloat(plus) || 0,
      },
      create: {
        empleadoCod,
        basico: parseFloat(basico) || 0,
        presentismo: parseFloat(presentismo) || 0,
        adicionalCaja: parseFloat(adicionalCaja) || 0,
        bono: parseFloat(bono) || 0,
        viatico: parseFloat(viatico) || 0,
        plus: parseFloat(plus) || 0,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // Add adjustment
  if (body.action === "ajuste") {
    const { empleadoCod, mes, concepto, monto } = body;
    if (!empleadoCod || !mes || !concepto) return NextResponse.json({ error: "Datos requeridos" }, { status: 400 });
    const ajuste = await prisma.liquidacionAjuste.create({
      data: { empleadoCod, mes, concepto, monto: parseFloat(monto) || 0 },
    });
    return NextResponse.json({ ok: true, id: ajuste.id });
  }

  return NextResponse.json({ error: "action requerida" }, { status: 400 });
}

// DELETE: remove adjustment
export async function DELETE(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  await prisma.liquidacionAjuste.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

// Helper: get descuentos from existing modules
async function getDescuentos(empleadoCod: string, mes: string) {
  const [year, month] = mes.split("-").map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);

  // Descuentos from InternalMovement (shared items charged to employee)
  let movDescuentos = 0;
  try {
    const movs = await prisma.internalMovement.findMany({
      where: {
        subtipo: "descuento_empleados",
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { items: true },
    });
    for (const mov of movs) {
      const empleados = JSON.parse(mov.empleados || "[]");
      if (empleados.includes(empleadoCod) || empleados.includes(empleadoCod.trim())) {
        const share = empleados.length > 0 ? 1 / empleados.length : 1;
        const movTotal = mov.items.reduce((s, it) => s + Number(it.costo || 0) * Number(it.cantidad), 0);
        movDescuentos += movTotal * share;
      }
    }
  } catch {}

  // Faltantes from CierreCaja diferencias
  const faltantes = 0;
  try {
    const cierres = await prisma.cierreCaja.findMany({
      where: {
        createdAt: { gte: startDate, lte: endDate },
      },
    });
    // Check diferencias charged to this employee
    for (const cierre of cierres) {
      if (Number(cierre.diferencia) < 0) {
        // Faltante — check if this employee was responsible
        // Match by usuario name to empleado
        // This is approximate — would need proper linking
      }
    }
  } catch {}

  return {
    mercaderia: Math.round(movDescuentos),
    faltantes: Math.round(faltantes),
    total: Math.round(movDescuentos + faltantes),
  };
}
