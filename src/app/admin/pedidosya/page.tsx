"use client";

import { useState, useRef, useEffect } from "react";
import { HiOutlineDocumentDownload } from "react-icons/hi";
import { PageTransition, Stagger, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface PriceChange {
  peyaSku: string;
  peyaName: string;
  barcode: string;
  puntouchSku: string;
  currentPrice: number;
  newPrice: number;
}

interface StockChange {
  peyaSku: string;
  peyaName: string;
  currentActive: boolean;
  shouldBeActive: boolean;
  stock: number;
  maxQty: number;
}

interface UnmatchedItem {
  peyaSku: string;
  peyaName: string;
  barcode: string;
  active: boolean;
}

interface MissingProduct {
  sku: string;
  nombre: string;
  codbar: string;
  precio5: number;
  stock: number;
  unidad: string;
}

interface CompareResult {
  peyaTotal: number;
  puntouchTotal: number;
  matched: number;
  unmatched: number;
  changes: PriceChange[];
  stockChanges: StockChange[];
  unmatchedList: UnmatchedItem[];
  missingFromPeya: MissingProduct[];
  allMatched: Array<{ peyaSku: string; maxQty: number; active: boolean }>;
}

function StockMinSetting() {
  const [value, setValue] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/pedidosya", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "getSetting", key: "peya_stock_min" }),
    }).then(r => r.json()).then(d => { setValue(d.value || "0"); setLoaded(true); }).catch(() => setLoaded(true));
  }, []);

  async function save() {
    setSaving(true);
    await fetch("/api/admin/pedidosya", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setSetting", key: "peya_stock_min", value }),
    });
    setSaving(false);
  }

  if (!loaded) return null;

  return (
    <div className="mt-4 mb-2 flex items-center gap-2 text-sm">
      <span className="text-gray-500">Stock mínimo para PedidosYa:</span>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-16 px-2 py-1 border border-gray-300 rounded text-center text-sm focus:outline-none focus:border-brand-500"
      />
      <button
        onClick={save}
        disabled={saving}
        className="text-xs text-brand-600 font-medium px-2 py-1 hover:bg-brand-50 rounded disabled:opacity-50"
      >
        {saving ? "..." : "Guardar"}
      </button>
      <span className="text-xs text-gray-400">Productos con stock &le; este valor se marcan inactivos</span>
    </div>
  );
}

