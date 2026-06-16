"use client";

import { Fragment, useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { PageTransition, Stagger, springBtn } from "@/components/AnimateIn";
import { HiOutlineSearch, HiOutlineTrash, HiOutlineDocumentText } from "react-icons/hi";

interface DepInfo { cod: string; name: string }
interface SearchResult { sku: string; name: string; barcode: string; currentStock?: number }
interface ItemRow { sku: string; productName: string; cantidad: string; stkOrigen: number }

interface ListTransferItem { sku: string; productName: string; cantidad: number }
interface ListTransfer {
  id: number;
  depositoOrigen: string;
  depositoDestino: string;
  usuario: string;
  notas: string | null;
  estado: string;
  pdfUrl: string | null;
  createdAt: string;
  anuladoAt: string | null;
  anuladoPor: string | null;
  motivoAnulado: string | null;
  itemCount: number;
  totalCantidad: number;
  items: ListTransferItem[];
}

const DEFAULT_DEPS: DepInfo[] = [
  { cod: "0", name: "Distribuidora / Mayorista" },
  { cod: "1", name: "Pontevedra" },
  { cod: "2", name: "Minorista" },
  { cod: "3", name: "Cervantes" },
];

function depLabel(cod: string, deps: DepInfo[]) {
  const d = deps.find((x) => x.cod === cod);
  return d ? `[${cod}] ${d.name}` : `[${cod}]`;
}

export default function TrasladosPage() {
  const { data: session } = useSession();
  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const isAdmin = user?.role === "admin";

  const [deps] = useState<DepInfo[]>(DEFAULT_DEPS);
  const [origen, setOrigen] = useState("0");
  const [destino, setDestino] = useState("1");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<ItemRow[]>([]);

  // Search state
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hlIdx, setHlIdx] = useState(-1);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [okMsg, setOkMsg] = useState("");

  const [transfers, setTransfers] = useState<ListTransfer[]>([]);
  const [anularId, setAnularId] = useState<number | null>(null);
  const [anularMotivo, setAnularMotivo] = useState("");
  const [anulando, setAnulando] = useState(false);
  const [anularError, setAnularError] = useState("");

  async function confirmAnular(id: number) {
    setAnulando(true);
    setAnularError("");
    try {
      const r = await fetch(`/api/admin/traslados/${id}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivoAnulado: anularMotivo }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "No se pudo anular");
      }
      setAnularId(null);
      setAnularMotivo("");
      await loadTransfers();
    } catch (e) {
      setAnularError((e as Error).message);
    } finally {
      setAnulando(false);
    }
  }

  useEffect(() => { loadTransfers(); }, []);
  useEffect(() => {
    if (!query.trim() || query.trim().length < 2) { setResults([]); return; }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(query.trim())}`);
        const d = await r.json();
        setResults(d.products || []);
        setHlIdx(-1);
      } catch { setResults([]); } finally { setSearching(false); }
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
      if (pick) addItem(pick);
    } else if (e.key === "Escape") {
      setResults([]);
      setHlIdx(-1);
    }
  }

  async function loadTransfers() {
    try {
      const r = await fetch("/api/admin/traslados?limit=30");
      const d = await r.json();
      setTransfers(d.transfers || []);
    } catch { /* ignore */ }
  }

  async function addItem(p: SearchResult) {
    if (items.find((i) => i.sku === p.sku)) {
      setQuery(""); setResults([]); return;
    }
    // Admins see current stk in origen (warning when it'd go negative). Non-admin
    // operators (the "blind" traslados-stock perm) never see stk-origen.
    let stkOrigen = 0;
    if (isAdmin) {
      try {
        const r = await fetch(`/api/admin/stock-sucursales?sku=${encodeURIComponent(p.sku)}`);
        if (r.ok) {
          const d = await r.json();
          const row = (d.rows as { deposito: string; stk: number }[]).find((x) => x.deposito === origen);
          stkOrigen = row ? Number(row.stk) : 0;
        }
      } catch { /* ignore */ }
    }
    setItems([...items, { sku: p.sku, productName: p.name, cantidad: "", stkOrigen }]);
    setQuery(""); setResults([]);
  }

  function removeItem(sku: string) {
    setItems(items.filter((i) => i.sku !== sku));
  }

  function updateCant(sku: string, v: string) {
    setItems(items.map((i) => i.sku === sku ? { ...i, cantidad: v.replace(/[^0-9.,]/g, "") } : i));
  }

  async function save() {
    setError(""); setOkMsg("");
    if (origen === destino) { setError("Origen y destino no pueden ser iguales"); return; }
    const payloadItems = items.map((i) => ({ sku: i.sku, cantidad: parseFloat(i.cantidad.replace(",", ".")) || 0 })).filter((i) => i.cantidad > 0);
    if (payloadItems.length === 0) { setError("Cargá al menos un item con cantidad"); return; }
    setSaving(true);
    try {
      const r = await fetch("/api/admin/traslados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ depositoOrigen: origen, depositoDestino: destino, notas: notas.trim() || null, items: payloadItems }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Error");
      setOkMsg(`Traslado #${d.transferId} creado.`);
      setItems([]); setNotas("");
      await loadTransfers();
      // Open PDF in new tab
      window.open(`/api/admin/traslados/${d.transferId}/pdf`, "_blank");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Traslados entre sucursales</h1>
        <p className="text-sm text-gray-500 mb-4">
          Mové mercaderia de un depósito a otro. Genera un remito PDF para firmar y descuenta del origen + suma al destino automaticamente.
        </p>
      </Stagger>

      <Stagger delay={50} zIndex={30}>
        <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
          <div className="flex flex-wrap gap-3 mb-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Origen</label>
              <select value={origen} onChange={(e) => setOrigen(e.target.value)} className="px-3 py-2 border border-brand-400 rounded-xl text-base">
                {deps.map((d) => <option key={d.cod} value={d.cod}>{depLabel(d.cod, deps)}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Destino</label>
              <select value={destino} onChange={(e) => setDestino(e.target.value)} className="px-3 py-2 border border-brand-400 rounded-xl text-base">
                {deps.map((d) => <option key={d.cod} value={d.cod}>{depLabel(d.cod, deps)}</option>)}
              </select>
            </div>
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
              <input value={notas} onChange={(e) => setNotas(e.target.value)} maxLength={300} placeholder="ej: reposicion semanal" className="w-full px-3 py-2 border border-gray-300 rounded-xl" />
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-3">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-500" />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={handleSearchKey} placeholder="Agregar producto (nombre, sku, codigo de barras)..." className="w-full pl-10 pr-4 py-2.5 border border-brand-400 rounded-xl text-base focus:outline-none focus:border-brand-600" />
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg max-h-72 overflow-y-auto">
                {results.slice(0, 30).map((p, idx) => (
                  <button key={p.sku} type="button" onMouseEnter={() => setHlIdx(idx)} onClick={() => addItem(p)} className={`w-full text-left px-4 py-2 text-sm flex items-center justify-between ${idx === hlIdx ? "bg-brand-100" : "hover:bg-brand-50"}`}>
                    <span>{p.name}</span>
                    <span className="text-xs text-gray-400 font-mono ml-2">#{p.sku}</span>
                  </button>
                ))}
              </div>
            )}
            {searching && <p className="text-xs text-gray-400 mt-1">Buscando…</p>}
          </div>

          {/* Items table */}
          {items.length > 0 ? (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-2">
              <table className="w-full text-sm">
                <thead className="text-xs text-gray-500 bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1 hidden sm:table-cell">SKU</th>
                    <th className="text-left px-2 py-1">Producto</th>
                    {isAdmin && <th className="text-right px-2 py-1 hidden sm:table-cell">Stk origen</th>}
                    <th className="text-right px-2 py-1">A trasladar</th>
                    <th className="px-2 py-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const cant = parseFloat(it.cantidad.replace(",", ".")) || 0;
                    const wouldLeave = it.stkOrigen - cant;
                    return (
                      <tr key={it.sku} className="border-t">
                        <td className="px-2 py-1 font-mono text-xs hidden sm:table-cell">{it.sku}</td>
                        <td className="px-2 py-1">
                          <span className="block sm:hidden text-[10px] font-mono text-gray-400">#{it.sku}</span>
                          {it.productName}
                        </td>
                        {isAdmin && (
                          <td className={`px-2 py-1 text-right hidden sm:table-cell ${it.stkOrigen <= 0 ? "text-red-600" : "text-gray-700"}`}>{it.stkOrigen}</td>
                        )}
                        <td className="px-2 py-1 text-right">
                          <input value={it.cantidad} onChange={(e) => updateCant(it.sku, e.target.value)} placeholder="0" inputMode="decimal" className={`w-20 sm:w-24 px-2 py-1 border rounded text-right ${isAdmin && cant > 0 && wouldLeave < 0 ? "border-red-400 bg-red-50" : "border-gray-300"}`} />
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button onClick={() => removeItem(it.sku)} className="text-red-500 hover:text-red-700"><HiOutlineTrash className="w-4 h-4 inline" /></button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 italic py-3">Buscá productos arriba y agregalos al traslado.</p>
          )}

          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          {okMsg && <p className="text-sm text-green-700 mb-2">{okMsg}</p>}

          <div className="flex justify-end">
            <button onClick={save} disabled={saving || items.length === 0} className={`px-4 py-2 bg-brand-600 text-white rounded-xl disabled:opacity-50 hover:bg-brand-700 ${springBtn}`}>
              {saving ? "Guardando…" : "Generar traslado"}
            </button>
          </div>
        </div>
      </Stagger>

      <Stagger delay={75}>
        <div className="bg-white border rounded-xl shadow-sm p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Ultimos traslados</h3>
          {transfers.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No hay traslados todavia.</p>
          ) : (
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <table className="w-full text-xs min-w-[560px]">
              <thead className="text-gray-500 bg-gray-50">
                <tr>
                  <th className="text-left px-2 py-1">#</th>
                  <th className="text-left px-2 py-1">Fecha</th>
                  <th className="text-left px-2 py-1">Movimiento</th>
                  <th className="text-right px-2 py-1">Items</th>
                  <th className="text-left px-2 py-1">Estado</th>
                  <th className="text-left px-2 py-1 hidden sm:table-cell">Notas</th>
                  <th className="text-left px-2 py-1 hidden sm:table-cell">Por</th>
                  <th className="px-2 py-1"></th>
                </tr>
              </thead>
              <tbody>
                {transfers.map((t) => {
                  const isAnulado = t.estado === "anulado";
                  const isAnularing = anularId === t.id;
                  return (
                    <Fragment key={t.id}>
                      <tr className={`border-t ${isAnulado ? "bg-gray-50 text-gray-400" : ""}`}>
                        <td className={`px-2 py-1 font-mono ${isAnulado ? "line-through" : ""}`}>{t.id}</td>
                        <td className="px-2 py-1 whitespace-nowrap">{new Date(t.createdAt).toLocaleString("es-AR")}</td>
                        <td className={`px-2 py-1 ${isAnulado ? "line-through" : ""}`}>[{t.depositoOrigen}] → [{t.depositoDestino}]</td>
                        <td className="px-2 py-1 text-right">{t.itemCount}</td>
                        <td className="px-2 py-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isAnulado ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-700"}`}>
                            {isAnulado ? "Anulado" : "Realizado"}
                          </span>
                        </td>
                        <td className="px-2 py-1 text-gray-600 hidden sm:table-cell">{t.notas || "—"}</td>
                        <td className="px-2 py-1 text-gray-500 hidden sm:table-cell">{t.usuario}</td>
                        <td className="px-2 py-1 text-right whitespace-nowrap">
                          <a href={`/api/admin/traslados/${t.id}/pdf`} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline inline-flex items-center gap-1 mr-2">
                            <HiOutlineDocumentText className="w-4 h-4" /> PDF
                          </a>
                          {isAdmin && !isAnulado && !isAnularing && (
                            <button onClick={() => { setAnularId(t.id); setAnularMotivo(""); setAnularError(""); }} className="text-xs text-red-600 hover:underline">
                              Anular
                            </button>
                          )}
                        </td>
                      </tr>
                      {isAnularing && (
                        <tr className="border-t bg-red-50/50">
                          <td colSpan={8} className="px-3 py-2">
                            <div className="flex flex-col gap-2">
                              <p className="text-xs text-red-700">Anular el traslado #{t.id} devuelve {t.itemCount} item{t.itemCount === 1 ? "" : "s"} de [{t.depositoDestino}] a [{t.depositoOrigen}].</p>
                              <input
                                type="text"
                                value={anularMotivo}
                                onChange={(e) => setAnularMotivo(e.target.value)}
                                placeholder="Motivo (opcional)"
                                maxLength={200}
                                className="w-full px-2 py-1 border border-red-300 rounded text-xs"
                              />
                              <div className="flex gap-2 justify-end">
                                <button onClick={() => { setAnularId(null); setAnularMotivo(""); }} disabled={anulando} className="px-3 py-1.5 rounded border text-gray-600 text-xs hover:bg-gray-100">
                                  Cancelar
                                </button>
                                <button onClick={() => confirmAnular(t.id)} disabled={anulando} className="px-3 py-1.5 rounded bg-red-600 text-white text-xs hover:bg-red-700 disabled:opacity-50">
                                  {anulando ? "Anulando…" : "Confirmar anulacion"}
                                </button>
                              </div>
                              {anularError && <p className="text-xs text-red-700">{anularError}</p>}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </Stagger>
    </PageTransition>
  );
}
