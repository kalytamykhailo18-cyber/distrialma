"use client";

import { useState } from "react";
import { HiOutlineDocumentDownload } from "react-icons/hi";

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
}

interface UnmatchedItem {
  peyaSku: string;
  peyaName: string;
  barcode: string;
  active: boolean;
}

interface CompareResult {
  peyaTotal: number;
  puntouchTotal: number;
  matched: number;
  unmatched: number;
  changes: PriceChange[];
  stockChanges: StockChange[];
  unmatchedList: UnmatchedItem[];
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
    <tr className={`border-b hover:bg-gray-50 ${saved ? "bg-green-50" : ""}`}>
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
  const [tab, setTab] = useState<"prices" | "stock" | "unmatched">("prices");

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
      ? result.stockChanges.filter((c) => selectedStock.has(c.peyaSku)).map((c) => ({ sku: c.peyaSku, active: c.shouldBeActive }))
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

  function exportStockCSV() {
    if (!result || result.stockChanges.length === 0) return;
    const header = ["SKU PeYa", "Producto", "Stock", "Estado Actual", "Accion"];
    const rows = result.stockChanges.map((c) => [
      c.peyaSku,
      c.peyaName,
      c.stock,
      c.currentActive ? "Activo" : "Inactivo",
      c.shouldBeActive ? "Activar" : "Desactivar",
    ]);
    const BOM = "\uFEFF";
    const csv = BOM + [header, ...rows].map((r) =>
      r.map((c) => {
        const s = String(c);
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PedidosYa-Stock-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportPricesCSV() {
    if (!result || result.changes.length === 0) return;
    const header = ["SKU PeYa", "Producto", "EAN", "Precio Actual", "Precio Nuevo", "Diferencia"];
    const rows = result.changes.map((c) => [
      c.peyaSku,
      c.peyaName,
      c.barcode,
      c.currentPrice,
      c.newPrice,
      c.newPrice - c.currentPrice,
    ]);
    const BOM = "\uFEFF";
    const csv = BOM + [header, ...rows].map((r) =>
      r.map((c) => {
        const s = String(c);
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PedidosYa-Precios-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportUnmatchedCSV() {
    if (!result || result.unmatchedList.length === 0) return;
    const header = ["SKU PeYa", "Producto", "EAN", "Activo"];
    const rows = result.unmatchedList.map((c) => [
      c.peyaSku, c.peyaName, c.barcode, c.active ? "Si" : "No",
    ]);
    const BOM = "\uFEFF";
    const csv = BOM + [header, ...rows].map((r) =>
      r.map((c) => {
        const s = String(c);
        return s.includes(",") || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `PedidosYa-SinAsociar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 });

  const currentTabCount = tab === "prices" ? selected.size : selectedStock.size;
  const currentTabLabel = tab === "prices" ? "precios" : "cambios de stock";

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">PedidosYa — Sync</h1>
      <p className="text-gray-500 text-sm mb-6">
        Compara precios y stock de PunTouch con PedidosYa.
      </p>

      {/* Login / Token renewal UI */}
      {(tokenExpired || loginStep !== "idle") && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
          <p className="text-sm font-bold text-amber-700 mb-3">
            {tokenExpired ? "Sesión de PedidosYa expirada" : "Renovar sesión de PedidosYa"}
          </p>

          {loginStep === "idle" && (
            <button
              onClick={startLogin}
              className="bg-amber-500 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-amber-600 disabled:opacity-50"
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
                  className="bg-amber-500 text-white px-5 py-2 rounded-lg font-medium text-sm hover:bg-amber-600 disabled:opacity-50"
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
        className="bg-brand-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Comparando..." : "Comparar"}
      </button>

      {!tokenExpired && loginStep === "idle" && !result && (
        <button
          onClick={() => { setTokenExpired(true); }}
          className="ml-3 text-sm text-gray-400 hover:text-gray-600"
        >
          Renovar sesión
        </button>
      )}

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
      )}
      {successMsg && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">{successMsg}</div>
      )}

      {result && (
        <div className="mt-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{result.peyaTotal}</div>
              <div className="text-xs text-gray-500">PedidosYa</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{result.puntouchTotal}</div>
              <div className="text-xs text-gray-500">Lista 5</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{result.matched}</div>
              <div className="text-xs text-gray-500">Coincidencias</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-orange-500">{result.changes.length}</div>
              <div className="text-xs text-gray-500">Precios</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-purple-500">{result.stockChanges.length}</div>
              <div className="text-xs text-gray-500">Stock</div>
            </div>
          </div>

          {/* Tabs + Export */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
              <button
                onClick={() => setTab("prices")}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === "prices" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
              >
                Precios ({result.changes.length})
              </button>
              <button
                onClick={() => setTab("stock")}
                className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === "stock" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
              >
                Stock ({result.stockChanges.length})
              </button>
              {result.unmatchedList.length > 0 && (
                <button
                  onClick={() => setTab("unmatched")}
                  className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === "unmatched" ? "bg-white text-gray-900 shadow-sm font-medium" : "text-gray-500"}`}
                >
                  Sin asociar ({result.unmatchedList.length})
                </button>
              )}
            </div>
            <button
              onClick={tab === "prices" ? exportPricesCSV : tab === "stock" ? exportStockCSV : exportUnmatchedCSV}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
            >
              <HiOutlineDocumentDownload className="w-4 h-4" />
              Excel
            </button>
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
                            <td className="p-3"><span className="text-gray-400 text-xs font-mono mr-1.5">{c.peyaSku}</span><span className="font-medium">{c.peyaName}</span></td>
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
                        <th className="p-3">Producto</th>
                        <th className="p-3 text-center">Stock</th>
                        <th className="p-3 text-center">Estado actual</th>
                        <th className="p-3 text-center">Acción</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.stockChanges.map((c) => (
                        <tr key={c.peyaSku} className={`border-b hover:bg-gray-50 ${selectedStock.has(c.peyaSku) ? "bg-blue-50" : ""}`}>
                          <td className="p-3">
                            <input type="checkbox" checked={selectedStock.has(c.peyaSku)} onChange={() => toggle(c.peyaSku, "stock")} className="rounded" />
                          </td>
                          <td className="p-3"><span className="text-gray-400 text-xs font-mono mr-1.5">{c.peyaSku}</span><span className="font-medium">{c.peyaName}</span></td>
                          <td className="p-3 text-center">
                            <span className={`font-mono font-bold ${c.stock <= 0 ? "text-red-500" : "text-green-600"}`}>
                              {c.stock === -999 ? "Sin L5" : c.stock}
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

          {/* Apply button — only for current tab */}
          {currentTabCount > 0 && tab !== "unmatched" && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm text-gray-500">
                {currentTabCount} de {tab === "prices" ? result.changes.length : result.stockChanges.length} seleccionados
              </span>
              <button
                onClick={applyUpdates}
                disabled={updating}
                className="bg-red-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {updating ? "Actualizando..." : `Aplicar ${currentTabCount} ${currentTabLabel} en PedidosYa`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
