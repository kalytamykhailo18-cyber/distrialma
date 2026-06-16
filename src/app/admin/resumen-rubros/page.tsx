"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { PageTransition, Stagger, staggerStyle, hoverRow, LoadingCenter } from "@/components/AnimateIn";
import { formatPrice } from "@/lib/utils";
import { HiChevronRight } from "react-icons/hi";

interface Row {
  rubro: string;
  cantTransacciones: number;
  cantTotal: number;
  totalVentas: number;
  totalIva: number;
  totalCosto: number;
  ganancia: number;
  capeados: number;
}

interface ProductRow {
  sku: string;
  nombre: string;
  cantTransacciones: number;
  cantTotal: number;
  totalVentas: number;
  totalIva: number;
  totalCosto: number;
  ganancia: number;
  capeados: number;
}

const SUC_NAMES: Record<string, string> = {
  "1": "Minorista 435",
  "2": "Mayorista 387",
  "6": "Mayorista Pontevedra",
  "7": "Distribuidora",
  "10": "Reventas",
  "11": "PedidosYa Local1",
};

function todayISO(): string {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export default function ResumenRubrosPage() {
  const [desde, setDesde] = useState(todayISO());
  const [hasta, setHasta] = useState(todayISO());
  const [sucursal, setSucursal] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [totales, setTotales] = useState<{ cantTransacciones: number; totalVentas: number; totalIva: number; totalCosto: number; ganancia: number } | null>(null);
  const [loading, setLoading] = useState(false);

  // Per-rubro drill-down: which rubro is expanded + cached product breakdown
  const [expandedRubro, setExpandedRubro] = useState<string | null>(null);
  const [productCache, setProductCache] = useState<Record<string, ProductRow[] | "loading" | "error">>({});

  async function toggleRubro(rubro: string) {
    if (expandedRubro === rubro) {
      setExpandedRubro(null);
      return;
    }
    setExpandedRubro(rubro);
    if (productCache[rubro] && productCache[rubro] !== "error") return; // already loaded or loading
    setProductCache((c) => ({ ...c, [rubro]: "loading" }));
    try {
      const params = new URLSearchParams({ desde, hasta, rubro });
      if (sucursal) params.set("sucursal", sucursal);
      const res = await fetch(`/api/admin/resumen-rubros?${params}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setProductCache((c) => ({ ...c, [rubro]: data.products || [] }));
    } catch {
      setProductCache((c) => ({ ...c, [rubro]: "error" }));
    }
  }

  // Clear cache + collapse expansion when the filter changes
  useEffect(() => {
    setExpandedRubro(null);
    setProductCache({});
  }, [desde, hasta, sucursal]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ desde, hasta });
      if (sucursal) params.set("sucursal", sucursal);
      const res = await fetch(`/api/admin/resumen-rubros?${params}`);
      const data = await res.json();
      if (!data.error) {
        setRows(data.rows || []);
        setTotales(data.totales || null);
      }
    } catch {}
    setLoading(false);
  }, [desde, hasta, sucursal]);

  useEffect(() => { load(); }, [load]);

  return (
    <PageTransition className="max-w-6xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Resumen de Ventas x Rubro</h1>
        <p className="text-sm text-gray-500 mb-4">Suma real de costo y ganancia, sin el tope de PunTouch.</p>
      </Stagger>

      <Stagger delay={50}>
        <div className="flex flex-wrap items-center gap-3 mb-4 bg-white border rounded-xl p-3 shadow-sm">
          <div>
            <label className="block text-xs text-gray-500">Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
              className="px-2 py-1.5 border border-brand-400 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
              className="px-2 py-1.5 border border-brand-400 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500">Sucursal</label>
            <select value={sucursal} onChange={(e) => setSucursal(e.target.value)}
              className="px-2 py-1.5 border border-brand-400 rounded-lg text-sm">
              <option value="">Todas</option>
              {Object.entries(SUC_NAMES).map(([cod, name]) => (
                <option key={cod} value={cod}>{name}</option>
              ))}
            </select>
          </div>
        </div>
      </Stagger>

      {loading ? (
        <LoadingCenter text="Cargando..." />
      ) : (
        <>
          {/* Totals on top */}
          {totales && rows.length > 0 && (
            <Stagger delay={80}>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-blue-500">Total Ventas</div>
                  <div className="text-lg font-bold text-blue-700">{formatPrice(totales.totalVentas)}</div>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-gray-500">Total IVA</div>
                  <div className="text-lg font-bold text-gray-700">{formatPrice(totales.totalIva)}</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-red-500">Total Costo</div>
                  <div className="text-lg font-bold text-red-700">{formatPrice(totales.totalCosto)}</div>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <div className="text-xs text-green-500">Ganancia</div>
                  <div className="text-lg font-bold text-green-700">{formatPrice(totales.ganancia)}</div>
                </div>
              </div>
            </Stagger>
          )}

          {/* Capeado legend */}
          {rows.some((r) => r.capeados > 0) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-4 text-xs text-amber-800">
              <strong>⚠️ &quot;Capeado&quot;</strong>: PunTouch corta el costo a $999.999 cuando es más alto, y mostraba ganancia falsa. En este reporte el costo se recupera del producto (costo actual × cantidad) y se muestra el valor real.
            </div>
          )}

          <Stagger delay={100}>
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden mb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left text-xs text-gray-500">
                      <th className="px-3 py-2">Rubro</th>
                      <th className="px-3 py-2 text-right">Trans.</th>
                      <th className="px-3 py-2 text-right">Cantidad</th>
                      <th className="px-3 py-2 text-right">Total Ventas</th>
                      <th className="px-3 py-2 text-right">Total IVA</th>
                      <th className="px-3 py-2 text-right">Total Costo</th>
                      <th className="px-3 py-2 text-right">Ganancia</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map((r, i) => {
                      const isOpen = expandedRubro === r.rubro;
                      const detail = productCache[r.rubro];
                      return (
                        <Fragment key={r.rubro}>
                          <tr
                            onClick={() => toggleRubro(r.rubro)}
                            className={`${hoverRow} cursor-pointer ${isOpen ? "bg-brand-50" : ""}`}
                            style={staggerStyle(true, i, 0, 8)}
                          >
                            <td className="px-3 py-2 text-xs font-medium text-gray-900">
                              <span className="inline-flex items-center gap-1">
                                <HiChevronRight className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                                {r.rubro}
                              </span>
                              {r.capeados > 0 && (
                                <span title="Costo capeado por PunTouch a 999.999" className="ml-2 text-xs text-amber-600">⚠️ {r.capeados} capeado{r.capeados > 1 ? "s" : ""}</span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-right text-gray-600">{r.cantTransacciones}</td>
                            <td className="px-3 py-2 text-xs text-right text-gray-600">{r.cantTotal.toLocaleString("es-AR", { maximumFractionDigits: 3 })}</td>
                            <td className="px-3 py-2 text-xs text-right font-medium">{formatPrice(r.totalVentas)}</td>
                            <td className="px-3 py-2 text-xs text-right text-gray-500">{formatPrice(r.totalIva)}</td>
                            <td className="px-3 py-2 text-xs text-right text-red-600">{formatPrice(r.totalCosto)}</td>
                            <td className="px-3 py-2 text-xs text-right text-green-700 font-medium">{formatPrice(r.ganancia)}</td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-gray-50">
                              <td colSpan={7} className="px-3 py-2">
                                {detail === "loading" || detail === undefined ? (
                                  <p className="text-xs text-gray-400 italic">Cargando productos…</p>
                                ) : detail === "error" ? (
                                  <p className="text-xs text-red-600">No se pudo cargar el detalle. Probá refrescar.</p>
                                ) : detail.length === 0 ? (
                                  <p className="text-xs text-gray-400 italic">Sin productos para mostrar.</p>
                                ) : (
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-xs">
                                      <thead>
                                        <tr className="text-left text-[10px] text-gray-500 uppercase border-b">
                                          <th className="px-2 py-1.5">Producto</th>
                                          <th className="px-2 py-1.5 text-right">Trans.</th>
                                          <th className="px-2 py-1.5 text-right">Cantidad</th>
                                          <th className="px-2 py-1.5 text-right">Total Ventas</th>
                                          <th className="px-2 py-1.5 text-right">Total IVA</th>
                                          <th className="px-2 py-1.5 text-right">Total Costo</th>
                                          <th className="px-2 py-1.5 text-right">Ganancia</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-gray-200">
                                        {detail.map((p) => (
                                          <tr key={p.sku} className="hover:bg-white">
                                            <td className="px-2 py-1.5">
                                              <span className="text-gray-400 font-mono mr-1">{p.sku}</span>
                                              {p.nombre}
                                              {p.capeados > 0 && (
                                                <span className="ml-2 text-amber-600">⚠️ {p.capeados}</span>
                                              )}
                                            </td>
                                            <td className="px-2 py-1.5 text-right text-gray-600">{p.cantTransacciones}</td>
                                            <td className="px-2 py-1.5 text-right text-gray-600">{p.cantTotal.toLocaleString("es-AR", { maximumFractionDigits: 3 })}</td>
                                            <td className="px-2 py-1.5 text-right font-medium">{formatPrice(p.totalVentas)}</td>
                                            <td className="px-2 py-1.5 text-right text-gray-500">{formatPrice(p.totalIva)}</td>
                                            <td className="px-2 py-1.5 text-right text-red-600">{formatPrice(p.totalCosto)}</td>
                                            <td className="px-2 py-1.5 text-right text-green-700 font-medium">{formatPrice(p.ganancia)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-sm">Sin ventas en el rango seleccionado</td></tr>
                    )}
                  </tbody>
                  {totales && rows.length > 0 && (
                    <tfoot>
                      <tr className="bg-brand-500 text-white font-bold text-xs">
                        <td className="px-3 py-2">TOTAL</td>
                        <td className="px-3 py-2 text-right">{totales.cantTransacciones}</td>
                        <td className="px-3 py-2"></td>
                        <td className="px-3 py-2 text-right">{formatPrice(totales.totalVentas)}</td>
                        <td className="px-3 py-2 text-right">{formatPrice(totales.totalIva)}</td>
                        <td className="px-3 py-2 text-right">{formatPrice(totales.totalCosto)}</td>
                        <td className="px-3 py-2 text-right">{formatPrice(totales.ganancia)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </div>
          </Stagger>
        </>
      )}
    </PageTransition>
  );
}
