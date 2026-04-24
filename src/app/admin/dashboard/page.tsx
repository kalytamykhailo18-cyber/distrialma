"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { HiTrendingUp, HiTrendingDown, HiChevronDown, HiSearch, HiPencil, HiOutlineDocumentDownload } from "react-icons/hi";
import Link from "next/link";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, useDataReady, CollapsiblePanel } from "@/components/AnimateIn";

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
  topProductosMargen?: Array<{ sku: string; nombre: string; marca: string; cantidad: number; totalVenta: number; totalCosto: number; ganancia: number; margen: string }>;
  comparativoSucursales?: Array<{ sucursal: string; ventas: number; ganancia: number; cantTickets: number; margen: string }>;
  facturacion?: Array<{ tipo: string; total: number; cantidad: number }>;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [sucursales, setSucursales] = useState(["1", "2", "6", "7", "10"]);
  const [expandedCliente, setExpandedCliente] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [diferencias, setDiferencias] = useState<{ empleados: Array<{ nombre: string; cierres: number; totalDiferencia: number; totalPendiente: number; totalSobrante?: number; diferencias: Array<{ id: number; fecha: string; sucursal: string; diferencia: number; ventas: number; chargedAt: string | null; chargedBy: string | null }> }> } | null>(null);
  const [difExpanded, setDifExpanded] = useState<string | null>(null);
  const [editingDif, setEditingDif] = useState<number | null>(null);
  const [editDifValue, setEditDifValue] = useState("");

  const [alertas, setAlertas] = useState<{
    clientesInactivos: Array<{ cod: string; nombre: string; totalCompras: number; ultimaCompra: string; diasDesde: number | null }>;
    margenBajo: Array<{ sku: string; nombre: string; totalVenta: number; ganancia: number; margen: string }>;
    sinStock: Array<{ sku: string; nombre: string; cantidadVendida: number; totalVenta: number; stockActual: number }>;
  } | null>(null);
  const [alertasOpen, setAlertasOpen] = useState(false);

  async function loadAlertas() {
    try {
      const res = await fetch(`/api/admin/dashboard/alertas?sucursales=${sucursales.join(",")}`);
      const d = await res.json();
      if (!d.error) setAlertas(d);
    } catch {}
  }

  useEffect(() => { loadAlertas(); }, [sucursales]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const dataReady = useDataReady(data);

  return (
    <PageTransition className="max-w-6xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Dashboard</h1>
        <p className="text-sm text-gray-500 mb-4">Panel de control con indicadores clave del negocio.</p>
      </Stagger>

      {/* Filters */}
      <Stagger delay={50}>
        <div className="flex flex-wrap gap-3 mb-6">
          <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="px-3 py-2 border border-brand-400 rounded-lg text-sm" />
          <div className="flex flex-wrap gap-1">
            {["1", "2", "6", "7", "10"].map((s) => (
              <button key={s} onClick={() => toggleSuc(s)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs font-medium ${springBtn} ${sucursales.includes(s) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
                {SUC_NAMES[s]}
              </button>
            ))}
          </div>
        </div>
      </Stagger>

      {/* Alertas automaticas */}
      {alertas && (alertas.clientesInactivos.length > 0 || alertas.margenBajo.length > 0 || alertas.sinStock.length > 0) && (
        <Stagger delay={80}>
          <div className="bg-gradient-to-r from-amber-50 to-red-50 border-2 border-amber-300 rounded-xl shadow-sm mb-6 overflow-hidden">
            <button onClick={() => setAlertasOpen(!alertasOpen)}
              className={`w-full px-4 py-3 flex items-center justify-between ${springBtn} ${alertasOpen ? "bg-amber-100" : "hover:bg-amber-100"}`}>
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <div className="text-left">
                  <div className="text-sm font-bold text-amber-800">Alertas automaticas</div>
                  <div className="text-xs text-amber-700">
                    {alertas.clientesInactivos.length} cliente{alertas.clientesInactivos.length === 1 ? "" : "s"} inactivo{alertas.clientesInactivos.length === 1 ? "" : "s"} ·
                    {" "}{alertas.margenBajo.length} con margen bajo ·
                    {" "}{alertas.sinStock.length} sin stock
                  </div>
                </div>
              </div>
              <HiChevronDown className={`w-5 h-5 text-amber-600 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${alertasOpen ? "rotate-180" : ""}`} />
            </button>
            <CollapsiblePanel open={alertasOpen}>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 p-3 bg-white">
                {/* Clientes inactivos */}
                {alertas.clientesInactivos.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3">
                    <h4 className="text-xs font-bold text-red-800 mb-2 flex items-center gap-1">
                      <HiTrendingDown className="w-4 h-4" />
                      Top clientes sin comprar (30+ dias)
                    </h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {alertas.clientesInactivos.map((c) => (
                        <Link key={c.cod} href={`/admin/dashboard/cliente?cod=${c.cod}`} target="_blank"
                          className="block text-xs bg-white rounded px-2 py-1.5 hover:bg-red-100 transition-colors">
                          <div className="font-medium text-gray-900 truncate">{c.nombre}</div>
                          <div className="text-gray-500">Ultima: {c.ultimaCompra} {c.diasDesde ? `(${c.diasDesde}d)` : ""} · {fmtK(c.totalCompras)}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {/* Margen bajo */}
                {alertas.margenBajo.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <h4 className="text-xs font-bold text-amber-800 mb-2 flex items-center gap-1">
                      <HiTrendingDown className="w-4 h-4" />
                      Productos con margen bajo (&lt;10%)
                    </h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {alertas.margenBajo.map((p) => (
                        <Link key={p.sku} href={`/admin/precios`} target="_blank"
                          className="block text-xs bg-white rounded px-2 py-1.5 hover:bg-amber-100 transition-colors">
                          <div className="font-medium text-gray-900 truncate">{p.nombre}</div>
                          <div className="text-gray-500">SKU {p.sku} · <span className="text-red-600 font-bold">{p.margen}%</span> · {fmtK(p.totalVenta)}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {/* Sin stock */}
                {alertas.sinStock.length > 0 && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                    <h4 className="text-xs font-bold text-orange-800 mb-2 flex items-center gap-1">
                      <HiTrendingDown className="w-4 h-4" />
                      Top vendidos sin stock
                    </h4>
                    <div className="space-y-1 max-h-64 overflow-y-auto">
                      {alertas.sinStock.map((p) => (
                        <Link key={p.sku} href={`/admin/dashboard/producto?sku=${p.sku}`} target="_blank"
                          className="block text-xs bg-white rounded px-2 py-1.5 hover:bg-orange-100 transition-colors">
                          <div className="font-medium text-gray-900 truncate">{p.nombre}</div>
                          <div className="text-gray-500">SKU {p.sku} · stock {p.stockActual} · {fmtK(p.totalVenta)} vendido</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CollapsiblePanel>
          </div>
        </Stagger>
      )}

      {loading ? <LoadingCenter /> : !data ? <p className="text-gray-400">Sin datos</p> : (
        <>
          {/* Comparativo cards */}
          <Stagger delay={100}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: "Ventas", actual: comp?.mesActual.ventas || 0, cambio: ventasCambio, format: fmtK },
                { label: "Ganancia", actual: comp?.mesActual.ganancia || 0, cambio: gananciaCambio, format: fmtK },
                { label: "Ticket Promedio", actual: comp?.mesActual.ticketPromedio || 0, cambio: ticketCambio, format: fmt },
                { label: "Clientes", actual: comp?.mesActual.clientesUnicos || 0, cambio: clientesCambio, format: (n: number) => String(n) },
              ].map((card, i) => {
                const isUp = parseFloat(card.cambio) > 0;
                const isDown = parseFloat(card.cambio) < 0;
                return (
                  <div key={card.label} className="bg-white border rounded-xl shadow-sm p-4" style={staggerStyle(dataReady, i, 100)}>
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
          </Stagger>

          {/* Daily sales chart */}
          <Stagger delay={150}>
          <div className="bg-white border rounded-xl shadow-sm p-4 mb-6 overflow-hidden">
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
          </Stagger>

          <Stagger delay={200}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Payment methods */}
            <div className="bg-white border rounded-xl shadow-sm p-4 overflow-hidden">
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
            <div className="bg-white border rounded-xl shadow-sm p-4 overflow-hidden">
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
                  <div key={e.empleadoCod} className={`flex justify-between text-xs text-gray-500 rounded px-1 py-0.5 ${hoverRow}`}>
                    <span>{e.nombre}</span>
                    <span>{e.cantTickets} tickets — prom: {fmt(e.ticketPromedio)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          </Stagger>

          {/* Comparativo entre sucursales */}
          {data.comparativoSucursales && data.comparativoSucursales.length > 1 && (
            <Stagger delay={225}>
              <div className="bg-white border rounded-xl shadow-sm p-4 mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Comparativo entre sucursales</h3>
                <ResponsiveContainer width="100%" height={Math.max(180, data.comparativoSucursales.length * 45)}>
                  <BarChart data={data.comparativoSucursales.map((s) => ({ ...s, nombre: SUC_NAMES[s.sucursal] || `Suc ${s.sucursal}` }))} layout="vertical" margin={{ left: 10, right: 10 }}>
                    <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                    <Bar dataKey="ventas" fill="#3b82f6" radius={[0, 4, 4, 0]} name="Ventas" />
                    <Bar dataKey="ganancia" fill="#22c55e" radius={[0, 4, 4, 0]} name="Ganancia" />
                  </BarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
                  {data.comparativoSucursales.map((s) => (
                    <div key={s.sucursal} className="bg-gray-50 rounded-xl p-3 border">
                      <div className="text-xs font-semibold text-gray-700 mb-1">{SUC_NAMES[s.sucursal] || `Suc ${s.sucursal}`}</div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <div className="text-blue-600 font-bold">{fmtK(s.ventas)}</div>
                          <div className="text-gray-400">Ventas</div>
                        </div>
                        <div>
                          <div className="text-green-600 font-bold">{fmtK(s.ganancia)}</div>
                          <div className="text-gray-400">Ganancia</div>
                        </div>
                        <div>
                          <div className="text-gray-700 font-bold">{s.cantTickets}</div>
                          <div className="text-gray-400">Tickets</div>
                        </div>
                        <div>
                          <div className="text-brand-600 font-bold">{s.margen}%</div>
                          <div className="text-gray-400">Margen</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Stagger>
          )}

          {/* Facturacion */}
          {data.facturacion && data.facturacion.length > 0 && (
            <Stagger delay={240}>
              <div className="bg-white border rounded-xl shadow-sm p-4 mb-6">
                <h3 className="text-sm font-bold text-gray-700 mb-3">Facturacion</h3>
                <div className="grid grid-cols-2 gap-3">
                  {data.facturacion.map((f) => (
                    <div key={f.tipo} className={`rounded-xl p-3 border ${f.tipo === "Facturado" ? "bg-green-50 border-green-200" : "bg-gray-50 border-gray-200"}`}>
                      <div className="text-xs text-gray-500 mb-1">{f.tipo}</div>
                      <div className={`text-lg font-bold ${f.tipo === "Facturado" ? "text-green-700" : "text-gray-700"}`}>{fmt(f.total)}</div>
                      <div className="text-xs text-gray-400">{f.cantidad} ventas</div>
                    </div>
                  ))}
                </div>
              </div>
            </Stagger>
          )}

          {/* Heatmap */}
          <Stagger delay={250}>
          <div className="bg-white border rounded-xl shadow-sm p-4 mb-6">
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
          </Stagger>

          <Stagger delay={300}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Top clients */}
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
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
                        <HiChevronDown className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                      </div>
                    </button>
                    <CollapsiblePanel open={isOpen}>
                      <div className="px-4 py-2 bg-brand-50/50 border-t border-brand-200 text-xs text-gray-600">
                        <span>Cod: {c.clienteCod}</span> — <span>Ultima compra: {c.ultimaCompra ? `${c.ultimaCompra.slice(6, 8)}/${c.ultimaCompra.slice(4, 6)}/${c.ultimaCompra.slice(0, 4)}` : "—"}</span> — <span>Promedio: {fmt(c.cantCompras > 0 ? c.total / c.cantCompras : 0)}</span>
                      </div>
                    </CollapsiblePanel>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Diferencias de caja */}
          {diferencias && diferencias.empleados.length > 0 && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <h3 className="text-sm font-bold text-gray-700">Diferencias de Caja por Empleado</h3>
                <button
                  onClick={async () => {
                    const { default: jsPDF } = await import("jspdf");
                    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
                    const w = doc.internal.pageSize.getWidth();
                    const pageH = doc.internal.pageSize.getHeight();

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

                    // Header
                    doc.setFillColor(251, 154, 71);
                    doc.rect(0, 0, w, 22, "F");
                    if (logoImg) {
                      try { doc.addImage(logoImg, "PNG", 10, 3, 16, 16); } catch {}
                    }
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(16);
                    doc.setFont("helvetica", "bold");
                    doc.text("Distrialma — Diferencias de Caja", logoImg ? 30 : 14, 13);
                    doc.setFontSize(9);
                    doc.setFont("helvetica", "normal");
                    doc.text(`Mes: ${mes} — ${new Date().toLocaleString("es-AR")}`, w - 14, 13, { align: "right" });
                    let y = 30;

                    const totalGeneralPendiente = diferencias.empleados.reduce((s, e) => s + (e.totalPendiente || 0), 0);
                    const totalGeneralDif = diferencias.empleados.reduce((s, e) => s + e.totalDiferencia, 0);
                    const totalCargado = totalGeneralDif - totalGeneralPendiente;

                    // Summary bar
                    doc.setFillColor(55, 65, 81);
                    doc.rect(10, y, w - 20, 10, "F");
                    doc.setTextColor(255, 255, 255);
                    doc.setFontSize(10);
                    doc.setFont("helvetica", "bold");
                    doc.text(`Total: ${fmt(Math.abs(totalGeneralDif))} — Pendiente: ${fmt(Math.abs(totalGeneralPendiente))} — Cargado: ${fmt(Math.abs(totalCargado))}`, 14, y + 7);
                    y += 14;

                    for (const emp of diferencias.empleados) {
                      if (y + 15 > pageH - 15) { doc.addPage(); y = 15; }

                      // Employee header
                      doc.setFillColor(245, 245, 245);
                      doc.rect(10, y, w - 20, 9, "F");
                      doc.setTextColor(30, 30, 30);
                      doc.setFontSize(11);
                      doc.setFont("helvetica", "bold");
                      doc.text(emp.nombre, 14, y + 6);
                      doc.setFontSize(9);
                      doc.setFont("helvetica", "normal");
                      doc.text(`${emp.cierres} cierres`, w - 80, y + 6, { align: "right" });
                      doc.setTextColor(185, 28, 28);
                      doc.setFont("helvetica", "bold");
                      doc.text(`Pendiente: ${fmt(Math.abs(emp.totalPendiente || 0))}`, w - 14, y + 6, { align: "right" });
                      y += 11;

                      // Column headers
                      doc.setFillColor(55, 65, 81);
                      doc.rect(10, y, w - 20, 7, "F");
                      doc.setTextColor(255, 255, 255);
                      doc.setFontSize(8);
                      doc.setFont("helvetica", "bold");
                      doc.text("Fecha", 14, y + 5);
                      doc.text("Sucursal", 50, y + 5);
                      doc.text("Ventas", 85, y + 5, { align: "right" });
                      doc.text("Diferencia", 130, y + 5, { align: "right" });
                      doc.text("Estado", w - 14, y + 5, { align: "right" });
                      y += 12;

                      doc.setTextColor(50, 50, 50);
                      doc.setFont("helvetica", "normal");
                      doc.setFontSize(8);

                      for (const d of emp.diferencias) {
                        if (y + 5 > pageH - 15) { doc.addPage(); y = 15; }
                        doc.text(new Date(d.fecha).toLocaleDateString("es-AR"), 14, y);
                        doc.text(d.sucursal, 50, y);
                        doc.text(String(d.ventas), 85, y, { align: "right" });
                        doc.setTextColor(185, 28, 28);
                        doc.setFont("helvetica", "bold");
                        doc.text(fmt(Math.abs(d.diferencia)), 130, y, { align: "right" });
                        doc.setTextColor(d.chargedAt ? 22 : 150, d.chargedAt ? 101 : 150, d.chargedAt ? 52 : 150);
                        doc.setFont("helvetica", "normal");
                        doc.text(d.chargedAt ? `Cargado ${new Date(d.chargedAt).toLocaleDateString("es-AR")}` : "Pendiente", w - 14, y, { align: "right" });
                        doc.setTextColor(50, 50, 50);
                        doc.setDrawColor(230, 230, 230);
                        doc.line(10, y + 1.5, w - 10, y + 1.5);
                        y += 5;
                      }
                      y += 3;
                    }

                    // Footer
                    const pc = doc.getNumberOfPages();
                    for (let p = 1; p <= pc; p++) {
                      doc.setPage(p);
                      doc.setTextColor(160, 160, 160);
                      doc.setFontSize(7);
                      doc.text(`Pagina ${p}/${pc} — distrialma.com.ar`, w / 2, pageH - 8, { align: "center" });
                    }

                    doc.save(`Diferencias-Caja-${mes}.pdf`);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 ${springBtn}`}
                >
                  <HiOutlineDocumentDownload className="w-4 h-4" />
                  PDF
                </button>
              </div>
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {diferencias.empleados.map((emp) => {
                  const isOpen = difExpanded === emp.nombre;
                  const pendiente = emp.totalPendiente || 0;
                  const cargado = emp.totalDiferencia - pendiente;
                  return (
                    <div key={emp.nombre} className={isOpen ? "bg-brand-50 border-l-4 border-l-brand-500" : ""}>
                      <button onClick={() => setDifExpanded(isOpen ? null : emp.nombre)}
                        className={`w-full px-4 py-2.5 flex items-center justify-between text-left ${isOpen ? "" : "hover:bg-gray-50"}`}>
                        <div>
                          <span className={`text-sm font-medium ${isOpen ? "text-brand-700" : "text-gray-900"}`}>{emp.nombre}</span>
                          <span className="text-xs text-gray-400 ml-2">{emp.cierres} cierres</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="text-sm font-bold text-red-600">Pendiente: {fmt(Math.abs(pendiente))}</div>
                            {cargado < 0 && <div className="text-xs text-gray-400">Cargado: {fmt(Math.abs(cargado))}</div>}
                            {(emp.totalSobrante || 0) > 0 && <div className="text-xs text-blue-600">Sobrante: +{fmt(emp.totalSobrante || 0)}</div>}
                          </div>
                          <HiChevronDown className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                        </div>
                      </button>
                      <CollapsiblePanel open={isOpen}>
                        <div className="px-4 py-2 bg-brand-50/50 border-t border-brand-200 space-y-1">
                          {emp.diferencias.map((d) => (
                            <div key={d.id} className={`flex items-center justify-between text-xs gap-2 py-1 ${d.chargedAt ? "opacity-60" : ""} ${d.diferencia > 0 ? "bg-blue-50/50 rounded" : ""}`}>
                              <span className="text-gray-500">
                                Suc {d.sucursal} — {new Date(d.fecha).toLocaleDateString("es-AR")} — {d.ventas} ventas
                                {d.diferencia > 0 && <span className="ml-1 text-blue-500 font-medium">(sobrante)</span>}
                              </span>
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
                                    <span className={d.diferencia < 0 ? "text-red-600 font-medium" : "text-blue-600 font-medium"}>{d.diferencia < 0 ? "-" : "+"}{fmt(Math.abs(d.diferencia))}</span>
                                    <button onClick={() => { setEditingDif(d.id); setEditDifValue(String(d.diferencia)); }}
                                      className="ml-1 !text-gray-400 hover:!text-gray-600" title="Corregir"><HiPencil className="w-3 h-3" /></button>
                                    {d.diferencia < 0 && (d.chargedAt ? (
                                      <button onClick={async () => {
                                        await fetch("/api/admin/cierre-caja/diferencias", {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ id: d.id, uncharge: true }),
                                        });
                                        loadDiferencias();
                                      }} className="ml-1 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200" title={`Cargado ${new Date(d.chargedAt).toLocaleDateString("es-AR")}${d.chargedBy ? " por " + d.chargedBy : ""}`}>
                                        ✓ Cargado
                                      </button>
                                    ) : (
                                      <button onClick={async () => {
                                        await fetch("/api/admin/cierre-caja/diferencias", {
                                          method: "PATCH",
                                          headers: { "Content-Type": "application/json" },
                                          body: JSON.stringify({ id: d.id, charge: true }),
                                        });
                                        loadDiferencias();
                                      }} className="ml-1 px-2 py-0.5 bg-brand-500 text-white rounded text-xs font-medium hover:bg-brand-600" title="Cargar faltante a cuenta del empleado">
                                        Cargar
                                      </button>
                                    ))}
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </CollapsiblePanel>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top productos por margen */}
          {data.topProductosMargen && data.topProductosMargen.length > 0 && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b">
                <h3 className="text-sm font-bold text-gray-700">Ranking productos por ganancia ({mes})</h3>
                <p className="text-xs text-gray-500">Los que mas aportan a la ganancia total</p>
              </div>
              <div className="divide-y max-h-[400px] overflow-y-auto">
                {data.topProductosMargen.map((p, i) => (
                  <Link key={p.sku} href={`/admin/dashboard/producto?sku=${p.sku}`} target="_blank"
                    className={`block px-4 py-2.5 ${hoverRow}`}>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs font-bold w-6 text-center shrink-0 ${i < 3 ? "text-amber-600" : "text-gray-400"}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{p.nombre}</div>
                        <div className="text-xs text-gray-400">
                          {p.marca && <span className="mr-2">{p.marca}</span>}
                          <span>SKU {p.sku}</span>
                          <span className="ml-2">— {p.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 1 })} vendidos</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-green-600">{fmt(p.ganancia)}</div>
                        <div className="text-xs text-gray-500">{p.margen}% margen</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Dead stock */}
          {deadStock && (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
                <h3 className="text-sm font-bold text-gray-700">Productos sin Movimiento</h3>
                <div className="flex gap-1">
                  {[30, 60, 90].map((d) => (
                    <button key={d} onClick={() => { setDeadDias(d); setDeadPage(0); setDeadSearch(""); }}
                      className={`px-2 py-1 rounded text-xs font-medium ${springBtn} ${deadDias === d ? "bg-red-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
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
                  }} className={`px-2 py-1 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 ${springBtn}`}>
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
                    <Link key={p.sku} href={`/admin/dashboard/producto?sku=${p.sku}`} target="_blank" className={`px-4 py-2 flex items-center justify-between hover:bg-red-50/50 block ${hoverRow}`}>
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
          </Stagger>
        </>
      )}
    </PageTransition>
  );
}
