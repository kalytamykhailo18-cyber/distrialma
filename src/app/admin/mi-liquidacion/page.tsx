"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { PageTransition, Stagger, staggerStyle, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface LiqData {
  empleado: { cod: string; nombre: string; area: string; horasTurno: number };
  mes: string;
  haberes: {
    basico: number; presentismo: number; presentismoOriginal: number; pierdePresentismo: boolean;
    adicionalCaja: number; bono: number; viatico: number; plus: number;
    extraHoras: string; extraAmount: number; feriadoAmount: number;
    domingoAmount: number; domingosTrabajados: number;
    hourlyRate: number; dailyRate: number;
  };
  horas: { totalHoras: string; diasTrabajados: number; extraMinutos: number; tardeMinutos: number; tardeHoras: string };
  descuentos: { mercaderia: number; faltantes: number; suspensiones: number; diasSuspension: number; total: number };
  dias: Array<{ fecha: string; trabajado: number; descanso: number; tarde: number; entradas: string[]; salidas: string[] }>;
  resumen: { totalHaberes: number; totalAjustes: number; totalDescuentos: number; totalACobrar: number };
  error?: string;
}

function minToHHMM(mins: number): string {
  return Math.floor(Math.abs(mins) / 60) + ":" + String(Math.abs(mins) % 60).padStart(2, "0");
}

const DIAS = ["DOM", "LUN", "MAR", "MIE", "JUE", "VIE", "SAB"];