function ImageLookup() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ sku: string; name: string; image: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [copied, setCopied] = useState("");
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  function handleSearch(q: string) {
    setQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (q.trim().length < 2) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(q)}&limit=10`);
        const data = await res.json();
        setResults((data.products || []).map((p: { sku: string; name: string; images: Array<{ url: string }> }) => ({
          sku: p.sku,
          name: p.name,
          image: p.images?.[0]?.url || null,
        })));
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    setCopied(url);
    setTimeout(() => setCopied(""), 2000);
  }

  if (!query && results.length === 0) {
    return (
      <div className="mb-6">
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar imagen de producto (nombre, SKU o código de barras)..."
          className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        />
      </div>
    );
  }

  return (
    <div className="mb-6">
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder="Buscar imagen de producto..."
        className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-2"
      />
      {searching && <p className="text-xs text-gray-400">Buscando...</p>}
      {results.length > 0 && (
        <div className="bg-white border rounded-lg divide-y">
          {results.map((p) => (
            <div key={p.sku} className="px-3 py-2 flex items-center gap-3">
              {p.image && (
                <img src={p.image} alt="" className="w-10 h-10 object-contain rounded" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{p.name}</p>
                <p className="text-xs text-gray-400">SKU: {p.sku}</p>
              </div>
              {p.image ? (
                <button
                  onClick={() => copyUrl(p.image!)}
                  className={`text-xs px-2 py-1 rounded font-medium shrink-0 ${
                    copied === p.image ? "bg-green-100 text-green-700" : "bg-brand-50 text-brand-600 hover:bg-brand-100"
                  }`}
                >
                  {copied === p.image ? "Copiado!" : "Copiar URL"}
                </button>
              ) : (
                <span className="text-xs text-gray-300 shrink-0">Sin imagen</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MappingRow({ mapping, onUpdate, onDelete }: {
  mapping: { id: number; peyaSku: string; puntouchSku: string; multiplier: number };
  onUpdate: (peyaSku: string, puntouchSku: string, multiplier: number) => Promise<void>;
  onDelete: (peyaSku: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [ptSku, setPtSku] = useState(mapping.puntouchSku);
  const [mult, setMult] = useState(String(mapping.multiplier));
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function save() {
    setSaving(true);
    await onUpdate(mapping.peyaSku, ptSku.trim(), parseFloat(mult) || 1);
    setSaving(false);
    setEditing(false);
  }

  async function remove() {
    setDeleting(true);
    await onDelete(mapping.peyaSku);
  }

  return (
    <tr className={`border-b ${hoverRow}`}>
      <td className="p-3 font-mono text-sm text-brand-600 font-bold">{mapping.peyaSku}</td>
      <td className="p-3">
        {editing ? (
          <input
            type="text"
            value={ptSku}
            onChange={(e) => setPtSku(e.target.value)}
            className="w-20 px-2 py-1 border border-brand-400 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        ) : (
          <span className="font-mono text-sm">{mapping.puntouchSku}</span>
        )}
      </td>
      <td className="p-3 text-center">
        {editing ? (
          <div className="flex items-center justify-center gap-0.5">
            <span className="text-xs text-gray-500">×</span>
            <input
              type="number"
              value={mult}
              onChange={(e) => setMult(e.target.value)}
              step="0.1"
              min="0.01"
              className="w-14 px-1 py-1 border border-gray-300 rounded text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>
        ) : (
          <span className="font-mono text-sm font-medium">×{mapping.multiplier}</span>
        )}
      </td>
      <td className="p-3 text-center">
        {editing ? (
          <div className="flex items-center justify-center gap-1">
            <button onClick={save} disabled={saving} className="text-xs text-green-600 font-medium px-2 py-1 hover:bg-green-50 rounded">
              {saving ? "..." : "Guardar"}
            </button>
            <button onClick={() => setEditing(false)} className="text-xs text-gray-400 px-1">Cancelar</button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <button onClick={() => setEditing(true)} className="text-xs text-brand-600 font-medium hover:bg-brand-50 px-2 py-1 rounded">
              Editar
            </button>
            <button onClick={remove} disabled={deleting} className="text-xs text-red-500 font-medium hover:bg-red-50 px-2 py-1 rounded">
              {deleting ? "..." : "Eliminar"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function UnmatchedRow({ item }: { item: UnmatchedItem }) {
  const [linking, setLinking] = useState(false);
  const [ptSku, setPtSku] = useState("");
  const [mult, setMult] = useState("1");
  const [saving, setSaving] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [currentActive, setCurrentActive] = useState(item.active);
  const [saved, setSaved] = useState(false);

  async function saveMapping() {
    if (!ptSku.trim()) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/pedidosya", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          peyaSku: item.peyaSku,
          puntouchSku: ptSku.trim(),
          multiplier: parseFloat(mult) || 1,
        }),
      });
      if (res.ok) {
        setSaved(true);
        setLinking(false);
      }
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive() {
    setToggling(true);
    try {
      const res = await fetch("/api/admin/pedidosya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stockUpdates: [{ sku: item.peyaSku, active: !currentActive }],
        }),
      });
      if (res.ok) setCurrentActive(!currentActive);
    } catch {
      // silent
    } finally {
      setToggling(false);
    }
  }

  const displaySku = item.peyaSku.replace(/^0+/, "");

  return (
    <tr className={`border-b ${hoverRow} ${saved ? "bg-green-50" : ""}`}>
      <td className="p-3">
        <button
          onClick={() => { navigator.clipboard.writeText(displaySku); }}
          className="font-mono text-sm font-bold text-brand-600 hover:text-brand-700 cursor-pointer"
          title="Click para copiar"
        >
          {displaySku}
          {saved && <span className="ml-1 text-green-500 text-xs">✓ Asociado</span>}
        </button>
      </td>
      <td className="p-3 font-medium">{item.peyaName}</td>
      <td className="p-3 font-mono text-xs text-gray-400">{item.barcode?.replace(/^0+/, "") || "—"}</td>
      <td className="p-3 text-center">
        <button
          onClick={toggleActive}
          disabled={toggling}
          className={`text-xs px-2 py-1 rounded-full font-medium cursor-pointer transition-colors ${
            currentActive ? "bg-green-100 text-green-700 hover:bg-red-100 hover:text-red-700" : "bg-red-100 text-red-700 hover:bg-green-100 hover:text-green-700"
          } ${toggling ? "opacity-50" : ""}`}
        >
          {toggling ? "..." : currentActive ? "Activo" : "Inactivo"}
        </button>
      </td>
      <td className="p-3">
        {linking ? (
          <div className="flex items-center gap-1 flex-wrap">
            <input
              type="text"
              value={ptSku}
              onChange={(e) => setPtSku(e.target.value)}
              placeholder="SKU PunTouch"
              className="w-20 px-2 py-1 border border-brand-400 rounded text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-500"
              autoFocus
            />
            <div className="flex items-center gap-0.5">
              <span className="text-xs text-gray-500">×</span>
              <input
                type="number"
                value={mult}
                onChange={(e) => setMult(e.target.value)}
                step="0.1"
                min="0.01"
                className="w-14 px-1 py-1 border border-gray-300 rounded text-xs font-mono text-center focus:outline-none focus:ring-1 focus:ring-brand-500"
                placeholder="1"
              />
            </div>
            <button onClick={saveMapping} disabled={saving || !ptSku.trim()} className="text-xs text-green-600 font-medium px-1.5 py-1 hover:bg-green-50 rounded disabled:opacity-50">
              {saving ? "..." : "OK"}
            </button>
            <button onClick={() => setLinking(false)} className="text-xs text-gray-400 px-1">×</button>
          </div>
        ) : saved ? (
          <span className="text-xs text-green-600 font-medium">Asociado</span>
        ) : (
          <button
            onClick={() => setLinking(true)}
            className="text-xs text-brand-600 font-medium hover:bg-brand-50 px-2 py-1 rounded"
          >
            Asociar
          </button>
        )}
      </td>
    </tr>
  );
}

export default function PedidosYaPage() {
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedStock, setSelectedStock] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<"prices" | "stock" | "unmatched" | "mappings" | "missing">("prices");
  const [sortField, setSortField] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function toggleSort(field: string) {
    if (sortField === field) setSortDir((d) => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  }

  function sortIcon(field: string) {
    if (sortField !== field) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  const [bulkSyncing, setBulkSyncing] = useState(false);

  async function bulkSyncStock() {
    if (!result || !result.allMatched) return;
    setBulkSyncing(true);
    setError("");
    try {
      const stockUpdates = result.allMatched.map((m) => ({
        sku: m.peyaSku,
        active: m.active,
        maxQty: m.maxQty,
      }));
      const res = await fetch("/api/admin/pedidosya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stockUpdates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccessMsg(`Stock sincronizado: ${data.updated} productos actualizados`);
      if (data.errors?.length > 0) setError(data.errors.join("; "));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setBulkSyncing(false);
    }
  }

  // Mappings state
  interface Mapping { id: number; peyaSku: string; puntouchSku: string; multiplier: number; createdAt: string }
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingsLoading, setMappingsLoading] = useState(false);

  // Login state
  const [loginStep, setLoginStep] = useState<"idle" | "logging_in" | "need_2fa" | "verifying">("idle");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [tokenExpired, setTokenExpired] = useState(false);

  async function startLogin() {
    setLoginStep("logging_in");
    setError("");
    try {
      const res = await fetch("/api/admin/pedidosya/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "need_2fa") {
        setLoginStep("need_2fa");
      } else if (data.status === "logged_in") {
        setLoginStep("idle");
        setTokenExpired(false);
        setSuccessMsg("Sesión renovada correctamente");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al iniciar sesión");
      setLoginStep("idle");
    }
  }

  async function verifyCode() {
    if (twoFaCode.length !== 6) return;
    setLoginStep("verifying");
    setError("");
    try {
      const res = await fetch("/api/admin/pedidosya/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", code: twoFaCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.status === "logged_in") {
        setLoginStep("idle");
        setTokenExpired(false);
        setTwoFaCode("");
        setSuccessMsg("Sesión renovada correctamente");
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al verificar código");
      setLoginStep("need_2fa");
      setTwoFaCode("");
    }
  }

  async function loadMappings() {
    setMappingsLoading(true);
    try {
      const res = await fetch("/api/admin/pedidosya", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const data = await res.json();
      if (res.ok) setMappings(data.mappings || []);
    } catch { /* silent */ }
    finally { setMappingsLoading(false); }
  }

  async function deleteMapping(peyaSku: string) {
    try {
      await fetch("/api/admin/pedidosya", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete", peyaSku }),
      });
      setMappings((prev) => prev.filter((m) => m.peyaSku !== peyaSku));
    } catch { /* silent */ }
  }

  async function updateMapping(peyaSku: string, puntouchSku: string, multiplier: number) {
    try {
      const res = await fetch("/api/admin/pedidosya", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", peyaSku, puntouchSku, multiplier }),
      });
      if (res.ok) await loadMappings();
    } catch { /* silent */ }
  }

  async function comparePrices() {
    setLoading(true);
    setError("");
    setResult(null);
    setSuccessMsg("");
    setTokenExpired(false);
    try {
      const res = await fetch("/api/admin/pedidosya");
      const data = await res.json();
      if (res.status === 401) {
        setTokenExpired(true);
        setError("Sesión expirada. Renovar para continuar.");
        return;
      }
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setSelected(new Set(data.changes.map((c: PriceChange) => c.peyaSku)));
      setSelectedStock(new Set(data.stockChanges.map((c: StockChange) => c.peyaSku)));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      if (msg.includes("Token") || msg.includes("expirad") || msg.includes("configurado")) {
        setTokenExpired(true);
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  async function applyUpdates() {
    if (!result) return;

    // Only apply from current tab
    const priceUpdates = tab === "prices"
      ? result.changes.filter((c) => selected.has(c.peyaSku)).map((c) => ({ sku: c.peyaSku, price: c.newPrice, puntouchSku: c.puntouchSku }))
      : [];
    const stockUpdates = tab === "stock"
      ? result.stockChanges.filter((c) => selectedStock.has(c.peyaSku)).map((c) => ({ sku: c.peyaSku, active: c.shouldBeActive, maxQty: c.maxQty }))
      : [];

    if (priceUpdates.length === 0 && stockUpdates.length === 0) return;

    setUpdating(true);
    setError("");
    try {
      const res = await fetch("/api/admin/pedidosya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updates: priceUpdates.length > 0 ? priceUpdates : undefined,
          stockUpdates: stockUpdates.length > 0 ? stockUpdates : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccessMsg(`${data.updated} productos actualizados en PedidosYa`);
      if (data.errors?.length > 0) setError(data.errors.join("; "));
      setTimeout(comparePrices, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setUpdating(false);
    }
  }

  function toggleAll(type: "prices" | "stock") {
    if (!result) return;
    if (type === "prices") {
      setSelected((prev) =>
        prev.size === result.changes.length ? new Set() : new Set(result.changes.map((c) => c.peyaSku))
      );
    } else {
      setSelectedStock((prev) =>
        prev.size === result.stockChanges.length ? new Set() : new Set(result.stockChanges.map((c) => c.peyaSku))
      );
    }
  }

  function toggle(sku: string, type: "prices" | "stock") {
    const setter = type === "prices" ? setSelected : setSelectedStock;
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(sku)) next.delete(sku);
      else next.add(sku);
      return next;
    });
  }

  async function exportStockCSV() {
    if (!result || result.stockChanges.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Stock PedidosYa");

    // Compute auto-fit widths based on actual content
    const data = result.stockChanges.map((c) => ({
      sku: c.peyaSku,
      name: c.peyaName,
      stock: String(c.stock),
      maxQty: String(c.maxQty),
      estado: c.currentActive ? "Activo" : "Inactivo",
      accion: c.shouldBeActive !== c.currentActive ? (c.shouldBeActive ? "Activar" : "Desactivar") : "—",
    }));
    const fit = (header: string, key: keyof typeof data[number], min = 8, max = 60) => {
      const maxLen = Math.max(header.length, ...data.map((d) => String(d[key]).length));
      return Math.min(max, Math.max(min, maxLen + 2));
    };

    ws.columns = [
      { header: "SKU PeYa", key: "sku", width: fit("SKU PeYa", "sku") },
      { header: "Producto", key: "name", width: fit("Producto", "name") },
      { header: "Stock", key: "stock", width: fit("Stock", "stock") },
      { header: "Cant Máx", key: "maxQty", width: fit("Cant Máx", "maxQty") },
      { header: "Estado Actual", key: "estado", width: fit("Estado Actual", "estado") },
      { header: "Acción", key: "accion", width: fit("Acción", "accion") },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFB9A47" } };
    ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 22;

    for (const c of result.stockChanges) {
      const row = ws.addRow({
        sku: c.peyaSku,
        name: c.peyaName,
        stock: c.stock,
        maxQty: c.maxQty,
        estado: c.currentActive ? "Activo" : "Inactivo",
        accion: c.shouldBeActive !== c.currentActive ? (c.shouldBeActive ? "Activar" : "Desactivar") : "—",
      });
      row.getCell("estado").font = { color: { argb: c.currentActive ? "FF15803D" : "FFB91C1C" } };
      row.getCell("accion").font = { color: { argb: c.shouldBeActive !== c.currentActive ? "FFB45309" : "FF999999" }, bold: c.shouldBeActive !== c.currentActive };
      row.getCell("stock").alignment = { horizontal: "right" };
      row.getCell("maxQty").alignment = { horizontal: "right" };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PedidosYa-Stock-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportStockPDF() {
    if (!result || result.stockChanges.length === 0) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    let y = 15;

    // Header bar
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — PedidosYa Stock", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${result.stockChanges.length} productos — ${new Date().toLocaleDateString("es-AR")}`, w - 14, 14, { align: "right" });
    y = 28;

    // Summary boxes
    const activos = result.stockChanges.filter((c) => c.currentActive).length;
    const inactivos = result.stockChanges.length - activos;
    doc.setFillColor(240, 240, 240);
    doc.roundedRect(8, y, 60, 12, 2, 2, "F");
    doc.roundedRect(72, y, 60, 12, 2, 2, "F");
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(8);
    doc.text(`Activos: ${activos}`, 14, y + 7.5);
    doc.text(`Inactivos: ${inactivos}`, 78, y + 7.5);
    y += 18;

    // Table header
    doc.setFillColor(55, 65, 81);
    doc.rect(8, y, w - 16, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("SKU", 12, y + 5.5);
    doc.text("Producto", 40, y + 5.5);
    doc.text("Stock", 180, y + 5.5, { align: "right" });
    doc.text("Cant Máx", 210, y + 5.5, { align: "right" });
    doc.text("Estado", 240, y + 5.5);
    doc.text("Acción", 268, y + 5.5);
    y += 10;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);

    for (let i = 0; i < result.stockChanges.length; i++) {
      const c = result.stockChanges[i];
      if (y > 190) {
        doc.addPage();
        y = 15;
      }

      if (i % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(8, y - 3, w - 16, 7, "F");
      }

      doc.setTextColor(50, 50, 50);
      doc.text(c.peyaSku, 12, y + 1.5);
      const name = c.peyaName.length > 55 ? c.peyaName.substring(0, 53) + "..." : c.peyaName;
      doc.text(name, 40, y + 1.5);
      doc.text(String(c.stock), 180, y + 1.5, { align: "right" });
      doc.text(String(c.maxQty), 210, y + 1.5, { align: "right" });

      // Estado badge
      if (c.currentActive) {
        doc.setTextColor(21, 128, 61);
        doc.text("Activo", 240, y + 1.5);
      } else {
        doc.setTextColor(185, 28, 28);
        doc.text("Inactivo", 240, y + 1.5);
      }

      // Acción
      if (c.shouldBeActive !== c.currentActive) {
        doc.setTextColor(180, 83, 9);
        doc.text(c.shouldBeActive ? "Activar" : "Desactivar", 268, y + 1.5);
      } else {
        doc.setTextColor(150, 150, 150);
        doc.text("—", 268, y + 1.5);
      }

      y += 7;
    }

    // Footer
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7);
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.text(`Página ${p}/${pageCount}`, w / 2, 205, { align: "center" });
    }

    doc.save(`PedidosYa-Stock-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function exportPricesCSV() {
    if (!result || result.changes.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Cambios de Precio");

    const fmtMoney = (n: number) => "$" + n.toLocaleString("es-AR");
    const data = result.changes.map((c) => ({
      sku: c.peyaSku,
      name: c.peyaName,
      ean: c.barcode,
      current: fmtMoney(c.currentPrice),
      new: fmtMoney(c.newPrice),
      diff: fmtMoney(c.newPrice - c.currentPrice),
    }));
    const fit = (header: string, key: keyof typeof data[number], min = 8, max = 60) => {
      const maxLen = Math.max(header.length, ...data.map((d) => String(d[key]).length));
      return Math.min(max, Math.max(min, maxLen + 2));
    };

    ws.columns = [
      { header: "SKU PeYa", key: "sku", width: fit("SKU PeYa", "sku") },
      { header: "Producto", key: "name", width: fit("Producto", "name") },
      { header: "EAN", key: "ean", width: fit("EAN", "ean") },
      { header: "Precio Actual", key: "current", width: fit("Precio Actual", "current") },
      { header: "Precio Nuevo", key: "new", width: fit("Precio Nuevo", "new") },
      { header: "Diferencia", key: "diff", width: fit("Diferencia", "diff") },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFB9A47" } };
    ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 22;

    for (const c of result.changes) {
      const diff = c.newPrice - c.currentPrice;
      const row = ws.addRow({
        sku: c.peyaSku,
        name: c.peyaName,
        ean: c.barcode,
        current: c.currentPrice,
        new: c.newPrice,
        diff,
      });
      row.getCell("current").numFmt = '"$"#,##0';
      row.getCell("new").numFmt = '"$"#,##0';
      row.getCell("diff").numFmt = '"$"#,##0;[Red]"$"-#,##0';
      row.getCell("diff").font = { color: { argb: diff > 0 ? "FF15803D" : "FFB91C1C" }, bold: true };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 6 } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PedidosYa-Precios-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function exportUnmatchedCSV() {
    if (!result || result.unmatchedList.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Sin Asociar");

    const data = result.unmatchedList.map((c) => ({
      sku: c.peyaSku,
      name: c.peyaName,
      ean: c.barcode,
      activo: c.active ? "Sí" : "No",
    }));
    const fit = (header: string, key: keyof typeof data[number], min = 8, max = 60) => {
      const maxLen = Math.max(header.length, ...data.map((d) => String(d[key]).length));
      return Math.min(max, Math.max(min, maxLen + 2));
    };

    ws.columns = [
      { header: "SKU PeYa", key: "sku", width: fit("SKU PeYa", "sku") },
      { header: "Producto", key: "name", width: fit("Producto", "name") },
      { header: "EAN", key: "ean", width: fit("EAN", "ean") },
      { header: "Activo", key: "activo", width: fit("Activo", "activo") },
    ];
    ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFB9A47" } };
    ws.getRow(1).alignment = { horizontal: "center", vertical: "middle" };
    ws.getRow(1).height = 22;

    for (const c of result.unmatchedList) {
      const row = ws.addRow({
        sku: c.peyaSku,
        name: c.peyaName,
        ean: c.barcode,
        activo: c.active ? "Sí" : "No",
      });
      row.getCell("activo").alignment = { horizontal: "center" };
      row.getCell("activo").font = { color: { argb: c.active ? "FF15803D" : "FF999999" } };
    }
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 4 } };
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PedidosYa-SinAsociar-${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 });

  const currentTabCount = tab === "prices" ? selected.size : selectedStock.size;
  const currentTabLabel = tab === "prices" ? "precios" : "cambios de stock";

  return (
    <PageTransition>
    <div className="max-w-5xl mx-auto p-4">
      <Stagger delay={0} y={-8}>
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-bold">PedidosYa — Sync</h1>
        <div className="flex gap-2">
          <a
            href="/api/admin/pedidosya/export-new?weight=100&section=Fiambres%20y%20Quesos"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100"
          >
            <HiOutlineDocumentDownload className="w-4 h-4" />
            Nuevos 100g
          </a>
          <a
            href="/api/admin/pedidosya/export-new?weight=250&section=Fiambres%20y%20Quesos"
            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100"
          >
            <HiOutlineDocumentDownload className="w-4 h-4" />
            Nuevos 250g
          </a>
        </div>
      </div>
      <p className="text-gray-500 text-sm mb-4">
        Compara precios y stock de PunTouch con PedidosYa.
      </p>
      </Stagger>

      <Stagger delay={100}>
      {/* Image URL lookup */}
      <ImageLookup />

      {/* Login / Token renewal UI */}
      {(tokenExpired || loginStep !== "idle") && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-700 mb-3">
            {tokenExpired ? "Sesión de PedidosYa expirada" : "Renovar sesión de PedidosYa"}
          </p>

          {loginStep === "idle" && (
            <button
              onClick={startLogin}
              className={`bg-amber-500 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-amber-600 disabled:opacity-50 ${springBtn}`}
            >
              Renovar sesión
            </button>
          )}

          {loginStep === "logging_in" && (
            <p className="text-sm text-amber-600">Iniciando sesión en PedidosYa...</p>
          )}

          {loginStep === "need_2fa" && (
            <div>
              <p className="text-sm text-amber-600 mb-2">
                Se envió un código de verificación al email. Ingresalo:
              </p>
              <div className="flex gap-2 items-center">
                <input
                  type="text"
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").substring(0, 6))}
                  placeholder="Código de 6 dígitos"
                  maxLength={6}
                  className="px-3 py-2 border border-amber-300 rounded-lg text-sm w-40 font-mono text-center text-lg tracking-widest focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  autoFocus
                  onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                />
                <button
                  onClick={verifyCode}
                  disabled={twoFaCode.length !== 6}
                  className={`bg-amber-500 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-amber-600 disabled:opacity-50 ${springBtn}`}
                >
                  Verificar
                </button>
              </div>
            </div>
          )}

          {loginStep === "verifying" && (
            <p className="text-sm text-amber-600">Verificando código...</p>
          )}
        </div>
      )}

      <button
        onClick={comparePrices}
        disabled={loading}
        className={`bg-brand-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors ${springBtn}`}
      >
        {loading ? "Comparando..." : "Comparar"}
      </button>

      {result && result.allMatched && (
        <button
          onClick={bulkSyncStock}
          disabled={bulkSyncing}
          className={`ml-3 bg-purple-600 text-white px-4 py-3 rounded-xl font-semibold hover:bg-purple-700 disabled:opacity-50 transition-colors text-sm ${springBtn}`}
        >
          {bulkSyncing ? "Sincronizando..." : `Sync Todo Stock (${result.allMatched.length})`}
        </button>
      )}

      {!tokenExpired && loginStep === "idle" && !result && (
        <button
          onClick={() => { setTokenExpired(true); }}
          className="ml-3 text-sm text-gray-400 hover:text-gray-600"
        >
          Renovar sesión
        </button>
      )}

      {/* Stock minimum setting */}
      <StockMinSetting />

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
      )}
      {successMsg && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">{successMsg}</div>
      )}
      </Stagger>

      {result && (
        <Stagger delay={150}>
        <div className="mt-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-brand-600">{result.peyaTotal}</div>
              <div className="text-xs text-gray-500">PedidosYa</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-brand-600">{result.puntouchTotal}</div>
              <div className="text-xs text-gray-500">Lista 5</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-green-600">{result.matched}</div>
              <div className="text-xs text-gray-500">Coincidencias</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-orange-500">{result.changes.length}</div>
              <div className="text-xs text-gray-500">Precios</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-purple-500">{result.stockChanges.length}</div>
              <div className="text-xs text-gray-500">Stock</div>
            </div>
          </div>

          {/* Tabs + Export */}
          <div className="flex items-center justify-between mb-4 gap-2">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 overflow-x-auto whitespace-nowrap">
              <button
                onClick={() => setTab("prices")}
                className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md transition-colors shrink-0 ${tab === "prices" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
              >
                Precios ({result.changes.length})
              </button>
              <button
                onClick={() => setTab("stock")}
                className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md transition-colors shrink-0 ${tab === "stock" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
              >
                Stock ({result.stockChanges.length})
              </button>
              {result.unmatchedList.length > 0 && (
                <button
                  onClick={() => setTab("unmatched")}
                  className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md transition-colors shrink-0 ${tab === "unmatched" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
                >
                  Sin asociar ({result.unmatchedList.length})
                </button>
              )}
              <button
                onClick={() => { setTab("mappings"); loadMappings(); }}
                className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md transition-colors shrink-0 ${tab === "mappings" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
              >
                Asociaciones
              </button>
              {result.missingFromPeya && result.missingFromPeya.length > 0 && (
                <button
                  onClick={() => setTab("missing")}
                  className={`px-2.5 py-1.5 text-xs sm:text-sm rounded-md transition-colors shrink-0 ${tab === "missing" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
                >
                  Faltantes ({result.missingFromPeya.length})
                </button>
              )}
            </div>
            <div className="flex gap-2">
              {tab === "stock" && (
                <button
                  onClick={exportStockPDF}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                >
                  <HiOutlineDocumentDownload className="w-4 h-4" />
                  PDF
                </button>
              )}
              <button
                onClick={tab === "prices" ? exportPricesCSV : tab === "stock" ? exportStockCSV : exportUnmatchedCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
              >
                <HiOutlineDocumentDownload className="w-4 h-4" />
                Excel
              </button>
            </div>
          </div>

          {/* Price changes tab */}
          {tab === "prices" && (
            result.changes.length === 0 ? (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-4 rounded-xl text-center font-semibold">
                Todos los precios están sincronizados
              </div>
            ) : (
              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-left">
                        <th className="p-3">
                          <input type="checkbox" checked={selected.size === result.changes.length && result.changes.length > 0} onChange={() => toggleAll("prices")} className="rounded" />
                        </th>
                        <th className="p-3">Producto</th>
                        <th className="p-3">EAN</th>
                        <th className="p-3 text-right">Actual</th>
                        <th className="p-3 text-right">Nuevo</th>
                        <th className="p-3 text-right">Dif</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.changes.map((c) => {
                        const diff = c.newPrice - c.currentPrice;
                        const pct = c.currentPrice > 0 ? ((diff / c.currentPrice) * 100).toFixed(1) : "N/A";
                        return (
                          <tr key={c.peyaSku} className={`border-b hover:bg-gray-50 ${selected.has(c.peyaSku) ? "bg-blue-50" : ""}`}>
                            <td className="p-3">
                              <input type="checkbox" checked={selected.has(c.peyaSku)} onChange={() => toggle(c.peyaSku, "prices")} className="rounded" />
                            </td>
                            <td className="p-3"><span className="text-gray-400 text-xs font-mono mr-1.5 cursor-pointer hover:text-gray-700 hover:underline" onClick={(e) => { navigator.clipboard.writeText(c.peyaSku.replace(/^0+/, "")); const el = e.currentTarget; el.dataset.orig = el.textContent || ""; el.textContent = "Copiado!"; el.classList.add("text-green-600"); setTimeout(() => { el.textContent = el.dataset.orig || ""; el.classList.remove("text-green-600"); }, 1000); }}>{c.peyaSku}</span><span className="font-medium">{c.peyaName}</span></td>
                            <td className="p-3 text-gray-500 font-mono text-xs">{c.barcode}</td>
                            <td className="p-3 text-right text-red-500">{fmt(c.currentPrice)}</td>
                            <td className="p-3 text-right text-green-600 font-semibold">{fmt(c.newPrice)}</td>
                            <td className="p-3 text-right">
                              <span className={diff > 0 ? "text-green-600" : "text-red-500"}>
                                {diff > 0 ? "+" : ""}{fmt(diff)} ({pct}%)
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* Stock changes tab */}
          {tab === "stock" && (
            result.stockChanges.length === 0 ? (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-4 rounded-xl text-center font-semibold">
                Todos los estados de stock están sincronizados
              </div>
            ) : (
              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-left">
                        <th className="p-3">
                          <input type="checkbox" checked={selectedStock.size === result.stockChanges.length && result.stockChanges.length > 0} onChange={() => toggleAll("stock")} className="rounded" />
                        </th>
                        <th className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("peyaName")}>Producto{sortIcon("peyaName")}</th>
                        <th className="p-3 text-center cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("stock")}>Stock{sortIcon("stock")}</th>
                        <th className="p-3 text-center cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("maxQty")}>Cant Máx{sortIcon("maxQty")}</th>
                        <th className="p-3 text-center">Estado actual</th>
                        <th className="p-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...result.stockChanges].sort((a, b) => {
                        if (!sortField) return 0;
                        const av = a[sortField as keyof StockChange];
                        const bv = b[sortField as keyof StockChange];
                        const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
                        return sortDir === "asc" ? cmp : -cmp;
                      }).map((c) => (
                        <tr key={c.peyaSku} className={`border-b hover:bg-gray-50 ${selectedStock.has(c.peyaSku) ? "bg-blue-50" : ""}`}>
                          <td className="p-3">
                            <input type="checkbox" checked={selectedStock.has(c.peyaSku)} onChange={() => toggle(c.peyaSku, "stock")} className="rounded" />
                          </td>
                          <td className="p-3"><span className="text-gray-400 text-xs font-mono mr-1.5 cursor-pointer hover:text-gray-700 hover:underline" onClick={(e) => { navigator.clipboard.writeText(c.peyaSku.replace(/^0+/, "")); const el = e.currentTarget; el.dataset.orig = el.textContent || ""; el.textContent = "Copiado!"; el.classList.add("text-green-600"); setTimeout(() => { el.textContent = el.dataset.orig || ""; el.classList.remove("text-green-600"); }, 1000); }}>{c.peyaSku}</span><span className="font-medium">{c.peyaName}</span></td>
                          <td className="p-3 text-center">
                            <span className={`font-mono font-bold ${c.stock <= 0 ? "text-red-500" : "text-green-600"}`}>
                              {c.stock === -999 ? "Sin L5" : c.stock}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className="font-mono text-sm font-bold text-blue-600">
                              {c.maxQty}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.currentActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {c.currentActive ? "Activo" : "Inactivo"}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            <span className={`text-xs px-2 py-1 rounded-full font-medium ${c.shouldBeActive ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                              {c.shouldBeActive ? "Activar" : "Desactivar"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* Unmatched tab */}
          {tab === "unmatched" && result.unmatchedList.length > 0 && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <p className="text-sm text-gray-600">
                  Productos sin asociar. Usá el botón Asociar para vincularlos con un SKU de PunTouch (con multiplicador para pesables, ej: x0.5 para 500g).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="p-3">SKU PeYa</th>
                      <th className="p-3">Producto</th>
                      <th className="p-3">EAN</th>
                      <th className="p-3 text-center">Estado</th>
                      <th className="p-3">Asociar con PunTouch</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.unmatchedList.map((c) => (
                      <UnmatchedRow key={c.peyaSku} item={c} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Mappings tab */}
          {tab === "mappings" && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <p className="text-sm text-gray-600">
                  Asociaciones manuales entre PedidosYa y PunTouch. Editá el multiplicador o eliminá asociaciones incorrectas.
                </p>
              </div>
              {mappingsLoading ? (
                <LoadingCenter />
              ) : mappings.length === 0 ? (
                <p className="p-4 text-gray-400">No hay asociaciones manuales.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-left">
                        <th className="p-3">SKU PeYa</th>
                        <th className="p-3">SKU PunTouch</th>
                        <th className="p-3 text-center">Multiplicador</th>
                        <th className="p-3 text-center">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappings.map((m) => (
                        <MappingRow key={m.id} mapping={m} onUpdate={updateMapping} onDelete={deleteMapping} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Apply button — only for current tab */}
          {/* Missing from PeYa tab */}
          {tab === "missing" && result.missingFromPeya && result.missingFromPeya.length > 0 && (
            <div className="bg-white border rounded-xl overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b">
                <p className="text-sm text-gray-600">
                  Productos en PunTouch con precio Lista 5 que no están en PedidosYa ({result.missingFromPeya.length}).
                </p>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white z-10">
                    <tr className="bg-gray-50 border-b text-left">
                      <th className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("sku")}>SKU{sortIcon("sku")}</th>
                      <th className="p-3 cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("nombre")}>Producto{sortIcon("nombre")}</th>
                      <th className="p-3">EAN</th>
                      <th className="p-3 text-right cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("precio5")}>Precio L5{sortIcon("precio5")}</th>
                      <th className="p-3 text-center cursor-pointer hover:bg-gray-100" onClick={() => toggleSort("stock")}>Stock{sortIcon("stock")}</th>
                      <th className="p-3 text-center">Unidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...result.missingFromPeya].sort((a, b) => {
                      if (!sortField) return 0;
                      const av = a[sortField as keyof MissingProduct];
                      const bv = b[sortField as keyof MissingProduct];
                      const cmp = typeof av === "number" ? (av as number) - (bv as number) : String(av).localeCompare(String(bv));
                      return sortDir === "asc" ? cmp : -cmp;
                    }).map((p) => (
                      <tr key={p.sku} className={`border-b hover:bg-gray-50 ${p.stock <= 0 ? "bg-red-50/50" : ""}`}>
                        <td className="p-3 font-mono text-sm font-bold text-brand-600">{p.sku}</td>
                        <td className="p-3 font-medium">{p.nombre}</td>
                        <td className="p-3 font-mono text-xs text-gray-400">{p.codbar || "—"}</td>
                        <td className="p-3 text-right">{fmt(p.precio5)}</td>
                        <td className="p-3 text-center">
                          <span className={`font-mono font-bold ${p.stock <= 0 ? "text-red-500" : "text-green-600"}`}>
                            {p.stock}
                          </span>
                        </td>
                        <td className="p-3 text-center text-gray-500">{p.unidad}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {currentTabCount > 0 && tab !== "unmatched" && tab !== "mappings" && tab !== "missing" && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {currentTabCount} de {tab === "prices" ? result.changes.length : result.stockChanges.length} seleccionados
              </span>
              <button
                onClick={applyUpdates}
                disabled={updating}
                className={`bg-red-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors ${springBtn}`}
              >
                {updating ? "Actualizando..." : `Aplicar ${currentTabCount} ${currentTabLabel} en PedidosYa`}
              </button>
            </div>
          )}
        </div>
        </Stagger>
      )}
    </div>
    </PageTransition>
  );
}
