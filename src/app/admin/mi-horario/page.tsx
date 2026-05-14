"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { PageTransition, Stagger, staggerStyle, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface DayResult {
  fecha: string;
  dia: string;
  entradas: string[];
  salidas: string[];
  totalMinutos: number;
  extraMinutos: number;
  tardeMinutos: number;
  incompleto: boolean;
}

function minutesToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function MiHorarioPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    empleado: { nombre: string; turnoInicio: string; turnoFin: string };
    mes: string;
    dias: DayResult[];
    resumen: { totalHoras: number; extras: number; tardes: number; diasTrabajados: number; diasIncompletos: number };
  } | null>(null);
  const [error, setError] = useState("");
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    setLoading(true);
    setError("");
    fetch(`/api/admin/mi-horario?mes=${mes}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(() => setError("Error al cargar"))
      .finally(() => setLoading(false));
  }, [mes]);

  if (loading) return <LoadingCenter text="Cargando horarios..." />;
  if (error) return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-gray-400">{error}</div>;
  if (!data) return null;

  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  return (
    <PageTransition className="max-w-3xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Mi Horario</h1>
        <div className="flex items-center gap-3 mb-4">
          <p className="text-sm text-gray-500">{data.empleado.nombre} — Turno {data.empleado.turnoInicio} a {data.empleado.turnoFin}</p>
          {isAdmin && (
            <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
              className="px-2 py-1 text-sm border border-brand-400 rounded-lg focus:outline-none focus:border-brand-600" />
          )}
        </div>
      </Stagger>

      {/* Summary */}
      <Stagger delay={50}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <div className="text-xs text-green-500">Días trabajados</div>
            <div className="text-lg font-bold text-green-700">{data.resumen.diasTrabajados}</div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
            <div className="text-xs text-blue-500">Total horas</div>
            <div className="text-lg font-bold text-blue-700">{minutesToHHMM(data.resumen.totalHoras)}</div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
            <div className="text-xs text-purple-500">Extras</div>
            <div className="text-lg font-bold text-purple-700">{minutesToHHMM(data.resumen.extras)}</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
            <div className="text-xs text-amber-500">Tardanzas</div>
            <div className="text-lg font-bold text-amber-700">{minutesToHHMM(data.resumen.tardes)}</div>
          </div>
        </div>
      </Stagger>

      {/* Daily detail */}
      <Stagger delay={100}>
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b text-left text-xs text-gray-500">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Día</th>
                <th className="px-3 py-2">Entrada</th>
                <th className="px-3 py-2">Salida</th>
                <th className="px-3 py-2 text-right">Horas</th>
                <th className="px-3 py-2 text-right">Extra</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.dias.filter((d) => d.entradas.length > 0 || d.salidas.length > 0).map((d, i) => (
                <tr key={d.fecha} className={hoverRow} style={staggerStyle(true, i, 0, 10)}>
                  <td className="px-3 py-2 text-xs text-gray-600">{new Date(d.fecha + "T12:00:00").toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" })}</td>
                  <td className="px-3 py-2 text-xs">{d.dia.slice(0, 3)}</td>
                  <td className="px-3 py-2 text-xs text-green-600">{d.entradas.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs text-red-500">{d.salidas.join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs text-right font-medium">{minutesToHHMM(d.totalMinutos)}</td>
                  <td className="px-3 py-2 text-xs text-right text-purple-600">{d.extraMinutos > 0 ? minutesToHHMM(d.extraMinutos) : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stagger>
    </PageTransition>
  );
}