export default function MiLiquidacionPage() {
  const [data, setData] = useState<LiqData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });

  async function load() {
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/admin/mi-liquidacion?mes=${mes}`);
      const d = await res.json();
      if (d.error) setError(d.error);
      else setData(d);
    } catch { setError("Error de conexion"); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [mes]); // eslint-disable-line

  if (loading) return <LoadingCenter text="Cargando..." />;
  if (error) return <div className="max-w-3xl mx-auto px-4 py-12 text-center text-red-500">{error}</div>;
  if (!data) return null;

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Mi Liquidacion</h1>
        <p className="text-sm text-gray-500 mb-4">{data.empleado.nombre} — {data.empleado.area}</p>
      </Stagger>

      <Stagger delay={50}>
        <div className="flex gap-2 mb-4">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
            className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
        </div>
      </Stagger>

      {/* Summary */}
      <Stagger delay={100}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
            <div className="text-xs text-green-500">Haberes</div>
            <div className="text-lg font-bold text-green-700">{formatPrice(data.resumen.totalHaberes)}</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
            <div className="text-xs text-red-500">Descuentos</div>
            <div className="text-lg font-bold text-red-700">{formatPrice(data.resumen.totalDescuentos)}</div>
          </div>
          <div className="bg-gray-100 border border-gray-300 rounded-xl p-3 text-center col-span-2 sm:col-span-2">
            <div className="text-xs text-gray-500">Total a cobrar</div>
            <div className="text-xl font-bold text-gray-900">{formatPrice(data.resumen.totalACobrar)}</div>
          </div>
        </div>
      </Stagger>

      {/* Haberes detail */}
      <Stagger delay={150}>
        <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Haberes</h3>
          <div className="space-y-1 text-sm">
            {([["Basico", data.haberes.basico], ["Presentismo", data.haberes.presentismo],
              ["Adicional caja", data.haberes.adicionalCaja], ["Bono", data.haberes.bono],
              ["Viatico", data.haberes.viatico], ["Plus", data.haberes.plus]] as [string, number][])
              .filter(([, v]) => v > 0).map(([label, val]) => (
              <div key={label} className={`flex justify-between ${hoverRow} px-2 py-1 rounded`}>
                <span className="text-gray-600">{label}</span>
                <span className="font-medium">{formatPrice(val)}</span>
              </div>
            ))}
            {data.haberes.extraAmount > 0 && (
              <div className={`flex justify-between ${hoverRow} px-2 py-1 rounded`}>
                <span className="text-purple-600">Horas extra ({data.haberes.extraHoras})</span>
                <span className="font-medium text-purple-600">{formatPrice(data.haberes.extraAmount)}</span>
              </div>
            )}
            {data.haberes.domingoAmount > 0 && (
              <div className={`flex justify-between ${hoverRow} px-2 py-1 rounded`}>
                <span className="text-blue-600">Plus domingos ({data.haberes.domingosTrabajados})</span>
                <span className="font-medium text-blue-600">{formatPrice(data.haberes.domingoAmount)}</span>
              </div>
            )}
            {data.haberes.feriadoAmount > 0 && (
              <div className={`flex justify-between ${hoverRow} px-2 py-1 rounded`}>
                <span className="text-green-600">Feriado trabajado</span>
                <span className="font-medium text-green-600">{formatPrice(data.haberes.feriadoAmount)}</span>
              </div>
            )}
            {data.haberes.pierdePresentismo && data.haberes.presentismoOriginal > 0 && (
              <div className="px-2 py-1 text-xs text-red-500 bg-red-50 rounded mt-1">
                Pierde presentismo ({formatPrice(data.haberes.presentismoOriginal)}) por tardanzas mayores a 30 min
              </div>
            )}
          </div>
          <div className="mt-3 text-xs text-gray-400">
            {data.horas.diasTrabajados} dias trabajados — {data.horas.totalHoras} horas
            {data.horas.tardeMinutos > 0 && <span className="text-red-400 ml-2">Tardanzas: {data.horas.tardeHoras}</span>}
          </div>
        </div>
      </Stagger>

      {/* Descuentos */}
      {data.resumen.totalDescuentos > 0 && (
        <Stagger delay={200}>
          <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Descuentos</h3>
            <div className="space-y-1 text-sm">
              {data.descuentos.mercaderia > 0 && (
                <div className="flex justify-between px-2 py-1"><span className="text-gray-600">Mercaderia</span><span className="text-red-500">-{formatPrice(data.descuentos.mercaderia)}</span></div>
              )}
              {data.descuentos.faltantes > 0 && (
                <div className="flex justify-between px-2 py-1"><span className="text-gray-600">Faltantes caja</span><span className="text-red-500">-{formatPrice(data.descuentos.faltantes)}</span></div>
              )}
              {data.descuentos.suspensiones > 0 && (
                <div className="flex justify-between px-2 py-1"><span className="text-gray-600">Suspension ({data.descuentos.diasSuspension} dias)</span><span className="text-red-500">-{formatPrice(data.descuentos.suspensiones)}</span></div>
              )}
            </div>
          </div>
        </Stagger>
      )}

      {/* Daily hours */}
      {data.dias && data.dias.length > 0 && (
        <Stagger delay={250}>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-sm font-semibold text-gray-700">Detalle de horarios</div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b text-gray-500">
                    <th className="px-2 py-1.5 text-left">Fecha</th>
                    <th className="px-2 py-1.5 text-left">Dia</th>
                    <th className="px-2 py-1.5">Entrada</th>
                    <th className="px-2 py-1.5">Salida</th>
                    <th className="px-2 py-1.5 text-right">Total</th>
                    <th className="px-2 py-1.5 text-right">Desc.</th>
                    <th className="px-2 py-1.5 text-right">Tarde</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {data.dias.filter((d) => d.trabajado > 0 || d.entradas.length > 0).map((d, i) => {
                    const [yy, mm, dd] = d.fecha.split("-");
                    const dow = new Date(parseInt(yy), parseInt(mm) - 1, parseInt(dd)).getDay();
                    return (
                      <tr key={d.fecha} className={`${dow === 0 ? "bg-blue-50" : ""} ${hoverRow}`} style={staggerStyle(true, i, 0, 5)}>
                        <td className="px-2 py-1">{dd}/{mm}</td>
                        <td className="px-2 py-1">{DIAS[dow]}</td>
                        <td className="px-2 py-1 text-center">{d.entradas[0] || ""}</td>
                        <td className="px-2 py-1 text-center">{d.salidas[0] || ""}</td>
                        <td className="px-2 py-1 text-right font-medium">{minToHHMM(d.trabajado)}</td>
                        <td className={`px-2 py-1 text-right ${d.descanso > 15 ? "text-red-600 font-bold" : "text-gray-400"}`}>{d.descanso > 0 ? minToHHMM(d.descanso) : ""}</td>
                        <td className="px-2 py-1 text-right text-red-500">{d.tarde > 0 ? minToHHMM(d.tarde) : ""}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Stagger>
      )}
    </PageTransition>
  );
}
