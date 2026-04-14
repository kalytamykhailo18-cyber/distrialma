"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { HiTrendingUp, HiTrendingDown, HiChevronDown, HiSearch, HiPencil } from "react-icons/hi";
import Link from "next/link";

const SUC_NAMES: Record<string, string> = { "1": "Minorista 435", "2": "Mayorista 387", "6": "May. Pontevedra", "7": "Distribuidora", "10": "Reventas" };
const DIAS_SEMANA = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado", "domingo"];
const DIAS_LABEL = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

const fmt = (n: number) => formatPrice(n);
const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));
const pct = (actual: number, anterior: number) => anterior > 0 ? (((actual - anterior) / anterior) * 100).toFixed(1) : "N/A";

interface DashData {
  ventasDiarias: Array<{ dia: string; total: number; cantidad: number; ticketPromedio: number }>;
  ventasDiariasMesAnterior: Array<{ dia: string; total: number; cantidad: number }>;
  topClientes: Array<{ clienteCod: string; nombre: string; total: number; cantCompras: number; ultimaCompra: string }>;
  metodosPago: Array<{ nombre: string; total: number; cantidad: number }>;
  empleados: Array<{ empleadoCod: string; nombre: string; totalVenta: number; cantTickets: number; ticketPromedio: number }>;
  comparativo: {
    mesActual: { ventas: number; ganancia: number; ticketPromedio: number; clientesUnicos: number };
    mesAnterior: { ventas: number; ganancia: number; ticketPromedio: number; clientesUnicos: number };
  };
  horariosPico: Array<Record<string, number>>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [sucursales, setSucursales] = useState(["1", "2", "6", "7", "10"]);
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [diferencias, setDiferencias] = useState<{ empleados: Array<{ nombre: string; cierres: number; totalDiferencia: number; diferencias: Array<{ id: number; fecha: string; sucursal: string; diferencia: number; ventas: number }> }> } | null>(null);
  const [difExpanded, setDifExpanded] = useState<string | null>(null);
  const [editingDif, setEditingDif] = useState<number | null>(null);
  const [editDifValue, setEditDifValue] = useState("");

  const [deadStock, setDeadStock] = useState<{ dias: number; cantProductos: number; totalInmovilizado: number; productos: Array<{ sku: string; nombre: string; marca: string; rubro: string; stock: number; costoUnit: number; costoInmovilizado: number; unidad: string }> } | null>(null);
  const [deadDias, setDeadDias] = useState(30);
  const [deadSearch, setDeadSearch] = useState("");
  const [deadPage, setDeadPage] = useState(0);
  const DEAD_PAGE_SIZE = 20;

  async function loadDeadStock(d: number) {
    try {
      const res = await fetch(`/api/admin/productos-sin-movimiento?dias=${d}`);
      const data = await res.json();
      if (!data.error) setDeadStock(data);
    } catch {}
  }

