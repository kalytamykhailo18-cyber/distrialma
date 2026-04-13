"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiSearch, HiPlus, HiTrash, HiChevronDown } from "react-icons/hi";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Proveedor { cod: string; nombre: string }
interface Mapping { id: number; sku: string; productName: string; proveedorCod: string; proveedorName: string }
interface RepoProduct { sku: string; nombre: string; unidad: string; stockActual: number; ventaSemanal: number; sugerido: number; costoUnit: number; costoTotal: number }
interface RepoProveedor { cod: string; nombre: string; totalSugerido: number; productos: RepoProduct[] }
interface ProvSummary { cod: string; nombre: string; cantProductos: number }

const fmt = (n: number) => formatPrice(n);
const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));

export default function ProveedoresProductosPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [puntouchMappings, setPuntouchMappings] = useState<Array<{ sku: string; nombre: string }>>([]);
  const [marcas, setMarcas] = useState<Array<{ cod: string; nombre: string }>>([]);
  const [rubros, setRubros] = useState<Array<{ cod: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProv, setSelectedProv] = useState("");
  const [tab, setTab] = useState<"proveedores" | "resumen" | "asignar">("proveedores");
  const [semanas, setSemanas] = useState(4);

  // Assign
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ sku: string; name: string }>>([]);
  const [bulkMarca, setBulkMarca] = useState("");
  const [bulkRubro, setBulkRubro] = useState("");
  const [saving, setSaving] = useState(false);

  // Proveedores tab
  const [provSummary, setProvSummary] = useState<ProvSummary[]>([]);
  const [expandedProv, setExpandedProv] = useState<string | null>(null);
  const [provDetail, setProvDetail] = useState<RepoProveedor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [repoSort, setRepoSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "sugerido", dir: "desc" });

  // Resumen tab
  const [resumenData, setResumenData] = useState<RepoProveedor[]>([]);
  const [resumenLoading, setResumenLoading] = useState(false);

  // Proveedores filter/pagination
  const [provSearch, setProvSearch] = useState("");
  const [provPage, setProvPage] = useState(0);
  const PROV_PAGE_SIZE = 20;

  // Asignar mappings filter/pagination
  const [mapSearch, setMapSearch] = useState("");
  const [mapPage, setMapPage] = useState(0);
  const MAP_PAGE_SIZE = 30;

  async function loadData() {
    setLoading(true);
    try {
      const [mapRes, sumRes] = await Promise.all([
        fetch("/api/admin/producto-proveedor").then((r) => r.json()),
        fetch(`/api/admin/reposicion?semanas=${semanas}`).then((r) => r.json()),
      ]);
      setProveedores(mapRes.proveedores || []);
      setMappings(mapRes.mappings || []);
      setPuntouchMappings(mapRes.puntouchMappings || []);
      setMarcas(mapRes.marcas || []);
      setRubros(mapRes.rubros || []);
      if (sumRes.mode === "summary") setProvSummary(sumRes.proveedores || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProvDetail(provCod: string) {
    if (expandedProv === provCod) { setExpandedProv(null); setProvDetail(null); return; }
    setDetailLoading(true);
    setExpandedProv(provCod);
    try {
      const res = await fetch(`/api/admin/reposicion?semanas=${semanas}&proveedor=${provCod}`);
      const d = await res.json();
      if (d.proveedores?.length > 0) setProvDetail(d.proveedores[0]);
      else setProvDetail(null);
    } catch {}
    setDetailLoading(false);
  }

  async function loadResumen() {
    setResumenLoading(true);
    try {
      const res = await fetch(`/api/admin/reposicion?semanas=${semanas}&all=1`);
      const d = await res.json();
      setResumenData((d.proveedores || []).sort((a: RepoProveedor, b: RepoProveedor) => b.totalSugerido - a.totalSugerido));
    } catch {}
    setResumenLoading(false);
  }

  async function searchProducts(q: string) {
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      setSearchResults(d.products || []);
    } catch {}
  }

  async function addMapping(sku: string) {
    if (!selectedProv) return;
    const prov = proveedores.find((p) => p.cod === selectedProv);
    if (!prov) return;
    const product = searchResults.find((p) => p.sku === sku);
    setSaving(true);
    try {
      await fetch("/api/admin/producto-proveedor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", sku, productName: product?.name || "", proveedorCod: prov.cod, proveedorName: prov.nombre }),
      });
      await loadData();
    } catch {}
    setSaving(false);
  }

  async function bulkAssign() {
    if (!selectedProv || (!bulkMarca && !bulkRubro)) return;
    const prov = proveedores.find((p) => p.cod === selectedProv);
    if (!prov) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/producto-proveedor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", proveedorCod: prov.cod, proveedorName: prov.nombre, marcaCod: bulkMarca || undefined, rubroCod: bulkRubro || undefined }),
      });
      const d = await res.json();
      alert(`Asignados: ${d.created || 0} productos`);
      await loadData();
      setBulkMarca(""); setBulkRubro("");
    } catch {}
    setSaving(false);
  }

  async function removeMapping(sku: string, proveedorCod: string) {
    try {
      await fetch("/api/admin/producto-proveedor", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, proveedorCod }),
      });
      await loadData();
    } catch {}
  }

  const filteredMappings = selectedProv ? mappings.filter((m) => m.proveedorCod === selectedProv) : mappings;
  const totalResumen = resumenData.reduce((s, p) => s + p.totalSugerido, 0);
  const totalProductosPedir = resumenData.reduce((s, p) => s + p.productos.filter((x) => x.sugerido > 0).length, 0);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Proveedores y Productos</h1>
      <p className="text-sm text-gray-500 mb-4">Asocia productos a proveedores y calcula la reposicion semanal.</p>

      {/* Top tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b pb-3">
        {[
          { key: "proveedores" as const, label: "Proveedores" },
          { key: "resumen" as const, label: "Resumen" },
          { key: "asignar" as const, label: "Asignar" },
        ].map((t) => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "resumen" && resumenData.length === 0) loadResumen(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
            {t.label}
          </button>
        ))}
        <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}
          className="ml-auto px-3 py-2 border rounded-lg text-sm">
          <option value={2}>2 semanas</option>
          <option value={4}>4 semanas</option>
          <option value={8}>8 semanas</option>
        </select>
      </div>

      {loading ? <p className="text-gray-400">Cargando...</p> : (
        <>
          {/* ═══ PROVEEDORES TAB ═══ */}
          {tab === "proveedores" && (() => {
            const filtered = provSearch
              ? provSummary.filter((p) => p.nombre.toLowerCase().includes(provSearch.toLowerCase()) || p.cod.includes(provSearch))
              : provSummary;
            const totalPages = Math.ceil(filtered.length / PROV_PAGE_SIZE);
            const paged = filtered.slice(provPage * PROV_PAGE_SIZE, (provPage + 1) * PROV_PAGE_SIZE);
            return (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2 mb-2 items-center">
                <div className="relative flex-1 min-w-[200px]">
                  <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input type="text" value={provSearch} onChange={(e) => { setProvSearch(e.target.value); setProvPage(0); }}
                    placeholder="Buscar proveedor..."
                    className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-500" />
                </div>
                <span className="text-xs text-gray-400">{filtered.length} proveedores</span>
                {totalPages > 1 && (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setProvPage((p) => Math.max(0, p - 1))} disabled={provPage === 0}
                      className="px-2 py-1 rounded text-xs border disabled:opacity-30">←</button>
                    <span className="text-xs text-gray-500">{provPage + 1}/{totalPages}</span>
                    <button onClick={() => setProvPage((p) => Math.min(totalPages - 1, p + 1))} disabled={provPage >= totalPages - 1}
                      className="px-2 py-1 rounded text-xs border disabled:opacity-30">→</button>
                  </div>
                )}
              </div>
              {paged.length === 0 ? (
                <p className="text-gray-400">No hay proveedores.</p>
              ) : paged.map((prov) => {
                const isOpen = expandedProv === prov.cod;
                const detail = isOpen ? provDetail : null;
                const todos = detail?.productos || [];
                return (
                  <div key={prov.cod} className={`bg-white border rounded-xl overflow-hidden ${isOpen ? "border-brand-400 shadow-md" : ""}`}>
                    <button onClick={() => loadProvDetail(prov.cod)}
                      className={`w-full px-4 py-3 flex items-center justify-between text-left ${isOpen ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                      <div>
                        <h3 className={`text-sm font-bold ${isOpen ? "text-brand-700" : "text-gray-700"}`}>{prov.nombre}</h3>
                        <span className="text-xs text-gray-400">{prov.cantProductos} productos</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {detail && <span className="text-sm font-bold text-brand-600">{fmt(detail.totalSugerido)}</span>}
                        <HiChevronDown className={`w-4 h-4 transition-transform ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                      </div>
                    </button>
                    {isOpen && (detailLoading ? (
                      <div className="px-4 py-3 border-t text-gray-400 text-sm">Cargando...</div>
                    ) : detail && (
                      <div className="overflow-x-auto max-h-[400px] overflow-y-auto border-t">
                        <table className="w-full text-sm">
                          <thead className="sticky top-0">
                            <tr className="bg-gray-100 text-xs text-gray-500">
                              <th className="text-left p-2 pl-4">Producto</th>
                              {[
                                { key: "stockActual", label: "Stock" },
                                { key: "ventaSemanal", label: "Venta/sem" },
                                { key: "sugerido", label: "Sugerido" },
                                { key: "costoTotal", label: "Costo est." },
                              ].map((col) => (
                                <th key={col.key}
                                  onClick={() => setRepoSort((prev) => ({ field: col.key, dir: prev.field === col.key && prev.dir === "desc" ? "asc" : "desc" }))}
                                  className="text-right p-2 cursor-pointer hover:bg-gray-200 select-none">
                                  {col.label} {repoSort.field === col.key ? (repoSort.dir === "desc" ? "↓" : "↑") : ""}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {todos.sort((a, b) => {
                              const av = (a as unknown as Record<string, number>)[repoSort.field] || 0;
                              const bv = (b as unknown as Record<string, number>)[repoSort.field] || 0;
                              return repoSort.dir === "desc" ? bv - av : av - bv;
                            }).map((p) => (
                              <tr key={p.sku} className={p.sugerido > 0 ? "bg-red-50/50 hover:bg-red-50" : "hover:bg-gray-50"}>
                                <td className="p-2 pl-4">
                                  <span className="text-gray-400 text-xs font-mono mr-1">{p.sku}</span>
                                  <span className="text-gray-900">{p.nombre}</span>
                                </td>
                                <td className={`text-right p-2 ${p.stockActual <= 0 ? "text-red-600 font-bold" : "text-gray-600"}`}>{p.stockActual.toLocaleString("es-AR", { maximumFractionDigits: 1 })} {p.unidad === "KG" ? "kg" : "u"}</td>
                                <td className="text-right p-2 text-blue-600 font-medium">{p.ventaSemanal.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</td>
                                <td className={`text-right p-2 font-bold ${p.sugerido > 0 ? "text-brand-600" : "text-gray-300"}`}>{p.sugerido > 0 ? p.sugerido.toLocaleString("es-AR", { maximumFractionDigits: 1 }) : "—"}</td>
                                <td className="text-right p-2 pr-4 text-gray-700">{p.sugerido > 0 ? fmt(p.costoTotal) : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                );
              })}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-2">
                  <button onClick={() => setProvPage((p) => Math.max(0, p - 1))} disabled={provPage === 0}
                    className="px-3 py-1 rounded text-sm border disabled:opacity-30">Anterior</button>
                  <span className="text-xs text-gray-500">{provPage + 1} / {totalPages}</span>
                  <button onClick={() => setProvPage((p) => Math.min(totalPages - 1, p + 1))} disabled={provPage >= totalPages - 1}
                    className="px-3 py-1 rounded text-sm border disabled:opacity-30">Siguiente</button>
                </div>
              )}
            </div>
            );
          })()}

          {/* ═══ RESUMEN TAB ═══ */}
          {tab === "resumen" && (
            <div className="space-y-4">
              {resumenLoading ? (
                <p className="text-gray-400">Cargando resumen de todos los proveedores...</p>
              ) : resumenData.length === 0 ? (
                <button onClick={loadResumen} className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium">
                  Cargar resumen completo
                </button>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div className="bg-white border rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-gray-900">{resumenData.length}</div>
                      <div className="text-xs text-gray-500">Proveedores</div>
                    </div>
                    <div className="bg-white border rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-blue-600">{totalProductosPedir}</div>
                      <div className="text-xs text-gray-500">Productos a pedir</div>
                    </div>
                    <div className="bg-white border rounded-xl p-3 text-center">
                      <div className="text-lg font-bold text-brand-600">{fmt(totalResumen)}</div>
                      <div className="text-xs text-gray-500">Costo total estimado</div>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="bg-white border rounded-xl p-4 overflow-hidden">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">Costo estimado por proveedor</h3>
                    <ResponsiveContainer width="100%" height={Math.max(200, resumenData.filter((p) => p.totalSugerido > 0).length * 30)}>
                      <BarChart data={resumenData.filter((p) => p.totalSugerido > 0)} layout="vertical" margin={{ left: 10, right: 10 }}>
                        <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10 }} />
                        <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                        <Bar dataKey="totalSugerido" name="Costo estimado" fill="#f97316" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ═══ ASIGNAR TAB ═══ */}
          {tab === "asignar" && (
            <>
              {/* Proveedor selector */}
              <div className="mb-4">
                <select value={selectedProv} onChange={(e) => { setSelectedProv(e.target.value); loadData(); }}
                  className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm">
                  <option value="">Seleccionar proveedor...</option>
                  {proveedores.map((p) => (
                    <option key={p.cod} value={p.cod}>{p.nombre}</option>
                  ))}
                </select>
              </div>

              {selectedProv && (
                <>
                  {/* Bulk assign */}
                  <div className="bg-white border rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">Asignacion masiva a {proveedores.find((p) => p.cod === selectedProv)?.nombre}</h3>
                    <div className="flex flex-wrap gap-3">
                      <select value={bulkMarca} onChange={(e) => setBulkMarca(e.target.value)} className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[150px]">
                        <option value="">Por marca...</option>
                        {marcas.map((m) => <option key={m.cod} value={m.cod}>{m.nombre}</option>)}
                      </select>
                      <select value={bulkRubro} onChange={(e) => setBulkRubro(e.target.value)} className="px-3 py-2 border rounded-lg text-sm flex-1 min-w-[150px]">
                        <option value="">Por rubro...</option>
                        {rubros.map((r) => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
                      </select>
                      <button onClick={bulkAssign} disabled={saving || (!bulkMarca && !bulkRubro)}
                        className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                        {saving ? "Asignando..." : "Asignar todos"}
                      </button>
                    </div>
                  </div>

                  {/* Single assign */}
                  <div className="bg-white border rounded-xl p-4 mb-4">
                    <h3 className="text-sm font-bold text-gray-700 mb-3">Asignar producto individual</h3>
                    <div className="relative">
                      <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input type="text" value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); searchProducts(e.target.value); }}
                        placeholder="Buscar producto por nombre o SKU..."
                        className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm" />
                    </div>
                    {searchResults.length > 0 && (
                      <div className="mt-2 border rounded-lg divide-y max-h-48 overflow-y-auto">
                        {searchResults.map((p) => {
                          const alreadyPt = puntouchMappings.some((m) => m.sku === p.sku);
                          const alreadyWeb = filteredMappings.some((m) => m.sku === p.sku);
                          const already = alreadyPt || alreadyWeb;
                          return (
                            <button key={p.sku} onClick={() => { if (!already) { addMapping(p.sku); setSearchQuery(""); setSearchResults([]); } }}
                              disabled={already}
                              className={`w-full px-3 py-2 flex items-center justify-between text-left text-sm ${already ? "bg-gray-50 opacity-60" : "hover:bg-brand-50"}`}>
                              <span><span className="text-gray-400 font-mono mr-2">{p.sku}</span>{p.name}</span>
                              {already ? (
                                <span className="text-xs text-green-600 font-medium">{alreadyPt ? "PunTouch" : "Asignado"}</span>
                              ) : (
                                <HiPlus className="w-4 h-4 text-brand-500" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Current mappings */}
              {(() => {
                const allMaps = [
                  ...puntouchMappings.map((m) => ({ ...m, source: "pt" as const, id: `pt-${m.sku}` })),
                  ...filteredMappings.map((m) => ({ sku: m.sku, nombre: m.productName || m.sku, source: "web" as const, id: String(m.id), proveedorCod: m.proveedorCod })),
                ];
                const filteredMaps = mapSearch
                  ? allMaps.filter((m) => m.nombre.toLowerCase().includes(mapSearch.toLowerCase()) || m.sku.includes(mapSearch))
                  : allMaps;
                const mapTotalPages = Math.ceil(filteredMaps.length / MAP_PAGE_SIZE);
                const pagedMaps = filteredMaps.slice(mapPage * MAP_PAGE_SIZE, (mapPage + 1) * MAP_PAGE_SIZE);
                return (
              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-gray-700">
                    Productos ({allMaps.length})
                  </h3>
                  <div className="relative flex-1 min-w-[150px]">
                    <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                    <input type="text" value={mapSearch} onChange={(e) => { setMapSearch(e.target.value); setMapPage(0); }}
                      placeholder="Filtrar..."
                      className="w-full pl-8 pr-3 py-1.5 border rounded-lg text-xs focus:outline-none focus:border-brand-500" />
                  </div>
                  {mapTotalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setMapPage((p) => Math.max(0, p - 1))} disabled={mapPage === 0}
                        className="px-2 py-1 rounded text-xs border disabled:opacity-30">←</button>
                      <span className="text-xs text-gray-500">{mapPage + 1}/{mapTotalPages}</span>
                      <button onClick={() => setMapPage((p) => Math.min(mapTotalPages - 1, p + 1))} disabled={mapPage >= mapTotalPages - 1}
                        className="px-2 py-1 rounded text-xs border disabled:opacity-30">→</button>
                    </div>
                  )}
                </div>
                <div className="divide-y max-h-[400px] overflow-y-auto">
                  {pagedMaps.length === 0 ? (
                    <p className="px-4 py-8 text-center text-gray-400 text-sm">
                      {selectedProv ? "No hay productos asignados a este proveedor." : "Selecciona un proveedor para ver sus productos."}
                    </p>
                  ) : (
                    <>
                      {pagedMaps.map((m) => (
                        <div key={m.id} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                          <div>
                            <span className="text-xs text-gray-400 font-mono mr-2">{m.sku}</span>
                            <span className="text-sm text-gray-900">{m.nombre}</span>
                          </div>
                          {m.source === "pt" ? (
                            <span className="text-xs text-green-600">PunTouch</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-blue-600">Web</span>
                              <button onClick={() => removeMapping(m.sku, (m as { proveedorCod: string }).proveedorCod)} className="text-red-400 hover:text-red-600">
                                <HiTrash className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
                );
              })()}
            </>
          )}
        </>
      )}
    </div>
  );
}
