"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { HiChevronDown, HiSearch } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, useDataReady, CollapsiblePanel } from "@/components/AnimateIn";

const SUC_NAMES: Record<string, string> = { "1": "Minorista 435", "2": "Mayorista 387", "6": "May. Pontevedra", "7": "Distribuidora", "10": "Reventas", "11": "PedidosYa" };
interface ListaData { lista: number; listaName: string; cantidad: number; totalVenta: number; ganancia: number }
interface Product { sku: string; nombre: string; marca: string; rubro: string; unidad?: string; pesoPorPieza?: number; unidadesAprox?: number | null; totalVenta: number; totalCosto: number; ganancia: number; cantidad: number; margen: string; listas: ListaData[] }
interface SucTotal { sucursal: string; cantVentas: number; totalVenta: number; totalCosto: number; ganancia: number; margen: string }
interface ChartData { rubro?: string; marca?: string; totalVenta: number; ganancia: number }
interface ResumenData { mes: string; totales: SucTotal[]; rubros: ChartData[]; marcas: ChartData[]; productos: Product[] }

const fmt = (n: number) => formatPrice(n);
const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));

export default function ResumenProductosPage() {
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const [sucursales, setSucursales] = useState(["1", "2", "6", "7", "10", "11"]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"totalVenta" | "ganancia" | "cantidad" | "margen">("ganancia");
  const [limit, setLimit] = useState(50);
  const ready = useDataReady(data);

  // Comparison
  const [comparar, setComparar] = useState(false);
  const [mesComp, setMesComp] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  });
  const [dataComp, setDataComp] = useState<ResumenData | null>(null);
  const [loadingComp, setLoadingComp] = useState(false);
  const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

  function toggleSelect(sku: string) {
    setSelectedSkus((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
  }

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams({ mes, sucursales: sucursales.join(",") });
      if (rangoDesde && rangoHasta) { params.set("desde", rangoDesde); params.set("hasta", rangoHasta); }
      const res = await fetch(`/api/admin/resumen-productos?${params}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch { setData(null); }
    setLoading(false);
  }

  async function loadComp() {
    if (!comparar) { setDataComp(null); return; }
    setLoadingComp(true);
    try {
      const res = await fetch(`/api/admin/resumen-productos?mes=${mesComp}&sucursales=${sucursales.join(",")}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setDataComp(d);
    } catch { setDataComp(null); }
    setLoadingComp(false);
  }

  useEffect(() => { load(); }, [mes, sucursales, rangoDesde, rangoHasta]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { loadComp(); }, [mesComp, sucursales, comparar]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSuc(s: string) {
    setSucursales((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  }

  const filtered = data?.productos
    .filter((p) => !search || p.nombre.toLowerCase().includes(search.toLowerCase()) || p.marca.toLowerCase().includes(search.toLowerCase()) || p.sku.includes(search))
    .sort((a, b) => sortBy === "margen" ? parseFloat(b.margen) - parseFloat(a.margen) : (b[sortBy] as number) - (a[sortBy] as number))
    .slice(0, limit) || [];

  const globalTotal = data?.totales.reduce((s, t) => s + t.totalVenta, 0) || 0;
  const globalGanancia = data?.totales.reduce((s, t) => s + t.ganancia, 0) || 0;
  const globalVentas = data?.totales.reduce((s, t) => s + t.cantVentas, 0) || 0;
  const globalMargen = globalTotal > 0 ? ((globalGanancia / globalTotal) * 100).toFixed(1) : "0";

  // Comparison lookups
  const compMap = new Map<string, Product>();
  if (dataComp) { for (const p of dataComp.productos) compMap.set(p.sku, p); }
  const compTotal = dataComp?.totales.reduce((s, t) => s + t.totalVenta, 0) || 0;
  const compGanancia = dataComp?.totales.reduce((s, t) => s + t.ganancia, 0) || 0;
  const compVentas = dataComp?.totales.reduce((s, t) => s + t.cantVentas, 0) || 0;

  function diffBadge(current: number, prev: number, isQty = false) {
    if (!comparar || !dataComp || prev === 0) return null;
    const diff = current - prev;
    const pct = ((diff / prev) * 100).toFixed(0);
    const isUp = diff > 0;
    return (
      <span className={`text-xs font-medium ${isUp ? "text-green-600" : "text-red-600"}`}>
        {isUp ? "▲" : "▼"} {isQty ? (diff > 0 ? `+${diff.toLocaleString("es-AR", { maximumFractionDigits: 1 })}` : diff.toLocaleString("es-AR", { maximumFractionDigits: 1 })) : `${pct}%`}
      </span>
    );
  }

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Stagger delay={0} y={-8}>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Resumen por Producto</h1>
          <p className="text-sm text-gray-500 mb-4">Ventas, costos y ganancia por producto, rubro y marca.</p>
        </Stagger>

        {/* Filters */}
        <Stagger delay={60}>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-gray-500">Mes:</span>
              <input type="month" value={mes} onChange={(e) => { setMes(e.target.value); setRangoDesde(""); setRangoHasta(""); }} className="px-3 py-2 border border-brand-400 rounded-xl text-sm" />
            </div>
            {(() => {
              const today = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
              const dayOfWeek = today.getDay() === 0 ? 7 : today.getDay(); // Mon=1, Sun=7
              const thisMonday = new Date(today); thisMonday.setDate(today.getDate() - dayOfWeek + 1);
              const thisSunday = new Date(thisMonday); thisSunday.setDate(thisMonday.getDate() + 6);
              const lastMonday = new Date(thisMonday); lastMonday.setDate(thisMonday.getDate() - 7);
              const lastSunday = new Date(lastMonday); lastSunday.setDate(lastMonday.getDate() + 6);
              const fmt = (d: Date) => d.toISOString().slice(0, 10);
              const isThisWeek = rangoDesde === fmt(thisMonday) && rangoHasta === fmt(thisSunday);
              const isLastWeek = rangoDesde === fmt(lastMonday) && rangoHasta === fmt(lastSunday);
              return (
                <>
                  <button onClick={() => { setRangoDesde(fmt(thisMonday)); setRangoHasta(fmt(thisSunday)); }}
                    className={`px-3 py-2 rounded-xl text-xs font-medium ${springBtn} ${isThisWeek ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    Esta semana
                  </button>
                  <button onClick={() => { setRangoDesde(fmt(lastMonday)); setRangoHasta(fmt(lastSunday)); }}
                    className={`px-3 py-2 rounded-xl text-xs font-medium ${springBtn} ${isLastWeek ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                    Semana anterior
                  </button>
                  {rangoDesde && (
                    <button onClick={() => { setRangoDesde(""); setRangoHasta(""); }}
                      className={`px-3 py-2 rounded-xl text-xs font-medium bg-gray-100 text-gray-600 ${springBtn}`}>
                      Mes completo
                    </button>
                  )}
                </>
              );
            })()}
            <button onClick={() => setComparar(!comparar)}
              className={`px-3 py-2 rounded-xl text-sm font-medium ${springBtn} ${comparar ? "bg-blue-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {comparar ? "✕ Comparar" : "Comparar meses"}
            </button>
            {comparar && (
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-blue-600">vs:</span>
                <input type="month" value={mesComp} onChange={(e) => setMesComp(e.target.value)} className="px-3 py-2 border-2 border-blue-400 rounded-xl text-sm bg-blue-50" />
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1 mb-6">
            {["1", "2", "6", "7", "10", "11"].map((s) => (
              <button key={s} onClick={() => toggleSuc(s)}
                className={`px-3 py-2 rounded-xl text-xs font-medium ${springBtn} ${sucursales.includes(s) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {SUC_NAMES[s] || `Suc ${s}`}
              </button>
            ))}
          </div>
        </Stagger>

        {comparar && loadingComp && <p className="text-xs text-blue-500 mb-2">Cargando mes anterior...</p>}
        {loading ? <LoadingCenter /> : !data ? <p className="text-gray-400">Sin datos</p> : (
          <Stagger delay={150}>
            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { value: globalVentas.toLocaleString("es-AR"), label: "Ventas", color: "text-gray-900", diff: diffBadge(globalVentas, compVentas, true) },
                { value: fmtK(globalTotal), label: "Facturado", color: "text-blue-600", diff: diffBadge(globalTotal, compTotal) },
                { value: fmtK(globalGanancia), label: "Ganancia", color: "text-green-600", diff: diffBadge(globalGanancia, compGanancia) },
                { value: `${globalMargen}%`, label: "Margen", color: "text-brand-600", diff: null },
              ].map((card, i) => (
                <div key={card.label} className="bg-white border rounded-xl shadow-sm p-4 text-center" style={staggerStyle(ready, i, 150)}>
                  <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                  <div className="text-xs text-gray-500">{card.label}</div>
                  {card.diff && <div className="mt-1">{card.diff}</div>}
                </div>
              ))}
            </div>

            {/* Per-sucursal */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {data.totales.map((t, i) => (
                <div key={t.sucursal} className="bg-white border rounded-xl shadow-sm p-3" style={staggerStyle(ready, i + 4, 150)}>
                  <div className="text-xs font-medium text-gray-500 mb-1">{SUC_NAMES[t.sucursal] || `Suc ${t.sucursal}`}</div>
                  <div className="text-sm"><span className="text-gray-600">{t.cantVentas} ventas</span> — <span className="text-blue-600 font-medium">{fmtK(t.totalVenta)}</span></div>
                  <div className="text-sm"><span className="text-green-600 font-medium">{fmtK(t.ganancia)}</span> <span className="text-gray-400">({t.margen}%)</span></div>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              {/* Top rubros bar chart */}
              <div className="bg-white border rounded-xl shadow-sm p-4 overflow-hidden">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Top Rubros — Ganancia</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.rubros.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="rubro" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                    <Bar dataKey="ganancia" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Top marcas pie chart */}
              <div className="bg-white border rounded-xl shadow-sm p-4 overflow-hidden">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Top Marcas — Ventas</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.marcas.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="marca" width={120} tick={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                    <Bar dataKey="totalVenta" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Selected products comparison table */}
            {comparar && selectedSkus.size > 0 && dataComp && (
              <div className="bg-blue-50 border-2 border-blue-300 rounded-xl shadow-md overflow-hidden mb-6">
                <div className="px-4 py-3 bg-blue-100 border-b border-blue-300 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-blue-800">Comparación: {mes} vs {mesComp} ({selectedSkus.size} productos)</h3>
                  <button onClick={() => setSelectedSkus(new Set())} className={`text-xs text-blue-600 hover:text-red-500 ${springBtn}`}>Limpiar</button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 border-b bg-gray-50">
                        <th className="text-left px-4 py-2">Producto</th>
                        <th className="text-right px-3 py-2">Cant. {mes.slice(5)}</th>
                        <th className="text-right px-3 py-2">Cant. {mesComp.slice(5)}</th>
                        <th className="text-right px-3 py-2">Dif. Cant.</th>
                        <th className="text-right px-3 py-2">~Unid.</th>
                        <th className="text-right px-3 py-2">$ {mes.slice(5)}</th>
                        <th className="text-right px-3 py-2">$ {mesComp.slice(5)}</th>
                        <th className="text-right px-3 py-2">Dif. $</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {Array.from(selectedSkus).map((sku) => {
                        const curr = data.productos.find((p) => p.sku === sku);
                        const prev = compMap.get(sku);
                        const cQty = curr?.cantidad || 0;
                        const pQty = prev?.cantidad || 0;
                        const cSale = curr?.totalVenta || 0;
                        const pSale = prev?.totalVenta || 0;
                        const dQty = cQty - pQty;
                        const dSale = cSale - pSale;
                        const isKg = curr?.unidad === "KG" || prev?.unidad === "KG";
                        const pesoPieza = curr?.pesoPorPieza || prev?.pesoPorPieza || 0;
                        const unidAprox = isKg && pesoPieza > 0 ? Math.round(cQty / pesoPieza) : null;
                        return (
                          <tr key={sku} className={hoverRow}>
                            <td className="px-4 py-2">
                              <div className="text-sm font-medium text-gray-900">{curr?.nombre || prev?.nombre || sku}</div>
                              <div className="text-xs text-gray-400">{curr?.marca || prev?.marca}</div>
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {cQty.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
                              {isKg && <span className="text-xs text-gray-400 ml-1">kg</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-gray-500">
                              {pQty.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
                              {isKg && <span className="text-xs text-gray-400 ml-1">kg</span>}
                            </td>
                            <td className={`px-3 py-2 text-right font-bold ${dQty >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {dQty >= 0 ? "+" : ""}{dQty.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
                              {isKg && <span className="text-xs ml-1">kg</span>}
                            </td>
                            <td className="px-3 py-2 text-right text-blue-600 font-medium">
                              {unidAprox != null ? `~${unidAprox}` : isKg ? "—" : cQty.toLocaleString("es-AR", { maximumFractionDigits: 0 })}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">{fmtK(cSale)}</td>
                            <td className="px-3 py-2 text-right text-gray-500">{fmtK(pSale)}</td>
                            <td className={`px-3 py-2 text-right font-bold ${dSale >= 0 ? "text-green-600" : "text-red-600"}`}>
                              {dSale >= 0 ? "+" : ""}{fmtK(dSale)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Product table */}
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[200px]">
                  <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto, marca o SKU..."
                    className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2 border border-gray-300 rounded-xl text-sm">
                  <option value="ganancia">Ordenar: Ganancia</option>
                  <option value="totalVenta">Ordenar: Ventas</option>
                  <option value="cantidad">Ordenar: Cantidad</option>
                  <option value="margen">Ordenar: Margen %</option>
                </select>
                <button onClick={async () => {
                  const { jsPDF } = await import("jspdf");
                  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                  const w = doc.internal.pageSize.getWidth();
                  const pageH = doc.internal.pageSize.getHeight();
                  let y = 15;
                  doc.setFontSize(12); doc.setFont("helvetica", "bold");
                  doc.text("Lista de Productos", 14, y);
                  doc.setFontSize(8); doc.setFont("helvetica", "normal");
                  doc.text(rangoDesde ? `${rangoDesde} a ${rangoHasta}` : mes, w - 14, y, { align: "right" });
                  y += 8;
                  doc.setFillColor(240, 240, 240);
                  doc.rect(14, y - 3, w - 28, 5, "F");
                  doc.setFontSize(7); doc.setFont("helvetica", "bold");
                  doc.text("SKU", 16, y); doc.text("Producto", 30, y); doc.text("Cantidad", w - 45, y, { align: "right" }); doc.text("Unidad", w - 18, y, { align: "right" });
                  y += 5;
                  doc.setFont("helvetica", "normal");
                  const allProds = data?.productos?.sort((a, b) => b.cantidad - a.cantidad) || [];
                  for (const p of allProds) {
                    if (y > pageH - 15) { doc.addPage(); y = 15; }
                    doc.text(p.sku, 16, y);
                    doc.text(p.nombre.substring(0, 40), 30, y);
                    doc.text(String(Math.round(p.cantidad * 100) / 100), w - 45, y, { align: "right" });
                    doc.text(p.unidad || "UN", w - 18, y, { align: "right" });
                    y += 4;
                  }
                  doc.save(`Productos-${rangoDesde || mes}.pdf`);
                }} className={`px-3 py-2 bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs font-medium ${springBtn}`}>
                  PDF sin precios
                </button>
              </div>
              <div className="divide-y">
                {filtered.map((p, i) => {
                  const isOpen = expanded === p.sku;
                  return (
                  <div key={p.sku} className={isOpen ? "bg-brand-50 border-l-4 border-l-brand-500 rounded-xl shadow-md my-1" : ""} style={staggerStyle(ready, i)}>
                    <button onClick={() => setExpanded(isOpen ? null : p.sku)}
                      className={`w-full px-4 py-2.5 flex items-center justify-between text-left ${hoverRow} ${isOpen ? "bg-brand-50" : ""}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {comparar && dataComp && (
                            <input
                              type="checkbox"
                              checked={selectedSkus.has(p.sku)}
                              onChange={(e) => { e.stopPropagation(); toggleSelect(p.sku); }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 shrink-0"
                            />
                          )}
                          <span className="text-xs text-gray-400 font-mono">{p.sku}</span>
                          <Link href={`/admin/dashboard/producto?sku=${p.sku}`} target="_blank" onClick={(e) => e.stopPropagation()} className={`text-sm font-medium truncate hover:underline ${isOpen ? "text-brand-700" : "text-gray-900"}`}>{p.nombre}</Link>
                        </div>
                        <div className="text-xs text-gray-400">{p.marca} — {p.rubro}</div>
                      </div>
                      <div className="flex items-center gap-3 sm:gap-4 shrink-0 text-right">
                        {comparar && dataComp && (() => {
                          const prev = compMap.get(p.sku);
                          const prevQty = prev?.cantidad || 0;
                          const diff = p.cantidad - prevQty;
                          return (
                            <div>
                              <div className="text-sm font-medium text-gray-700">{p.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</div>
                              <div className={`text-xs font-medium ${diff >= 0 ? "text-green-600" : "text-red-600"}`}>
                                {diff >= 0 ? "▲" : "▼"} {Math.abs(diff).toLocaleString("es-AR", { maximumFractionDigits: 1 })}
                              </div>
                            </div>
                          );
                        })()}
                        <div>
                          <div className="text-sm font-medium text-gray-900">{fmt(p.totalVenta)}</div>
                          <div className="text-xs text-gray-400">{comparar && dataComp ? diffBadge(p.totalVenta, compMap.get(p.sku)?.totalVenta || 0) || <span className="text-blue-500">sin ventas en {mesComp.slice(5)}</span> : "vendido"}</div>
                        </div>
                        <div>
                          <div className="text-sm font-bold text-green-600">{fmt(p.ganancia)}</div>
                          <div className="text-xs text-gray-400">{p.margen}%</div>
                        </div>
                        <HiChevronDown className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                      </div>
                    </button>
                    <CollapsiblePanel open={isOpen}>
                      <div className="px-4 py-2 bg-brand-50/50 border-t border-brand-200">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                          <div><span className="text-gray-500">Cantidad:</span> <span className="font-medium">{p.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</span></div>
                          <div><span className="text-gray-500">Costo total:</span> <span className="font-medium">{fmt(p.totalCosto)}</span></div>
                          <div><span className="text-gray-500">Venta total:</span> <span className="font-medium text-blue-600">{fmt(p.totalVenta)}</span></div>
                          <div><span className="text-gray-500">Ganancia:</span> <span className="font-medium text-green-600">{fmt(p.ganancia)}</span></div>
                        </div>
                        {p.listas.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {p.listas.map((l) => (
                              <div key={l.lista} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1">
                                <span className="text-gray-600">{l.listaName}</span>
                                <span>{l.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 1 })} u — {fmt(l.totalVenta)} — <span className="text-green-600 font-medium">{fmt(l.ganancia)}</span></span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </CollapsiblePanel>
                  </div>
                  );
                })}
              </div>
              {filtered.length >= limit && (
                <button onClick={() => setLimit((l) => l + 50)} className={`w-full py-3 text-sm text-brand-600 hover:bg-brand-50 font-medium ${springBtn}`}>
                  Cargar mas...
                </button>
              )}
            </div>
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}