  useEffect(() => { loadDeadStock(deadDias); }, [deadDias]); // eslint-disable-line react-hooks/exhaustive-deps

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/dashboard?mes=${mes}&sucursales=${sucursales.join(",")}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch { setData(null); }
    setLoading(false);
  }

  useEffect(() => { load(); loadDiferencias(); }, [mes, sucursales]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadDiferencias() {
    try {
      const res = await fetch(`/api/admin/cierre-caja/diferencias?mes=${mes}`);
      const d = await res.json();
      if (!d.error) setDiferencias(d);
    } catch {}
  }

  function toggleSuc(s: string) {
    setSucursales((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  // Merge daily data for chart
  const dailyChart = data?.ventasDiarias.map((d) => {
    const ant = data.ventasDiariasMesAnterior.find((a) => a.dia === d.dia);
    return { dia: d.dia, actual: d.total, anterior: ant?.total || 0, tickets: d.cantidad };
  }) || [];

  const comp = data?.comparativo;
  const ventasCambio = comp ? pct(comp.mesActual.ventas, comp.mesAnterior.ventas) : "0";
  const gananciaCambio = comp ? pct(comp.mesActual.ganancia, comp.mesAnterior.ganancia) : "0";
  const ticketCambio = comp ? pct(comp.mesActual.ticketPromedio, comp.mesAnterior.ticketPromedio) : "0";
  const clientesCambio = comp ? pct(comp.mesActual.clientesUnicos, comp.mesAnterior.clientesUnicos) : "0";

  // Heatmap max for color scale
  const heatMax = data?.horariosPico.reduce((mx, row) => {
    DIAS_SEMANA.forEach((d) => { if ((row[d] || 0) > mx) mx = row[d] || 0; });
    return mx;
  }, 0) || 1;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
      <p className="text-sm text-gray-500 mb-4">Panel de control con indicadores clave del negocio.</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="px-3 py-2 border border-brand-400 rounded-lg text-sm" />
        <div className="flex flex-wrap gap-1">
          {["1", "2", "6", "7", "10"].map((s) => (
            <button key={s} onClick={() => toggleSuc(s)}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium transition-colors ${sucursales.includes(s) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {SUC_NAMES[s]}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-gray-400">Cargando...</p> : !data ? <p className="text-gray-400">Sin datos</p> : (
        <>
          {/* Comparativo cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            {[
              { label: "Ventas", actual: comp?.mesActual.ventas || 0, cambio: ventasCambio, format: fmtK },
              { label: "Ganancia", actual: comp?.mesActual.ganancia || 0, cambio: gananciaCambio, format: fmtK },
              { label: "Ticket Promedio", actual: comp?.mesActual.ticketPromedio || 0, cambio: ticketCambio, format: fmt },
              { label: "Clientes", actual: comp?.mesActual.clientesUnicos || 0, cambio: clientesCambio, format: (n: number) => String(n) },
            ].map((card) => {
              const isUp = parseFloat(card.cambio) > 0;
              const isDown = parseFloat(card.cambio) < 0;
              return (
                <div key={card.label} className="bg-white border rounded-xl p-4">
                  <div className="text-xs text-gray-500 mb-1">{card.label}</div>
                  <div className="text-2xl font-bold text-gray-900">{card.format(card.actual)}</div>
                  <div className={`flex items-center gap-1 text-xs mt-1 ${isUp ? "text-green-600" : isDown ? "text-red-500" : "text-gray-400"}`}>
                    {isUp && <HiTrendingUp className="w-3.5 h-3.5" />}
                    {isDown && <HiTrendingDown className="w-3.5 h-3.5" />}
                    {card.cambio !== "N/A" ? `${isUp ? "+" : ""}${card.cambio}% vs mes ant.` : "Sin datos anteriores"}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Daily sales chart */}
          <div className="bg-white border rounded-xl p-4 mb-6 overflow-hidden">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Ventas Diarias</h3>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={dailyChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                <Legend />
                <Line type="monotone" dataKey="actual" name="Este mes" stroke="#f97316" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="anterior" name="Mes anterior" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="5 5" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Payment methods */}
            <div className="bg-white border rounded-xl p-4 overflow-hidden">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Metodos de Pago</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.metodosPago.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                  <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Employee performance */}
            <div className="bg-white border rounded-xl p-4 overflow-hidden">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Rendimiento por Empleado</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={data.empleados.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                  <Bar dataKey="totalVenta" name="Ventas" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-2 space-y-1">
                {data.empleados.slice(0, 10).map((e) => (
                  <div key={e.empleadoCod} className="flex justify-between text-xs text-gray-500">
                    <span>{e.nombre}</span>
                    <span>{e.cantTickets} tickets — prom: {fmt(e.ticketPromedio)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Heatmap */}
          <div className="bg-white border rounded-xl p-4 mb-6">
            <h3 className="text-sm font-bold text-gray-700 mb-3">Horarios Pico</h3>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr>
                    <th className="p-1 text-gray-500 text-left">Hora</th>
                    {DIAS_LABEL.map((d) => <th key={d} className="p-1 text-center text-gray-500">{d}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {data.horariosPico.map((row) => (
                    <tr key={row.hora}>
                      <td className="p-1 font-mono text-gray-600">{String(row.hora).padStart(2, "0")}:00</td>
                      {DIAS_SEMANA.map((d) => {
                        const val = row[d] || 0;
                        const intensity = heatMax > 0 ? val / heatMax : 0;
                        const bg = val === 0 ? "#f9fafb" : `rgba(249, 115, 22, ${0.15 + intensity * 0.7})`;
                        return (
                          <td key={d} className="p-1 text-center font-mono rounded" style={{ backgroundColor: bg, color: intensity > 0.5 ? "white" : "#374151" }}>
                            {val > 0 ? val : ""}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Top clients */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
              <h3 className="text-sm font-bold text-gray-700">Top 20 Clientes</h3>
              <div className="relative flex-1 min-w-[200px]">
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" value={clientSearch} onChange={(e) => setClientSearch(e.target.value)} placeholder="Buscar cliente..."
                  className="w-full pl-9 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
            </div>
            <div className="divide-y max-h-[500px] overflow-y-auto">
              {(clientSearch
                ? data.topClientes.filter((c) => (c.nombre || "").toLowerCase().includes(clientSearch.toLowerCase()) || c.clienteCod.includes(clientSearch))
                : data.topClientes
              ).map((c) => {
                const isOpen = expandedCliente === c.clienteCod;
                return (
                  <div key={c.clienteCod} className={isOpen ? "bg-brand-50 border-l-4 border-l-brand-500" : ""}>
                    <button onClick={() => setExpandedCliente(isOpen ? null : c.clienteCod)}
                      className={`w-full px-4 py-2.5 flex items-center justify-between text-left ${isOpen ? "" : "hover:bg-gray-50"}`}>
                      <div className="flex-1 min-w-0">
                        <Link href={`/admin/dashboard/cliente?cod=${c.clienteCod}`} target="_blank" onClick={(e) => e.stopPropagation()} className={`text-sm font-medium truncate hover:underline ${isOpen ? "text-brand-700" : "text-gray-900"}`}>{c.nombre || "Sin nombre"}</Link>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <div className="text-sm font-bold text-gray-900">{fmt(c.total)}</div>
                          <div className="text-xs text-gray-400">{c.cantCompras} compras</div>
                        </div>
                        <HiChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                      </div>
                    </button>
                    {isOpen && (
                      <div className="px-4 py-2 bg-brand-50/50 border-t border-brand-200 text-xs text-gray-600">
                        <span>Cod: {c.clienteCod}</span> — <span>Ultima compra: {c.ultimaCompra ? `${c.ultimaCompra.slice(6, 8)}/${c.ultimaCompra.slice(4, 6)}/${c.ultimaCompra.slice(0, 4)}` : "—"}</span> — <span>Promedio: {fmt(c.cantCompras > 0 ? c.total / c.cantCompras : 0)}</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Diferencias de caja */}
          {diferencias && diferencias.empleados.length > 0 && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-bold text-gray-700">Diferencias de Caja por Empleado</h3>
              </div>
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {diferencias.empleados.map((emp) => {
                  const isOpen = difExpanded === emp.nombre;
                  const isNeg = emp.totalDiferencia < 0;
                  return (
                    <div key={emp.nombre} className={isOpen ? "bg-brand-50 border-l-4 border-l-brand-500" : ""}>
                      <button onClick={() => setDifExpanded(isOpen ? null : emp.nombre)}
                        className={`w-full px-4 py-2.5 flex items-center justify-between text-left ${isOpen ? "" : "hover:bg-gray-50"}`}>
                        <div>
                          <span className={`text-sm font-medium ${isOpen ? "text-brand-700" : "text-gray-900"}`}>{emp.nombre}</span>
                          <span className="text-xs text-gray-400 ml-2">{emp.cierres} cierres</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${isNeg ? "text-red-600" : "text-green-600"}`}>
                            {isNeg ? "-" : "+"}{fmt(Math.abs(emp.totalDiferencia))}
                          </span>
                          <HiChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                        </div>
                      </button>
                      {isOpen && (
                        <div className="px-4 py-2 bg-brand-50/50 border-t border-brand-200 space-y-1">
                          {emp.diferencias.map((d) => (
                            <div key={d.id} className="flex items-center justify-between text-xs gap-2">
                              <span className="text-gray-500">Suc {d.sucursal} — {new Date(d.fecha).toLocaleDateString("es-AR")} — {d.ventas} ventas</span>
                              <div className="flex items-center gap-1">
                                {editingDif === d.id ? (
                                  <>
                                    <input type="number" value={editDifValue} onChange={(e) => setEditDifValue(e.target.value)}
                                      className="w-24 px-2 py-1 border rounded text-xs text-right" autoFocus />
                                    <button onClick={async () => {
                                      await fetch("/api/admin/cierre-caja/diferencias", {
                                        method: "PATCH",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({ id: d.id, diferencia: editDifValue }),
                                      });
                                      setEditingDif(null);
                                      loadDiferencias();
                                    }} className="px-1.5 py-0.5 bg-green-500 text-white rounded text-xs">OK</button>
                                    <button onClick={() => setEditingDif(null)} className="px-1.5 py-0.5 bg-gray-300 rounded text-xs">X</button>
                                  </>
                                ) : (
                                  <>
                                    <span className={d.diferencia < 0 ? "text-red-600 font-medium" : "text-green-600"}>{d.diferencia < 0 ? "-" : "+"}{fmt(Math.abs(d.diferencia))}</span>
                                    <button onClick={() => { setEditingDif(d.id); setEditDifValue(String(d.diferencia)); }}
                                      className="ml-1 !text-gray-400 hover:!text-gray-600" title="Corregir"><HiPencil className="w-3 h-3" /></button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Dead stock */}
          {deadStock && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-bold text-gray-700">Productos sin Movimiento</h3>
                <div className="flex gap-1">
                  {[30, 60, 90].map((d) => (
                    <button key={d} onClick={() => { setDeadDias(d); setDeadPage(0); setDeadSearch(""); }}
                      className={`px-2 py-1 rounded text-xs font-medium ${deadDias === d ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                      {d} dias
                    </button>
                  ))}
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-gray-500">{deadStock.cantProductos} prod. — <span className="text-red-600 font-bold">{fmtK(deadStock.totalInmovilizado)}</span></span>
                  <button onClick={async () => {
                    const { default: jsPDF } = await import("jspdf");
                    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                    const w = doc.internal.pageSize.getWidth();
                    const pageH = doc.internal.pageSize.getHeight();
                    let y = 15;
                    let pageNum = 1;

                    // Load logo
                    let logoImg: string | null = null;
                    try {
                      const resp = await fetch("/logo.png");
                      const blob = await resp.blob();
                      logoImg = await new Promise<string>((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result as string);
                        reader.readAsDataURL(blob);
                      });
                    } catch {}

                    const drawHeader = () => {
                      doc.setFillColor(251, 154, 71);
                      doc.rect(0, 0, w, 22, "F");
                      if (logoImg) {
                        try { doc.addImage(logoImg, "PNG", 10, 3, 16, 16); } catch {}
                      }
                      doc.setTextColor(255, 255, 255);
                      doc.setFontSize(13);
                      doc.setFont("helvetica", "bold");
                      doc.text(`Productos sin Movimiento — ${deadDias} dias`, logoImg ? 30 : 14, 10);
                      doc.setFontSize(8);
                      doc.setFont("helvetica", "normal");
                      doc.text(`${new Date().toLocaleDateString("es-AR")} — ${deadStock.cantProductos} productos — Inmovilizado: ${fmt(deadStock.totalInmovilizado)}`, logoImg ? 30 : 14, 16);
                      doc.text(`Pag. ${pageNum}`, w - 14, 16, { align: "right" });
                    };

                    const drawTableHeader = () => {
                      doc.setFillColor(240, 240, 240);
                      doc.rect(10, y, w - 20, 8, "F");
                      doc.setFontSize(7);
                      doc.setFont("helvetica", "bold");
                      doc.setTextColor(100, 100, 100);
                      const ty = y + 5.5;
                      doc.text("SKU", 14, ty);
                      doc.text("Producto", 30, ty);
                      doc.text("Marca", 108, ty);
                      doc.text("Stock", 143, ty, { align: "right" });
                      doc.text("Costo Unit.", 168, ty, { align: "right" });
                      doc.text("Inmovilizado", w - 14, ty, { align: "right" });
                      y += 12;
                    };

                    const checkPage = (n = 10) => {
                      if (y + n > pageH - 15) {
                        doc.addPage();
                        pageNum++;
                        y = 15;
                        drawHeader();
                        y = 28;
                        drawTableHeader();
                      }
                    };

                    drawHeader();
                    y = 28;
                    drawTableHeader();

                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(7);
                    doc.setTextColor(50, 50, 50);
                    for (const p of deadStock.productos) {
                      checkPage(5);
                      doc.text(p.sku, 14, y);
                      doc.text(p.nombre.substring(0, 42), 30, y);
                      doc.text(p.marca.substring(0, 12), 108, y);
                      doc.text(`${p.stock} ${p.unidad === "KG" ? "kg" : "u"}`, 143, y, { align: "right" });
                      doc.text(fmt(p.costoUnit), 168, y, { align: "right" });
                      doc.text(fmt(p.costoInmovilizado), w - 14, y, { align: "right" });
                      doc.setDrawColor(230, 230, 230);
                      doc.line(10, y + 1.5, w - 10, y + 1.5);
                      y += 4.5;
                    }

                    // Footer
                    doc.setFontSize(7);
                    doc.setTextColor(150, 150, 150);
                    doc.text("distrialma.com.ar", w / 2, pageH - 8, { align: "center" });

                    doc.save(`sin-movimiento-${deadDias}dias-${new Date().toISOString().slice(0, 10)}.pdf`);
                  }} className="px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600">
                    PDF
                  </button>
                </div>
              </div>
              {(() => {
                if (!deadStock) return null;
                const filtered = deadSearch
                  ? deadStock.productos.filter((p) => p.nombre.toLowerCase().includes(deadSearch.toLowerCase()) || p.marca.toLowerCase().includes(deadSearch.toLowerCase()) || p.sku.includes(deadSearch))
                  : deadStock.productos;
                const totalPages = Math.ceil(filtered.length / DEAD_PAGE_SIZE);
                const paged = filtered.slice(deadPage * DEAD_PAGE_SIZE, (deadPage + 1) * DEAD_PAGE_SIZE);
                return (
                <>
                <div className="px-4 py-2 border-b flex flex-wrap items-center gap-2">
                  <div className="relative flex-1 min-w-[150px]">
                    <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                    <input type="text" value={deadSearch} onChange={(e) => { setDeadSearch(e.target.value); setDeadPage(0); }}
                      placeholder="Filtrar producto..."
                      className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:border-brand-500" />
                  </div>
                  <span className="text-xs text-gray-400">{filtered.length} productos</span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDeadPage((p) => Math.max(0, p - 1))} disabled={deadPage === 0}
                        className="px-2 py-1 rounded text-xs border disabled:opacity-30">←</button>
                      <span className="text-xs text-gray-500">{deadPage + 1}/{totalPages}</span>
                      <button onClick={() => setDeadPage((p) => Math.min(totalPages - 1, p + 1))} disabled={deadPage >= totalPages - 1}
                        className="px-2 py-1 rounded text-xs border disabled:opacity-30">→</button>
                    </div>
                  )}
                </div>
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {paged.map((p) => (
                    <Link key={p.sku} href={`/admin/dashboard/producto?sku=${p.sku}`} target="_blank" className="px-4 py-2 flex items-center justify-between hover:bg-red-50/50 block">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 font-mono">{p.sku}</span>
                          <span className="text-sm text-gray-900 truncate hover:underline">{p.nombre}</span>
                        </div>
                        <div className="text-xs text-gray-400">{p.marca} — {p.rubro}</div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0 text-right">
                        <div>
                          <div className="text-sm text-gray-700">{p.stock} {p.unidad === "KG" ? "kg" : "u"}</div>
                          <div className="text-xs text-gray-400">stock</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-red-600">{fmt(p.costoInmovilizado)}</div>
                          <div className="text-xs text-gray-400">inmovilizado</div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
                </>
                );
              })()}
            </div>
          )}
          </div>
        </>
      )}
    </div>
  );
}
