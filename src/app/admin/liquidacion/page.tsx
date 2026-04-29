"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineTrash, HiOutlinePlus, HiOutlineDocumentDownload } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";
import ConfirmModal from "@/components/ConfirmModal";

interface Empleado {
  id: number;
  nombre: string;
  area: string;
  empleadoCod: string;
  basico: number;
  presentismo: number;
  adicionalCaja: number;
  bono: number;
  viatico: number;
  plus: number;
}

interface Ajuste { id: number; concepto: string; monto: number }

interface LiquidacionData {
  empleado: { cod: string; nombre: string; area: string };
  mes: string;
  haberes: { basico: number; presentismo: number; adicionalCaja: number; bono: number; viatico: number; plus: number; extraHoras: string; extraAmount: number; feriadoAmount: number; hourlyRate: number; dailyRate: number };
  horas: { totalHoras: string; diasTrabajados: number; extraMinutos: number; tardeMinutos: number; tardeHoras: string };
  descuentos: { mercaderia: number; faltantes: number; suspensiones: number; diasSuspension: number; total: number };
  feriados: Array<{ fecha: string; nombre: string }>;
  suspensiones: Array<{ fecha: string; tipo: string; motivo: string | null }>;
  ajustes: Ajuste[];
  resumen: { totalHaberes: number; totalAjustes: number; totalDescuentos: number; totalACobrar: number };
}

