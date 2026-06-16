"use client";

import { useState, useRef, useEffect } from "react";
import { PageTransition, Stagger } from "@/components/AnimateIn";
import { HiOutlineSearch } from "react-icons/hi";

interface DepRow {
  deposito: string;
  depositoName: string;
  stk: number;
  stkMin: number;
  stkMax: number;
  costo: number;
  deBaja: boolean;
}

interface Producto {
  sku: string;
  nombre: string;
  barcode: string;
  unidad: string;
}

interface AuditRow {
  id: number;
  deposito: string;
  depositoName: string;
  stkAnterior: number;
  stkNuevo: number;
  motivo: string;
  usuario: string;
  origen: string;
  createdAt: string;
}

interface DepInfo {
  cod: string;
  name: string;
}

interface ProductSearchResult {
  sku: string;
  name: string;
  barcode: string;
}

export default function StockSucursalesPage() {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [hlIdx, setHlIdx] = useState(-1);
  const [producto, setProducto] = useState<Producto | null>(null);
  const [rows, setRows] = useState<DepRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [depsKnown, setDepsKnown] = useState<DepInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Inline edit state per deposito
  const [editingDep, setEditingDep] = useState<string | null>(null);
  const [editStk, setEditStk] = useState("");
  const [editMotivo, setEditMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [deshabilitandoDep, setDeshabilitandoDep] = useState<string | null>(null);
  const [deshMotivo, setDeshMotivo] = useState("");


  const searchTimeout = useRef<NodeJS.Timeout | null>(null);
  const skipNextSearch = useRef(false);

  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    if (!query.trim()) {
      setResults([]);
      return;
    }
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(query.trim())}`);
        const data = await r.json();
        setResults(data.products || []);
        setHlIdx(-1);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [query]);

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHlIdx((i) => Math.min(i + 1, Math.min(results.length, 30) - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHlIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && hlIdx >= 0) {
      e.preventDefault();
      const pick = results[hlIdx];
      if (pick) loadSku(pick.sku);
    } else if (e.key === "Escape") {
      setResults([]);
      setHlIdx(-1);
    }
  }

  async function loadSku(sku: string) {
    setLoading(true);
    setError("");
    setResults([]);
    try {
      const r = await fetch(`/api/admin/stock-sucursales?sku=${encodeURIComponent(sku)}`);
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error");
      setProducto(data.producto);
      setRows(data.rows || []);
      setAudit(data.audit || []);
      setDepsKnown(data.depositosKnown || []);
      skipNextSearch.current = true;
      setQuery(data.producto.nombre);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      setProducto(null);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  async function confirmDeshabilitar(deposito: string) {
    if (!producto) return;
    if (!deshMotivo.trim()) { setError("Pone un motivo"); return; }
    setError("");
    setSaving(true);
    try {
      const r = await fetch("/api/admin/stock-sucursales", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: producto.sku, deposito, motivo: deshMotivo.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Error");
      }
      setDeshabilitandoDep(null);
      setDeshMotivo("");
      await loadSku(producto.sku);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  async function saveStk(deposito: string) {
    if (!producto) return;
    const n = parseFloat(editStk.replace(",", "."));
    if (!isFinite(n)) { setError("Stock invalido"); return; }
    if (!editMotivo.trim()) { setError("Pone un motivo"); return; }
    setError("");
    setSaving(true);
    try {
      const r = await fetch("/api/admin/stock-sucursales", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: producto.sku, deposito, stk: n, motivo: editMotivo.trim() }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Error");
      }
      setEditingDep(null);
      setEditStk("");
      setEditMotivo("");
      await loadSku(producto.sku);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Stock por sucursal</h1>
        <p className="text-sm text-gray-500 mb-4">
          Vé cuanto stock tiene un producto en cada deposito (sucursal) y editá manualmente. Cada cambio queda registrado con motivo y usuario.
        </p>
      </Stagger>

      {/* Search */}
      <Stagger delay={50} zIndex={30}>
        <div className="relative mb-4">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKey}
            placeholder="Buscar por nombre, sku o codigo de barras..."
            className="w-full pl-10 pr-4 py-2.5 border border-brand-400 rounded-xl text-base focus:outline-none focus:border-brand-600"
          />
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
              {results.slice(0, 30).map((p, idx) => (
                <button
                  key={p.sku}
                  type="button"
                  onMouseEnter={() => setHlIdx(idx)}
                  onClick={() => loadSku(p.sku)}
                  className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${idx === hlIdx ? "bg-brand-100" : "hover:bg-brand-50"}`}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-gray-400 font-mono ml-2">#{p.sku}</span>
                </button>
              ))}
            </div>
          )}
          {searching && <p className="text-xs text-gray-400 mt-1">Buscando…</p>}
        </div>
      </Stagger>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {/* Selected product + per-deposit rows */}
      {producto && (
        <Stagger delay={75}>
          <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
            <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
              <div>
                <h2 className="text-lg font-bold text-gray-900">{producto.nombre}</h2>
                <p className="text-xs text-gray-500 font-mono">SKU {producto.sku} · {producto.barcode || "sin codigo de barras"}</p>
              </div>
              <span className="text-xs text-gray-500">Unidad: {producto.unidad || "—"}</span>
            </div>

            {loading ? (
              <p className="text-sm text-gray-400">Cargando…</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 bg-gray-50">
                  <tr>
                    <th className="text-left px-2 sm:px-3 py-2">Deposito</th>
                    <th className="text-right px-2 sm:px-3 py-2">Stk</th>
                    <th className="text-right px-3 py-2 hidden sm:table-cell">Min</th>
                    <th className="text-right px-3 py-2 hidden sm:table-cell">Max</th>
                    <th className="px-2 sm:px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-3 text-center text-gray-400 italic">Este producto no esta habilitado en ningun deposito.</td></tr>
                  )}
                  {rows.map((r) => {
                    const isEditing = editingDep === r.deposito;
                    const isDeshabilitando = deshabilitandoDep === r.deposito;
                    const rowClass = r.deBaja ? "bg-gray-100 text-gray-400" : (r.stk < 0 ? "bg-red-50" : "");
                    if (isEditing || isDeshabilitando) {
                      // When editing, expand the row to take full table width so the form has room on mobile
                      return (
                        <tr key={r.deposito} className={`border-t ${rowClass}`}>
                          <td colSpan={5} className="px-2 sm:px-3 py-3">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs text-gray-400 font-mono">[{r.deposito}]</span>
                                <span className="font-medium">{r.depositoName}</span>
                                <span className="text-xs text-gray-500">— Stk actual: <span className={r.stk < 0 ? "text-red-700 font-bold" : "font-bold"}>{r.stk}</span></span>
                              </div>
                              {isEditing ? (
                                <>
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <label className="text-xs text-gray-500">Nuevo Stk:</label>
                                    <input
                                      type="text"
                                      value={editStk}
                                      onChange={(e) => setEditStk(e.target.value.replace(/[^0-9.,-]/g, ""))}
                                      placeholder={String(r.stk)}
                                      className="w-24 px-2 py-1 border border-brand-300 rounded text-right"
                                    />
                                  </div>
                                  <input
                                    type="text"
                                    value={editMotivo}
                                    onChange={(e) => setEditMotivo(e.target.value)}
                                    placeholder="Motivo (ej: conteo fisico)"
                                    className="w-full px-2 py-1 border border-brand-300 rounded text-xs"
                                  />
                                  <div className="flex gap-2">
                                    <button onClick={() => saveStk(r.deposito)} disabled={saving} className="px-3 py-1.5 rounded bg-brand-500 text-white text-xs hover:bg-brand-600 disabled:opacity-50">
                                      {saving ? "..." : "Guardar"}
                                    </button>
                                    <button onClick={() => { setEditingDep(null); setEditStk(""); setEditMotivo(""); setError(""); }} disabled={saving} className="px-3 py-1.5 rounded border text-gray-600 text-xs hover:bg-gray-100">
                                      Cancelar
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <input
                                    type="text"
                                    value={deshMotivo}
                                    onChange={(e) => setDeshMotivo(e.target.value)}
                                    placeholder="Motivo para deshabilitar (ej: no se vende mas)"
                                    className="w-full px-2 py-1 border border-red-300 rounded text-xs"
                                  />
                                  <div className="flex gap-2">
                                    <button onClick={() => confirmDeshabilitar(r.deposito)} disabled={saving} className="px-3 py-1.5 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50">
                                      {saving ? "..." : "Confirmar deshabilitar"}
                                    </button>
                                    <button onClick={() => { setDeshabilitandoDep(null); setDeshMotivo(""); setError(""); }} disabled={saving} className="px-3 py-1.5 rounded border text-gray-600 text-xs hover:bg-gray-100">
                                      Cancelar
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={r.deposito} className={`border-t ${rowClass}`}>
                        <td className="px-2 sm:px-3 py-2">
                          <span className="text-xs text-gray-400 font-mono mr-1">[{r.deposito}]</span>
                          {r.depositoName}
                          {r.deBaja && <span className="ml-2 text-xs italic">(deshabilitado)</span>}
                        </td>
                        <td className="px-2 sm:px-3 py-2 text-right">
                          <span className={`font-semibold ${r.deBaja ? "line-through text-gray-400" : (r.stk < 0 ? "text-red-700" : "text-gray-900")}`}>{r.stk}</span>
                        </td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500 hidden sm:table-cell">{r.stkMin || "—"}</td>
                        <td className="px-3 py-2 text-right text-xs text-gray-500 hidden sm:table-cell">{r.stkMax || "—"}</td>
                        <td className="px-2 sm:px-3 py-2 text-right">
                          <div className="flex flex-col sm:flex-row gap-1 sm:gap-3 sm:justify-end items-end">
                            <button onClick={() => { setEditingDep(r.deposito); setEditStk(String(r.stk)); setEditMotivo(r.deBaja ? "Re-habilitar" : ""); setError(""); }} className="text-xs text-brand-600 hover:underline">
                              {r.deBaja ? "Re-habilitar" : "Editar"}
                            </button>
                            {!r.deBaja && (
                              <button onClick={() => { setDeshabilitandoDep(r.deposito); setDeshMotivo(""); setError(""); }} className="text-xs text-red-600 hover:underline">
                                Deshabilitar
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {/* Allow habilitar in a not-yet-present deposit */}
                  {depsKnown.filter((d) => !rows.some((r) => r.deposito === d.cod)).map((d) => {
                    const isHabilitando = editingDep === d.cod;
                    if (isHabilitando) {
                      return (
                        <tr key={d.cod} className="border-t bg-amber-50/30">
                          <td colSpan={5} className="px-2 sm:px-3 py-3">
                            <div className="flex flex-col gap-2">
                              <div className="flex items-center gap-2 flex-wrap text-gray-600 italic">
                                <span className="text-xs text-gray-400 font-mono">[{d.cod}]</span>
                                <span className="font-medium">{d.name}</span>
                                <span className="text-xs">— habilitar con:</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                <label className="text-xs text-gray-500">Stk inicial:</label>
                                <input
                                  type="text"
                                  value={editStk}
                                  onChange={(e) => setEditStk(e.target.value.replace(/[^0-9.,-]/g, ""))}
                                  placeholder="0"
                                  className="w-24 px-2 py-1 border border-brand-300 rounded text-right"
                                />
                              </div>
                              <input
                                type="text"
                                value={editMotivo}
                                onChange={(e) => setEditMotivo(e.target.value)}
                                placeholder="Motivo (ej: habilitar para venta)"
                                className="w-full px-2 py-1 border border-brand-300 rounded text-xs"
                              />
                              <div className="flex gap-2">
                                <button onClick={() => saveStk(d.cod)} disabled={saving} className="px-3 py-1.5 rounded bg-amber-600 text-white text-xs hover:bg-amber-700 disabled:opacity-50">
                                  {saving ? "..." : "Habilitar"}
                                </button>
                                <button onClick={() => { setEditingDep(null); setEditStk(""); setEditMotivo(""); setError(""); }} disabled={saving} className="px-3 py-1.5 rounded border text-gray-600 text-xs hover:bg-gray-100">
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    }
                    return (
                      <tr key={d.cod} className="border-t bg-amber-50/30">
                        <td className="px-2 sm:px-3 py-2 text-gray-500 italic">
                          <span className="text-xs text-gray-400 font-mono mr-1">[{d.cod}]</span>
                          {d.name} <span className="text-xs">(no habilitado)</span>
                        </td>
                        <td className="px-2 sm:px-3 py-2 text-right text-xs text-gray-400">—</td>
                        <td className="px-3 py-2 hidden sm:table-cell"></td>
                        <td className="px-3 py-2 hidden sm:table-cell"></td>
                        <td className="px-2 sm:px-3 py-2 text-right">
                          <button
                            onClick={() => { setEditingDep(d.cod); setEditStk("0"); setEditMotivo("Habilitar"); setError(""); }}
                            className="text-xs text-amber-700 hover:underline"
                          >
                            Habilitar
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </Stagger>
      )}

      {/* Audit log */}
      {producto && audit.length > 0 && (
        <Stagger delay={100}>
          <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Historial de ajustes</h3>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <table className="w-full text-xs min-w-[480px]">
                <thead className="text-gray-500 bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1">Fecha</th>
                    <th className="text-left px-2 py-1">Deposito</th>
                    <th className="text-right px-2 py-1">Antes → Despues</th>
                    <th className="text-left px-2 py-1 hidden sm:table-cell">Motivo</th>
                    <th className="text-left px-2 py-1 hidden sm:table-cell">Por</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="px-2 py-1 whitespace-nowrap">{new Date(a.createdAt).toLocaleString("es-AR")}</td>
                      <td className="px-2 py-1">{a.depositoName}</td>
                      <td className="px-2 py-1 text-right font-mono">{a.stkAnterior} → {a.stkNuevo}</td>
                      <td className="px-2 py-1 hidden sm:table-cell">{a.motivo}</td>
                      <td className="px-2 py-1 text-gray-500 hidden sm:table-cell">{a.usuario}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Stagger>
      )}

      {/* Bulk-habilitar was used during the initial migration to seed Pontevedra,
          Minorista and Cervantes. It's a destructive operation (resets Stk=0 on all
          target-deposit rows that match source), so it's hidden from the UI now.
          The endpoint stays available if needed for new sucursales — call directly. */}
    </PageTransition>
  );
}
