"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { HiChevronDown, HiSearch } from "react-icons/hi";

const SUC_NAMES: Record<string, string> = { "1": "Minorista 435", "2": "Mayorista 387", "6": "May. Pontevedra", "7": "Distribuidora" };
interface ListaData { lista: number; listaName: string; cantidad: number; totalVenta: number; ganancia: number }
interface Product { sku: string; nombre: string; marca: string; rubro: string; totalVenta: number; totalCosto: number; ganancia: number; cantidad: number; margen: string; listas: ListaData[] }
interface SucTotal { sucursal: string; cantVentas: number; totalVenta: number; totalCosto: number; ganancia: number; margen: string }
interface ChartData { rubro?: string; marca?: string; totalVenta: number; ganancia: number }
interface ResumenData { mes: string; totales: SucTotal[]; rubros: ChartData[]; marcas: ChartData[]; productos: Product[] }

const fmt = (n: number) => formatPrice(n);
const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));

export default function ResumenProductosPage() {
  const [data, setData] = useState<ResumenData | null>(null);
  const [loading, setLoading] = useState(false);
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7));
  const [sucursales, setSucursales] = useState(["1", "2", "6", "7"]);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"totalVenta" | "ganancia" | "cantidad" | "margen">("ganancia");
  const [limit, setLimit] = useState(50);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/resumen-productos?mes=${mes}&sucursales=${sucursales.join(",")}`);
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch { setData(null); }
    setLoading(false);
  }

  useEffect(() => { load(); }, [mes, sucursales]);

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

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Resumen por Producto</h1>
      <p className="text-sm text-gray-500 mb-4">Ventas, costos y ganancia por producto, rubro y marca.</p>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <input type="month" value={mes} onChange={(e) => setMes(e.target.value)} className="px-3 py-2 border border-brand-400 rounded-lg text-sm" />
        <div className="flex gap-1">
          {["1", "2", "6", "7"].map((s) => (
            <button key={s} onClick={() => toggleSuc(s)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${sucursales.includes(s) ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {SUC_NAMES[s] || `Suc ${s}`}
            </button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-gray-400">Cargando...</p> : !data ? <p className="text-gray-400">Sin datos</p> : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{globalVentas.toLocaleString("es-AR")}</div>
              <div className="text-xs text-gray-500">Ventas</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{fmtK(globalTotal)}</div>
              <div className="text-xs text-gray-500">Facturado</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{fmtK(globalGanancia)}</div>
              <div className="text-xs text-gray-500">Ganancia</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{globalMargen}%</div>
              <div className="text-xs text-gray-500">Margen</div>
            </div>
          </div>

          {/* Per-sucursal */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {data.totales.map((t) => (
              <div key={t.sucursal} className="bg-white border rounded-xl p-3">
                <div className="text-xs font-medium text-gray-500 mb-1">{SUC_NAMES[t.sucursal] || `Suc ${t.sucursal}`}</div>
                <div className="text-sm"><span className="text-gray-600">{t.cantVentas} ventas</span> — <span className="text-blue-600 font-medium">{fmtK(t.totalVenta)}</span></div>
                <div className="text-sm"><span className="text-green-600 font-medium">{fmtK(t.ganancia)}</span> <span className="text-gray-400">({t.margen}%)</span></div>
              </div>
            ))}
          </div>

          {/* Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Top rubros bar chart */}
            <div className="bg-white border rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Top Rubros — Ganancia</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.rubros.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="rubro" width={120} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="ganancia" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Top marcas pie chart */}
            <div className="bg-white border rounded-xl p-4">
              <h3 className="text-sm font-bold text-gray-700 mb-3">Top Marcas — Ventas</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.marcas.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="marca" width={120} tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v) => fmt(Number(v))} />
                  <Bar dataKey="totalVenta" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Product table */}
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto, marca o SKU..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="px-3 py-2 border border-gray-300 rounded-lg text-sm">
                <option value="ganancia">Ordenar: Ganancia</option>
                <option value="totalVenta">Ordenar: Ventas</option>
                <option value="cantidad">Ordenar: Cantidad</option>
                <option value="margen">Ordenar: Margen %</option>
              </select>
            </div>
            <div className="divide-y">
              {filtered.map((p) => {
                const isOpen = expanded === p.sku;
                return (
                <div key={p.sku} className={isOpen ? "bg-brand-50 border-l-4 border-l-brand-500 rounded-lg shadow-md my-1" : ""}>
                  <button onClick={() => setExpanded(isOpen ? null : p.sku)}
                    className={`w-full px-4 py-2.5 flex items-center justify-between text-left ${isOpen ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400 font-mono">{p.sku}</span>
                        <span className={`text-sm font-medium truncate ${isOpen ? "text-brand-700" : "text-gray-900"}`}>{p.nombre}</span>
                      </div>
                      <div className="text-xs text-gray-400">{p.marca} — {p.rubro}</div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0 text-right">
                      <div>
                        <div className="text-sm font-medium text-gray-900">{fmt(p.totalVenta)}</div>
                        <div className="text-xs text-gray-400">vendido</div>
                      </div>
                      <div>
                        <div className="text-sm font-bold text-green-600">{fmt(p.ganancia)}</div>
                        <div className="text-xs text-gray-400">{p.margen}%</div>
                      </div>
                      <HiChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                    </div>
                  </button>
                  {isOpen && (
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
                  )}
                </div>
                );
              })}
            </div>
            {filtered.length >= limit && (
              <button onClick={() => setLimit((l) => l + 50)} className="w-full py-3 text-sm text-brand-600 hover:bg-brand-50 font-medium">
                Cargar mas...
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