export default function LiquidacionPage() {
  const [tab, setTab] = useState<"liquidacion" | "config">("liquidacion");
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [loading, setLoading] = useState(true);

  // Liquidacion view
  const [selectedEmp, setSelectedEmp] = useState("");
  const [mes, setMes] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [liqData, setLiqData] = useState<LiquidacionData | null>(null);
  const [loadingLiq, setLoadingLiq] = useState(false);

  // Ajuste form
  const [ajusteConcepto, setAjusteConcepto] = useState("");
  const [ajusteMonto, setAjusteMonto] = useState("");
  const [addingAjuste, setAddingAjuste] = useState(false);
  const [deletingAjuste, setDeletingAjuste] = useState<number | null>(null);

  // Config
  const [saving, setSaving] = useState(false);
  const [configSaved, setConfigSaved] = useState("");

  async function loadEmpleados() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/liquidacion");
      const data = await res.json();
      setEmpleados(data.empleados || []);
      if (!selectedEmp && data.empleados?.length > 0) setSelectedEmp(data.empleados[0].empleadoCod);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadEmpleados(); }, []);

  useEffect(() => {
    if (selectedEmp && mes && tab === "liquidacion") loadLiquidacion();
  }, [selectedEmp, mes, tab]); // eslint-disable-line

  async function loadLiquidacion() {
    setLoadingLiq(true);
    try {
      const res = await fetch(`/api/admin/liquidacion?empleado=${selectedEmp}&mes=${mes}`);
      const data = await res.json();
      setLiqData(data.error ? null : data);
    } catch {}
    setLoadingLiq(false);
  }

  async function saveSueldo(emp: Empleado) {
    setSaving(true);
    try {
      await fetch("/api/admin/liquidacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sueldo", ...emp }),
      });
      setConfigSaved(emp.empleadoCod);
      setTimeout(() => setConfigSaved(""), 2000);
    } catch {}
    setSaving(false);
  }

  async function addAjuste() {
    if (!ajusteConcepto.trim() || !ajusteMonto) return;
    setAddingAjuste(true);
    try {
      await fetch("/api/admin/liquidacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ajuste", empleadoCod: selectedEmp, mes, concepto: ajusteConcepto, monto: ajusteMonto }),
      });
      setAjusteConcepto(""); setAjusteMonto("");
      loadLiquidacion();
    } catch {}
    setAddingAjuste(false);
  }

  async function deleteAjuste() {
    if (!deletingAjuste) return;
    await fetch("/api/admin/liquidacion", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: deletingAjuste }) });
    setDeletingAjuste(null);
    loadLiquidacion();
  }

  async function generatePDF() {
    if (!liqData) return;
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const fmt = (n: number) => "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
    let y = 15;

    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Liquidacion", 14, y);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${liqData.empleado.nombre} — ${liqData.mes}`, w - 14, y, { align: "right" });
    y += 10;

    // Haberes
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("Haberes", 14, y); y += 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    const habItems: [string, number][] = [
      ["Basico", liqData.haberes.basico], ["Presentismo", liqData.haberes.presentismo],
      ["Adicional caja", liqData.haberes.adicionalCaja], ["Bono", liqData.haberes.bono],
      ["Viatico", liqData.haberes.viatico], ["Plus", liqData.haberes.plus],
    ];
    if (liqData.haberes.extraAmount > 0) habItems.push(["Horas extra (" + liqData.haberes.extraHoras + ")", liqData.haberes.extraAmount]);
    if (liqData.haberes.feriadoAmount > 0) habItems.push(["Feriado trabajado", liqData.haberes.feriadoAmount]);
    for (const [label, val] of habItems) {
      if (val > 0) { doc.text(label as string, 18, y); doc.text(fmt(val as number), w - 18, y, { align: "right" }); y += 5; }
    }
    doc.setFont("helvetica", "bold");
    doc.text("Total haberes", 18, y); doc.text(fmt(liqData.resumen.totalHaberes), w - 18, y, { align: "right" }); y += 8;

    // Descuentos (in PDF)
    if (liqData.resumen.totalDescuentos > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("Descuentos", 14, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      if (liqData.descuentos.mercaderia > 0) { doc.text("Mercaderia", 18, y); doc.text("-" + fmt(liqData.descuentos.mercaderia), w - 18, y, { align: "right" }); y += 5; }
      if (liqData.descuentos.suspensiones > 0) { doc.text("Suspension (" + liqData.descuentos.diasSuspension + " dias)", 18, y); doc.text("-" + fmt(liqData.descuentos.suspensiones), w - 18, y, { align: "right" }); y += 5; }
      y += 3;
    }

    // Ajustes
    if (liqData.ajustes.length > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("Ajustes", 14, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      for (const a of liqData.ajustes) {
        doc.text(a.concepto, 18, y); doc.text((a.monto >= 0 ? "+" : "") + fmt(a.monto), w - 18, y, { align: "right" }); y += 5;
      }
      y += 3;
    }

    // Descuentos
    if (liqData.resumen.totalDescuentos > 0) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(10);
      doc.text("Descuentos", 14, y); y += 6;
      doc.setFont("helvetica", "normal"); doc.setFontSize(9);
      if (liqData.descuentos.mercaderia > 0) { doc.text("Mercaderia", 18, y); doc.text("-" + fmt(liqData.descuentos.mercaderia), w - 18, y, { align: "right" }); y += 5; }
      if (liqData.descuentos.faltantes > 0) { doc.text("Faltantes caja", 18, y); doc.text("-" + fmt(liqData.descuentos.faltantes), w - 18, y, { align: "right" }); y += 5; }
      y += 3;
    }

    // Total
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(14, y - 2, w - 28, 10, 2, 2, "F");
    doc.setFontSize(12); doc.setFont("helvetica", "bold");
    doc.text("TOTAL A COBRAR", 18, y + 5);
    doc.text(fmt(liqData.resumen.totalACobrar), w - 18, y + 5, { align: "right" });
    y += 15;

    // Hours summary
    doc.setFontSize(8); doc.setFont("helvetica", "normal"); doc.setTextColor(128);
    doc.text(`${liqData.horas.diasTrabajados} dias trabajados — ${liqData.horas.totalHoras} horas — Valor hora: ${fmt(liqData.haberes.hourlyRate)}`, 14, y);

    doc.save(`Liquidacion-${liqData.empleado.nombre.replace(/\s+/g, "_")}-${liqData.mes}.pdf`);
  }

  function updateEmpField(cod: string, field: string, value: string) {
    setEmpleados((prev) => prev.map((e) => e.empleadoCod === cod ? { ...e, [field]: parseFloat(value) || 0 } : e));
  }

  if (loading) return <LoadingCenter text="Cargando..." />;

  return (
    <PageTransition className="max-w-6xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Liquidacion de Sueldos</h1>
          <div className="flex gap-2">
            <button onClick={() => setTab("liquidacion")} className={`px-3 py-1.5 text-sm rounded-lg ${springBtn} ${tab === "liquidacion" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}>
              Liquidacion
            </button>
            <button onClick={() => setTab("config")} className={`px-3 py-1.5 text-sm rounded-lg ${springBtn} ${tab === "config" ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600"}`}>
              Sueldos
            </button>
          </div>
        </div>
      </Stagger>

      {/* ===== LIQUIDACION TAB ===== */}
      {tab === "liquidacion" && (
        <>
          <Stagger delay={50}>
            <div className="flex flex-wrap gap-2 mb-4">
              <input type="month" value={mes} onChange={(e) => setMes(e.target.value)}
                className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              <select value={selectedEmp} onChange={(e) => setSelectedEmp(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500 bg-white">
                {empleados.map((e) => <option key={e.empleadoCod} value={e.empleadoCod}>{e.nombre} ({e.area})</option>)}
              </select>
              {liqData && (
                <button onClick={generatePDF} className={`px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-sm font-medium flex items-center gap-1 ${springBtn}`}>
                  <HiOutlineDocumentDownload className="w-4 h-4" /> PDF
                </button>
              )}
            </div>
          </Stagger>

          {loadingLiq ? <LoadingCenter text="Calculando..." /> : liqData ? (
            <Stagger delay={100}>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-green-500">Haberes</div>
                  <div className="text-lg font-bold text-green-700">{formatPrice(liqData.resumen.totalHaberes)}</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-blue-500">Ajustes</div>
                  <div className="text-lg font-bold text-blue-700">{formatPrice(liqData.resumen.totalAjustes)}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-red-500">Descuentos</div>
                  <div className="text-lg font-bold text-red-700">{formatPrice(liqData.resumen.totalDescuentos)}</div>
                </div>
                <div className="bg-gray-100 border border-gray-300 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">Total a cobrar</div>
                  <div className="text-lg font-bold text-gray-900">{formatPrice(liqData.resumen.totalACobrar)}</div>
                </div>
              </div>

              {/* Detail */}
              <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Haberes</h3>
                <div className="space-y-1 text-sm">
                  {[
                    ["Basico", liqData.haberes.basico],
                    ["Presentismo", liqData.haberes.presentismo],
                    ["Adicional caja", liqData.haberes.adicionalCaja],
                    ["Bono", liqData.haberes.bono],
                    ["Viatico", liqData.haberes.viatico],
                    ["Plus", liqData.haberes.plus],
                  ].filter(([, v]) => (v as number) > 0).map(([label, value]) => (
                    <div key={label as string} className={`flex justify-between ${hoverRow} px-2 py-1 rounded`}>
                      <span className="text-gray-600">{label}</span>
                      <span className="font-medium">{formatPrice(value as number)}</span>
                    </div>
                  ))}
                  {liqData.haberes.extraAmount > 0 && (
                    <div className={`flex justify-between ${hoverRow} px-2 py-1 rounded`}>
                      <span className="text-purple-600">Horas extra ({liqData.haberes.extraHoras})</span>
                      <span className="font-medium text-purple-600">{formatPrice(liqData.haberes.extraAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-2 py-1 border-t font-bold mt-2 pt-2">
                    <span>Total haberes</span>
                    <span>{formatPrice(liqData.resumen.totalHaberes)}</span>
                  </div>
                </div>

                {liqData.haberes.feriadoAmount > 0 && (
                    <div className={`flex justify-between ${hoverRow} px-2 py-1 rounded`}>
                      <span className="text-green-600">Feriado trabajado</span>
                      <span className="font-medium text-green-600">{formatPrice(liqData.haberes.feriadoAmount)}</span>
                    </div>
                  )}

                {/* Hours summary */}
                <div className="mt-3 text-xs text-gray-400 space-y-0.5">
                  <div>{liqData.horas.diasTrabajados} dias trabajados — {liqData.horas.totalHoras} horas</div>
                  <div>Valor dia: {formatPrice(liqData.haberes.dailyRate)} — Valor hora: {formatPrice(liqData.haberes.hourlyRate)}</div>
                  {liqData.horas.tardeMinutos > 0 && <div className="text-red-400">Tardanzas: {liqData.horas.tardeHoras} ({Math.round(liqData.horas.tardeMinutos)} min)</div>}
                </div>
              </div>

              {/* Descuentos */}
              {liqData.resumen.totalDescuentos > 0 && (
                <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Descuentos</h3>
                  <div className="space-y-1 text-sm">
                    {liqData.descuentos.mercaderia > 0 && (
                      <div className="flex justify-between px-2 py-1"><span className="text-gray-600">Mercaderia</span><span className="text-red-500">-{formatPrice(liqData.descuentos.mercaderia)}</span></div>
                    )}
                    {liqData.descuentos.faltantes > 0 && (
                      <div className="flex justify-between px-2 py-1"><span className="text-gray-600">Faltantes caja</span><span className="text-red-500">-{formatPrice(liqData.descuentos.faltantes)}</span></div>
                    )}
                    {liqData.descuentos.suspensiones > 0 && (
                      <div className="flex justify-between px-2 py-1"><span className="text-gray-600">Suspension ({liqData.descuentos.diasSuspension} dias)</span><span className="text-red-500">-{formatPrice(liqData.descuentos.suspensiones)}</span></div>
                    )}
                  </div>
                </div>
              )}

              {/* Ajustes */}
              <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Ajustes del mes</h3>
                {liqData.ajustes.length > 0 && (
                  <div className="space-y-1 text-sm mb-3">
                    {liqData.ajustes.map((a) => (
                      <div key={a.id} className={`flex items-center justify-between px-2 py-1 rounded ${hoverRow}`}>
                        <span className="text-gray-600">{a.concepto}</span>
                        <div className="flex items-center gap-2">
                          <span className={a.monto >= 0 ? "text-green-600" : "text-red-500"}>{a.monto >= 0 ? "+" : ""}{formatPrice(a.monto)}</span>
                          <button onClick={() => setDeletingAjuste(a.id)} className="text-red-400 hover:text-red-600"><HiOutlineTrash className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={ajusteConcepto} onChange={(e) => setAjusteConcepto(e.target.value)}
                    placeholder="Concepto (ej: Transferencia, Bono)" className="flex-1 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                  <input type="number" value={ajusteMonto} onChange={(e) => setAjusteMonto(e.target.value)}
                    placeholder="Monto" className="w-28 px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                  <button onClick={addAjuste} disabled={addingAjuste || !ajusteConcepto.trim()}
                    className={`px-3 py-2 bg-brand-400 text-white rounded-lg text-sm disabled:opacity-50 ${springBtn}`}>
                    <HiOutlinePlus className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">Positivo = a favor del empleado. Negativo = descuento.</p>
              </div>
            </Stagger>
          ) : null}
        </>
      )}

      {/* ===== CONFIG TAB ===== */}
      {tab === "config" && (
        <Stagger delay={50}>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left text-xs text-gray-500">
                    <th className="px-3 py-2">Empleado</th>
                    <th className="px-3 py-2 text-right">Basico</th>
                    <th className="px-3 py-2 text-right">Presentismo</th>
                    <th className="px-3 py-2 text-right">Ad. Caja</th>
                    <th className="px-3 py-2 text-right">Bono</th>
                    <th className="px-3 py-2 text-right">Viatico</th>
                    <th className="px-3 py-2 text-right">Plus</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {empleados.map((emp, i) => (
                    <tr key={emp.empleadoCod} className={hoverRow} style={staggerStyle(true, i, 0, 10)}>
                      <td className="px-3 py-2 font-medium text-gray-900 text-xs">{emp.nombre}</td>
                      {(["basico", "presentismo", "adicionalCaja", "bono", "viatico", "plus"] as const).map((field) => (
                        <td key={field} className="px-1 py-1">
                          <input type="number" value={emp[field] || ""} onChange={(e) => updateEmpField(emp.empleadoCod, field, e.target.value)}
                            placeholder="0" className="w-full px-2 py-1 border rounded text-xs text-right focus:outline-none focus:border-brand-500" />
                        </td>
                      ))}
                      <td className="px-2 py-1">
                        <button onClick={() => saveSueldo(emp)} disabled={saving}
                          className={`px-2 py-1 text-xs rounded ${springBtn} ${configSaved === emp.empleadoCod ? "bg-green-100 text-green-600" : "bg-brand-50 text-brand-600 border border-brand-200"}`}>
                          {configSaved === emp.empleadoCod ? "OK" : "Guardar"}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Stagger>
      )}

      <ConfirmModal open={!!deletingAjuste} message="Eliminar este ajuste?" onConfirm={deleteAjuste} onCancel={() => setDeletingAjuste(null)} />
    </PageTransition>
  );
}
