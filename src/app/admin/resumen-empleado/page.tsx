"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineMail, HiOutlineDocumentDownload, HiOutlineCog, HiChevronDown } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, CollapsiblePanel } from "@/components/AnimateIn";

interface Descuento {
  fecha: string;
  concepto: string;
  detalle: string;
  monto: number;
  origen: string;
  cargadoPor?: string;
}

interface EmpleadoResumen {
  cod: string;
  nombre: string;
  descuentos: Descuento[];
  total: number;
}

export default function ResumenEmpleadoPage() {
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<{ empleados: EmpleadoResumen[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/resumen-empleado?mes=${mes}`);
      const d = await res.json();
      setData(d);
    } catch {} finally { setLoading(false); }
  }

  async function loadEmail() {
    try {
      const res = await fetch("/api/admin/settings?key=contador_email");
      const d = await res.json();
      setEmailTo(d.value || "");
    } catch {}
  }

  useEffect(() => { load(); }, [mes]); // eslint-disable-line
  useEffect(() => { loadEmail(); }, []);

  async function saveEmail() {
    setSavingEmail(true);
    try {
      await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "contador_email", value: emailTo }),
      });
      setResult("Email del contador guardado");
      setTimeout(() => setResult(null), 3000);
    } catch {}
    setSavingEmail(false);
  }

  async function doEnviar(testMode = false) {
    if (!confirm(testMode ? "Enviar ahora como prueba?" : `Enviar los descuentos de ${mes} al contador?`)) return;
    setSending(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/resumen-empleado/enviar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, test: testMode }),
      });
      const d = await res.json();
      if (d.ok) setResult(`✅ Enviado: ${d.enviados} archivos a ${d.emailTo}`);
      else setResult(`❌ ${d.error}`);
    } catch { setResult("❌ Error al enviar"); }
    setSending(false);
  }

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-start justify-between gap-3 mb-2">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Descuentos por Empleado</h1>
            <p className="text-sm text-gray-500">Faltantes de caja + descuentos de movimientos, consolidados por empleado.</p>
          </div>
          <button onClick={() => setShowSettings(!showSettings)}
            className={`p-2 text-gray-500 hover:bg-gray-100 rounded-lg ${springBtn}`}
            title="Configuracion">
            <HiOutlineCog className="w-5 h-5" />
          </button>
        </div>
      </Stagger>

      <CollapsiblePanel open={showSettings}>
        <Stagger delay={30}>
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 mb-4">
            <label className="block text-sm font-semibold text-blue-800 mb-2">Email del contador (destinatario automatico el ultimo dia del mes)</label>
            <div className="flex gap-2">
              <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)}
                placeholder="contador@example.com"
                className="flex-1 px-3 py-2 border border-blue-300 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
              <button onClick={saveEmail} disabled={savingEmail}
                className={`px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-semibold disabled:opacity-50 ${springBtn}`}>
                {savingEmail ? "Guardando..." : "Guardar"}
              </button>
            </div>
            <p className="text-xs text-blue-700 mt-2">El envio automatico se ejecuta el ultimo dia de cada mes a las 20:00.</p>
          </div>
        </Stagger>
      </CollapsiblePanel>

      {result && (
        <div className={`rounded-xl p-3 mb-4 border-2 ${result.startsWith("✅") ? "bg-green-50 border-green-300 text-green-800" : result.startsWith("❌") ? "bg-red-50 border-red-300 text-red-800" : "bg-blue-50 border-blue-300 text-blue-800"} text-sm`}>
          {result}
        </div>
      )}

      <Stagger delay={50}>
        <div className="flex flex-wrap gap-2 mb-4 items-center">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
            className="px-3 py-2 border border-brand-400 rounded-xl text-sm" />
          <button onClick={() => doEnviar(true)} disabled={sending || !data?.empleados?.length}
            className={`flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-50 hover:bg-amber-600 ${springBtn}`}>
            <HiOutlineMail className="w-4 h-4" />
            Enviar ahora (prueba)
          </button>
        </div>
      </Stagger>

      {loading ? <LoadingCenter /> : !data?.empleados?.length ? (
        <div className="text-center py-12 text-gray-400">No hay descuentos para este mes.</div>
      ) : (
        <Stagger delay={100}>
          <div className="space-y-2">
            {data.empleados.map((emp, i) => {
              const isOpen = expanded === emp.cod;
              return (
                <div key={emp.cod} style={staggerStyle(true, i)}
                  className={`bg-white border-2 rounded-xl shadow-sm overflow-hidden ${isOpen ? "border-brand-400" : "border-gray-200"}`}>
                  <button onClick={() => setExpanded(isOpen ? null : emp.cod)}
                    className={`w-full px-4 py-3 flex items-center justify-between text-left ${hoverRow} ${isOpen ? "bg-brand-50" : ""}`}>
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{emp.nombre}</div>
                      <div className="text-xs text-gray-500">{emp.descuentos.length} descuentos</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-red-600">{formatPrice(emp.total)}</span>
                      <HiChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? "rotate-180" : ""}`} />
                    </div>
                  </button>
                  <CollapsiblePanel open={isOpen}>
                    <div className="border-t bg-gray-50 p-3 space-y-1">
                      {emp.descuentos.map((d, j) => (
                        <div key={j} className="bg-white rounded-lg p-2 flex flex-wrap items-start justify-between gap-2 text-xs">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${d.origen === "faltante" ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                                {d.origen === "faltante" ? "Faltante" : "Movimiento"}
                              </span>
                              <span className="text-gray-500">{new Date(d.fecha).toLocaleDateString("es-AR")}</span>
                              <span className="font-semibold text-gray-900">{d.concepto}</span>
                              {d.cargadoPor && <span className="text-gray-400 ml-2">por {d.cargadoPor}</span>}
                            </div>
                            <div className="text-gray-500 mt-0.5">{d.detalle}</div>
                          </div>
                          <span className="font-bold text-red-600 shrink-0">{formatPrice(d.monto)}</span>
                        </div>
                      ))}
                    </div>
                  </CollapsiblePanel>
                </div>
              );
            })}
          </div>
          <div className="mt-4 flex items-center justify-between bg-gray-900 text-white rounded-xl p-4">
            <div>
              <div className="text-xs opacity-70">Total mes ({data.empleados.length} empleados)</div>
              <div className="text-sm font-medium">{mes}</div>
            </div>
            <div className="text-2xl font-bold">
              {formatPrice(data.empleados.reduce((s, e) => s + e.total, 0))}
            </div>
          </div>
        </Stagger>
      )}

      <div className="mt-6 text-xs text-gray-500 flex items-center gap-2">
        <HiOutlineDocumentDownload className="w-4 h-4" />
        Los PDFs se generan sin membrete — solo con el nombre del empleado, el mes y el detalle de descuentos.
      </div>
    </PageTransition>
  );
}
