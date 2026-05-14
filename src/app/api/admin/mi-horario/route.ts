import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const DIAS = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const userInfo = session.user as { role?: string; empleadoCod?: string | null };
  const empleadoCod = userInfo.empleadoCod;
  if (!empleadoCod) return NextResponse.json({ error: "No tenés legajo de empleado asociado" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") || (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  })();

  // Non-admin can only see current month
  const role = userInfo.role;
  if (role !== "admin") {
    const now = new Date();
    const currentMes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    if (mes !== currentMes) return NextResponse.json({ error: "Solo podés ver el mes actual" }, { status: 403 });
  }

  try {
    const emp = await prisma.fichadorEmpleado.findFirst({ where: { empleadoCod, activo: true } });
    if (!emp) return NextResponse.json({ error: "Empleado no encontrado en el fichador" }, { status: 404 });

    const [year, month] = mes.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const punches = await prisma.fichadorPunch.findMany({
      where: { empleadoId: emp.id, fecha: { gte: startDate, lte: endDate } },
      orderBy: [{ fecha: "asc" }, { hora: "asc" }],
    });

    const punchByDate = new Map<string, Array<{ hora: string; tipo: string }>>();
    for (const p of punches) {
      const key = p.fecha.toISOString().slice(0, 10);
      if (!punchByDate.has(key)) punchByDate.set(key, []);
      punchByDate.get(key)!.push({ hora: p.hora, tipo: p.tipo });
    }

    const turnoInicioMin = timeToMinutes(emp.turnoInicio);
    const days = [];
    let totalMinutosMonth = 0, totalExtraMonth = 0, totalTardeMonth = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const dia = DIAS[dayOfWeek];
      const dayPunches = punchByDate.get(dateStr) || [];

      const entradas: string[] = [];
      const salidas: string[] = [];
      for (const p of dayPunches) {
        const list = p.tipo === "Entrada" ? entradas : salidas;
        const lastTime = list.length > 0 ? list[list.length - 1] : null;
        if (lastTime && Math.abs(timeToMinutes(p.hora) - timeToMinutes(lastTime)) < 2) continue;
        list.push(p.hora.slice(0, 5));
      }

      let totalMinutos = 0;
      let incompleto = false;
      if (entradas.length > 0 && salidas.length > 0) {
        const allEvents = [
          ...entradas.map((h) => ({ time: h, type: "E" })),
          ...salidas.map((h) => ({ time: h, type: "S" })),
        ].sort((a, b) => a.time.localeCompare(b.time));

        let currentEntry: string | null = null;
        for (const event of allEvents) {
          if (event.type === "E") currentEntry = event.time;
          else if (event.type === "S" && currentEntry) {
            totalMinutos += Math.max(0, timeToMinutes(event.time) - timeToMinutes(currentEntry));
            currentEntry = null;
          }
        }
        if (currentEntry) incompleto = true;
      } else if (entradas.length > 0 || salidas.length > 0) {
        incompleto = true;
      }

      const shiftMinutos = (emp.horasTurno || 9) * 60;
      const extraMinutos = emp.horasExtras && totalMinutos > shiftMinutos ? totalMinutos - shiftMinutos : 0;
      let tardeMinutos = 0;
      if (emp.tipoTurno === "fijo" && entradas.length > 0 && totalMinutos > 0) {
        const firstEntry = timeToMinutes(entradas[0]);
        if (firstEntry > turnoInicioMin) tardeMinutos = firstEntry - turnoInicioMin;
      }

      totalMinutosMonth += totalMinutos;
      totalExtraMonth += extraMinutos;
      totalTardeMonth += tardeMinutos;

      days.push({ fecha: dateStr, dia, entradas, salidas, totalMinutos, extraMinutos, tardeMinutos, incompleto });
    }

    return NextResponse.json({
      empleado: { nombre: emp.nombre, turnoInicio: emp.turnoInicio, turnoFin: emp.turnoFin },
      mes,
      dias: days,
      resumen: {
        totalHoras: totalMinutosMonth,
        extras: totalExtraMonth,
        tardes: totalTardeMonth,
        diasTrabajados: days.filter((d) => d.totalMinutos > 0).length,
        diasIncompletos: days.filter((d) => d.incompleto).length,
      },
    });
  } catch (error) {
    console.error("Mi horario error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
