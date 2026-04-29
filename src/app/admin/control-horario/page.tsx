"use client";

import { useEffect, useState, useRef } from "react";
import { HiOutlineUpload, HiOutlineCheck, HiOutlineX, HiOutlineClock, HiOutlineCog } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface FichadorEmpleado {
  id: number;
  legajoId: number;
  nombre: string;
  area: string | null;
  turno: string | null;
  empleadoCod: string | null;
  horasExtras: boolean;
  tipoTurno: string;
  activo: boolean;
  horasTurno: number;
  turnoInicio: string;
  turnoFin: string;
  punches: number;
}

interface PtEmpleado { cod: string; nombre: string }

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

interface HorarioData {
  empleado: { id: number; nombre: string; area: string; turnoInicio: string; turnoFin: string; horasExtras: boolean };
  mes: string;
  days: DayResult[];
  resumen: { totalHoras: string; extraHoras: string; tardeHoras: string; diasTrabajados: number; diasIncompletos: number };
}

function minToHHMM(mins: number): string {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

export default function ControlHorarioPage() {
  const [tab, setTab] = useState<"horario" | "config">("horario");
  const [empleados, setEmpleados] = useState<FichadorEmpleado[]>([]);
  const [ptEmpleados, setPtEmpleados] = useState<PtEmpleado[]>([]);
  const [totalPunches, setTotalPunches] = useState(0);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [saving, setSaving] = useState<number | null>(null);
  const [filter, setFilter] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Horario view state
  const [selectedEmp, setSelectedEmp] = useState<number | null>(null);
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [horarioData, setHorarioData] = useState<HorarioData | null>(null);
  const [loadingHorario, setLoadingHorario] = useState(false);
  const [areaFilter, setAreaFilter] = useState("");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/fichador");
      const data = await res.json();
      setEmpleados(data.empleados || []);
      setPtEmpleados(data.ptEmpleados || []);
      setTotalPunches(data.totalPunches || 0);
      if (!selectedEmp && data.empleados?.length > 0) {
        const firstActive = data.empleados.find((e: FichadorEmpleado) => e.activo);
        if (firstActive) setSelectedEmp(firstActive.id);
      }
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    if (selectedEmp && mes) loadHorario();
  }, [selectedEmp, mes]); // eslint-disable-line

  async function loadHorario() {
    if (!selectedEmp) return;
    setLoadingHorario(true);
    try {
      const res = await fetch(`/api/admin/control-horario?mes=${mes}&empleado=${selectedEmp}`);
      const data = await res.json();
      setHorarioData(data.error ? null : data);
    } catch {}
    setLoadingHorario(false);
  }

  async function handleImport(file: File) {
    setImporting(true); setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/fichador", { method: "POST", body: formData });
      const data = await res.json();
      if (data.ok) {
        setImportResult(`Empleados: ${data.employees.imported} nuevos. Fichadas: ${data.punches.imported} importadas, ${data.punches.duplicates} duplicadas.`);
        loadData();
      } else setImportResult(`Error: ${data.error}`);
    } catch { setImportResult("Error de conexion"); }
    setImporting(false);
  }

  async function updateEmpleado(id: number, field: string, value: unknown) {
    setSaving(id);
    try {
      await fetch("/api/admin/fichador", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, [field]: value }),
      });
      setEmpleados((prev) => prev.map((e) => e.id === id ? { ...e, [field]: value } : e));
    } catch {}
    setSaving(null);
  }

  const areas = Array.from(new Set(empleados.map((e) => e.area).filter((a): a is string => !!a)));
  const [showInactive, setShowInactive] = useState(false);
  const filteredEmps = empleados.filter((e) => {
    if (!e.activo) return false; // Always hide inactive from horario
    if (areaFilter && e.area !== areaFilter) return false;
    if (filter && !e.nombre.toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });
  const configFiltered = empleados.filter((e) => {
    if (!showInactive && !e.activo) return false;
    if (filter && !e.nombre.toLowerCase().includes(filter.toLowerCase()) && !(e.area || "").toLowerCase().includes(filter.toLowerCase())) return false;
    return true;
  });
  const mapped = empleados.filter((e) => e.empleadoCod).length;

  if (loading) return <LoadingCenter text="Cargando fichador..." />;

  return (
    <PageTransition className="max-w-6xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Control Horario</h1>
            <p className="text-sm text-gray-500">{empleados.length} empleados, {totalPunches.toLocaleString()} fichadas</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setTab("horario")} className={`px-3 py-1.5 text-sm rounded-lg ${springBtn} ${tab === "horario" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}>
              <HiOutlineClock className="w-4 h-4 inline mr-1" />Horario
            </button>
            <button onClick={() => setTab("config")} className={`px-3 py-1.5 text-sm rounded-lg ${springBtn} ${tab === "config" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}>
              <HiOutlineCog className="w-4 h-4 inline mr-1" />Config
            </button>
          </div>
        </div>
      </Stagger>

      {importResult && (
        <div className="rounded-xl p-3 mb-4 border bg-green-50 border-green-300 text-sm text-green-700">{importResult}</div>
      )}

      {/* ===== HORARIO TAB ===== */}
      {tab === "horario" && (
        <>
          <Stagger delay={50}>
            <div className="flex flex-wrap gap-2 mb-4">
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
                className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              <select value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}
                className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500 bg-white">
                <option value="">Todas las areas</option>
                {areas.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={selectedEmp || ""} onChange={(e) => setSelectedEmp(parseInt(e.target.value))}
                className="flex-1 min-w-[200px] px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500 bg-white">
                {filteredEmps.map((e) => <option key={e.id} value={e.id}>{e.nombre} ({e.area || "sin area"})</option>)}
              </select>
            </div>
          </Stagger>

          {loadingHorario ? <LoadingCenter text="Calculando horas..." /> : horarioData ? (
            <Stagger delay={100}>
              {/* Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-blue-500">Total horas</div>
                  <div className="text-lg font-bold text-blue-700">{horarioData.resumen.totalHoras}</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-green-500">Dias trabajados</div>
                  <div className="text-lg font-bold text-green-700">{horarioData.resumen.diasTrabajados}</div>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-purple-500">Horas extra</div>
                  <div className="text-lg font-bold text-purple-700">{horarioData.resumen.extraHoras}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-red-500">Tarde</div>
                  <div className="text-lg font-bold text-red-700">{horarioData.resumen.tardeHoras}</div>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-amber-500">Incompletos</div>
                  <div className="text-lg font-bold text-amber-700">{horarioData.resumen.diasIncompletos}</div>
                </div>
              </div>

              {/* Daily table */}
              <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-left text-xs text-gray-500">
                        <th className="px-2 py-2">Fecha</th>
                        <th className="px-2 py-2">Dia</th>
                        <th className="px-2 py-2">Entrada</th>
                        <th className="px-2 py-2">Salida</th>
                        <th className="px-2 py-2">Entrada 2</th>
                        <th className="px-2 py-2">Salida 2</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="px-2 py-2 text-right">Descanso</th>
                        <th className="px-2 py-2 text-right">Extra</th>
                        <th className="px-2 py-2 text-right">Tarde</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {horarioData.days.map((day, i) => {
                        const isDomingo = day.dia === "DOMINGO";
                        const isIncomplete = day.incompleto;
                        const isLate = day.tardeMinutos > 0;
                        const bg = isDomingo ? "bg-gray-50 text-gray-400" : isIncomplete ? "bg-yellow-50" : isLate ? "" : "";
                        return (
                          <tr key={day.fecha} className={`${bg} ${hoverRow}`} style={staggerStyle(true, i, 0, 8)}>
                            <td className="px-2 py-1.5 text-xs">{day.fecha.slice(0, 5)}</td>
                            <td className="px-2 py-1.5 text-xs">{day.dia.slice(0, 3)}</td>
                            <td className="px-2 py-1.5 text-xs">{day.entradas[0] || ""}</td>
                            <td className="px-2 py-1.5 text-xs">{day.salidas[0] || (day.entradas.length > 0 && !isDomingo ? <span className="text-red-400">Sin salida</span> : "")}</td>
                            <td className="px-2 py-1.5 text-xs">{day.entradas[1] || ""}</td>
                            <td className="px-2 py-1.5 text-xs">{day.salidas[1] || ""}</td>
                            <td className="px-2 py-1.5 text-xs text-right font-medium">{day.totalMinutos > 0 ? minToHHMM(day.totalMinutos) : ""}</td>
                            <td className={`px-2 py-1.5 text-xs text-right ${day.descansoReal > 15 ? "text-red-600 font-bold" : "text-gray-400"}`}>{day.descansoReal > 0 ? minToHHMM(day.descansoReal) : ""}</td>
                            <td className="px-2 py-1.5 text-xs text-right text-purple-600">{day.extraMinutos > 0 ? minToHHMM(day.extraMinutos) : ""}</td>
                            <td className="px-2 py-1.5 text-xs text-right text-red-500">{day.tardeMinutos > 0 ? minToHHMM(day.tardeMinutos) : ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 font-bold text-xs border-t-2">
                        <td colSpan={6} className="px-2 py-2">TOTAL</td>
                        <td className="px-2 py-2 text-right">{horarioData.resumen.totalHoras}</td>
                        <td className="px-2 py-2 text-right"></td>
                        <td className="px-2 py-2 text-right text-purple-600">{horarioData.resumen.extraHoras}</td>
                        <td className="px-2 py-2 text-right text-red-500">{horarioData.resumen.tardeHoras}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </Stagger>
          ) : null}
        </>
      )}

      {/* ===== CONFIG TAB ===== */}
      {tab === "config" && (
        <>
          <Stagger delay={50}>
            <div className="flex flex-wrap gap-3 mb-4">
              <input type="file" ref={fileRef} accept=".mdb" className="hidden" onChange={(e) => e.target.files?.[0] && handleImport(e.target.files[0])} />
              <button onClick={() => fileRef.current?.click()} disabled={importing}
                className={`px-4 py-2 bg-brand-400 text-white rounded-xl text-sm font-medium flex items-center gap-2 disabled:opacity-50 ${springBtn}`}>
                <HiOutlineUpload className="w-4 h-4" />{importing ? "Importando..." : "Importar base.mdb"}
              </button>
              <span className="text-sm text-gray-400 self-center">Vinculados: {mapped}/{empleados.filter(e => e.activo).length}</span>
              <input type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
                placeholder="Filtrar..." className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500 min-w-[150px]" />
              <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="rounded" />
                Mostrar inactivos
              </label>
            </div>
          </Stagger>

          <Stagger delay={100}>
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left text-xs text-gray-500">
                      <th className="px-3 py-2">Act</th>
                      <th className="px-3 py-2">Nombre</th>
                      <th className="px-3 py-2">Area</th>
                      <th className="px-3 py-2">Fichadas</th>
                      <th className="px-3 py-2">Empleado PunTouch</th>
                      <th className="px-3 py-2">Extras</th>
                      <th className="px-3 py-2">Tipo</th>
                      <th className="px-3 py-2">Hs</th>
                      <th className="px-3 py-2">Turno</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {configFiltered.map((emp, i) => (
                      <tr key={emp.id} className={hoverRow} style={staggerStyle(true, i, 0, 10)}>
                        <td className="px-3 py-2">
                          <button onClick={() => updateEmpleado(emp.id, "activo", !emp.activo)}
                            className={`w-4 h-4 rounded border ${emp.activo ? "bg-green-500 border-green-500" : "bg-gray-200 border-gray-300"}`} />
                        </td>
                        <td className={`px-3 py-2 font-medium ${emp.activo ? "text-gray-900" : "text-gray-400 line-through"}`}>{emp.nombre}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{emp.area || "—"}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{emp.punches}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <select value={emp.empleadoCod || ""} onChange={(e) => updateEmpleado(emp.id, "empleadoCod", e.target.value)}
                              disabled={saving === emp.id}
                              className={`px-2 py-1 border rounded-lg text-xs focus:outline-none focus:border-brand-500 ${emp.empleadoCod ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}>
                              <option value="">Sin vincular</option>
                              {ptEmpleados.map((pt) => <option key={pt.cod} value={pt.cod}>{pt.nombre}</option>)}
                            </select>
                            {emp.empleadoCod ? <HiOutlineCheck className="w-4 h-4 text-green-500" /> : <HiOutlineX className="w-4 h-4 text-red-400" />}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <button onClick={() => updateEmpleado(emp.id, "horasExtras", !emp.horasExtras)}
                            className={`relative w-10 h-5 rounded-full transition-colors ${emp.horasExtras ? "bg-green-500" : "bg-gray-300"}`}>
                            <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${emp.horasExtras ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        </td>
                        <td className="px-3 py-2">
                          <select value={emp.tipoTurno} onChange={(e) => updateEmpleado(emp.id, "tipoTurno", e.target.value)}
                            className="px-1 py-1 border rounded-lg text-xs focus:outline-none focus:border-brand-500 bg-white">
                            <option value="fijo">Fijo</option>
                            <option value="rotativo">Rotativo</option>
                            <option value="cortado">Cortado</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select value={emp.horasTurno} onChange={(e) => updateEmpleado(emp.id, "horasTurno", e.target.value)}
                            className="px-1 py-1 border rounded-lg text-xs focus:outline-none focus:border-brand-500 bg-white w-14">
                            <option value={8}>8h</option>
                            <option value={9}>9h</option>
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <input type="time" value={emp.turnoInicio} onChange={(e) => updateEmpleado(emp.id, "turnoInicio", e.target.value)}
                              className="px-1 py-0.5 border rounded text-xs w-20 focus:outline-none focus:border-brand-500" />
                            <span className="text-gray-400 text-xs">—</span>
                            <input type="time" value={emp.turnoFin} onChange={(e) => updateEmpleado(emp.id, "turnoFin", e.target.value)}
                              className="px-1 py-0.5 border rounded text-xs w-20 focus:outline-none focus:border-brand-500" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Stagger>
        </>
      )}
    </PageTransition>
  );
}
