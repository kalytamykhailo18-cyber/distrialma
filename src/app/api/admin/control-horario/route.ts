import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface DayResult {
  fecha: string;
  dia: string;
  entradas: string[];
  salidas: string[];
  totalMinutos: number;
  descansoMinutos: number;
  descansoReal: number;
  extraMinutos: number;
  tardeMinutos: number;
  incompleto: boolean;
}

const DIAS = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
const BREAK_MINUTES = 15;

function timeToMinutes(hhmm: string): number {
  const parts = hhmm.split(":");
  return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes"); // YYYY-MM
  const empleadoId = searchParams.get("empleado"); // fichador ID

  if (!mes || !empleadoId) {
    return NextResponse.json({ error: "mes y empleado requeridos" }, { status: 400 });
  }

  try {
    const emp = await prisma.fichadorEmpleado.findUnique({ where: { id: parseInt(empleadoId) } });
    if (!emp) return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });

    const [year, month] = mes.split("-").map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    // Get all punches for this employee in this month
    const punches = await prisma.fichadorPunch.findMany({
      where: {
        empleadoId: emp.id,
        fecha: { gte: startDate, lte: endDate },
      },
      orderBy: [{ fecha: "asc" }, { hora: "asc" }],
    });

    // Group by date
    const punchByDate = new Map<string, Array<{ hora: string; tipo: string }>>();
    for (const p of punches) {
      const key = p.fecha.toISOString().slice(0, 10);
      if (!punchByDate.has(key)) punchByDate.set(key, []);
      punchByDate.get(key)!.push({ hora: p.hora, tipo: p.tipo });
    }

    const turnoInicioMin = timeToMinutes(emp.turnoInicio);
    const days: DayResult[] = [];
    let totalMinutosMonth = 0;
    let totalExtraMonth = 0;
    let totalTardeMonth = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const dayOfWeek = new Date(year, month - 1, d).getDay();
      const dia = DIAS[dayOfWeek];

      const dayPunches = punchByDate.get(dateStr) || [];

      // Separate entries and exits, dedup within 2 minutes
      const entradas: string[] = [];
      const salidas: string[] = [];

      for (const p of dayPunches) {
        const list = p.tipo === "Entrada" ? entradas : salidas;
        const lastTime = list.length > 0 ? list[list.length - 1] : null;
        if (lastTime) {
          const lastMin = timeToMinutes(lastTime);
          const thisMin = timeToMinutes(p.hora);
          if (Math.abs(thisMin - lastMin) < 2) continue; // Skip duplicate within 2 min
        }
        list.push(p.hora.slice(0, 5)); // HH:MM
      }

      // Calculate total worked time by pairing entries with exits
      let totalMinutos = 0;
      let incompleto = false;
      let descansoReal = 0;

      if (entradas.length > 0 && salidas.length > 0) {
        const allEvents = [
          ...entradas.map((h) => ({ time: h, type: "E" })),
          ...salidas.map((h) => ({ time: h, type: "S" })),
        ].sort((a, b) => a.time.localeCompare(b.time));

        let currentEntry: string | null = null;
        let lastExit: string | null = null;
        for (const event of allEvents) {
          if (event.type === "E") {
            // Gap between last exit and this entry = break
            if (lastExit) {
              const gap = timeToMinutes(event.time) - timeToMinutes(lastExit);
              if (gap > 0) descansoReal += gap;
            }
            currentEntry = event.time;
          } else if (event.type === "S" && currentEntry) {
            const entryMin = timeToMinutes(currentEntry);
            const exitMin = timeToMinutes(event.time);
            totalMinutos += Math.max(0, exitMin - entryMin);
            lastExit = event.time;
            currentEntry = null;
          }
        }
        if (currentEntry) incompleto = true;
      } else if (entradas.length > 0 && salidas.length === 0) {
        incompleto = true;
      } else if (salidas.length > 0 && entradas.length === 0) {
        incompleto = true;
      }

      // Break deduction (only if worked)
      const descansoMinutos = totalMinutos > 0 ? BREAK_MINUTES : 0;

      // Overtime: total - shift hours (configurable per employee)
      const shiftMinutos = (emp.horasTurno || 9) * 60;
      const extraMinutos = emp.horasExtras && totalMinutos > shiftMinutos ? totalMinutos - shiftMinutos : 0;

      // Late arrival (only for fixed schedule employees)
      let tardeMinutos = 0;
      if (emp.tipoTurno === "fijo" && entradas.length > 0 && totalMinutos > 0) {
        const firstEntry = timeToMinutes(entradas[0]);
        if (firstEntry > turnoInicioMin) {
          tardeMinutos = firstEntry - turnoInicioMin;
        }
      }

      totalMinutosMonth += totalMinutos;
      totalExtraMonth += extraMinutos;
      totalTardeMonth += tardeMinutos;

      days.push({
        fecha: `${String(d).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
        dia,
        entradas,
        salidas,
        totalMinutos,
        descansoMinutos,
        descansoReal,
        extraMinutos,
        tardeMinutos,
        incompleto,
      });
    }

    return NextResponse.json({
      empleado: {
        id: emp.id,
        nombre: emp.nombre,
        area: emp.area,
        turno: emp.turno,
        tipoTurno: emp.tipoTurno,
        turnoInicio: emp.turnoInicio,
        turnoFin: emp.turnoFin,
        horasExtras: emp.horasExtras,
      },
      mes,
      days,
      resumen: {
        totalHoras: minutesToHHMM(totalMinutosMonth),
        totalMinutos: totalMinutosMonth,
        extraHoras: minutesToHHMM(totalExtraMonth),
        extraMinutos: totalExtraMonth,
        tardeHoras: minutesToHHMM(totalTardeMonth),
        tardeMinutos: totalTardeMonth,
        diasTrabajados: days.filter((d) => d.totalMinutos > 0).length,
        diasIncompletos: days.filter((d) => d.incompleto).length,
      },
    });
  } catch (error) {
    console.error("Control horario error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
