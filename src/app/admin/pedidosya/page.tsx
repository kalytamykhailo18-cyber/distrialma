"use client";

import { useState } from "react";

interface PriceChange {
  peyaSku: string;
  peyaName: string;
  barcode: string;
  puntouchSku: string;
  currentPrice: number;
  newPrice: number;
}

interface CompareResult {
  peyaTotal: number;
  puntouchTotal: number;
  matched: number;
  unmatched: number;
  changes: PriceChange[];
}

export default function PedidosYaPage() {
  const [loading, setLoading] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function comparePrices() {
    setLoading(true);
    setError("");
    setResult(null);
    setSuccessMsg("");
    try {
      const res = await fetch("/api/admin/pedidosya");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      // Select all by default
      setSelected(new Set(data.changes.map((c: PriceChange) => c.peyaSku)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }

  async function applyUpdates() {
    if (!result || selected.size === 0) return;
    setUpdating(true);
    setError("");
    try {
      const updates = result.changes
        .filter((c) => selected.has(c.peyaSku))
        .map((c) => ({ sku: c.peyaSku, price: c.newPrice }));

      const res = await fetch("/api/admin/pedidosya", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccessMsg(`${data.updated} precios actualizados en PedidosYa`);
      if (data.errors?.length > 0) {
        setError(data.errors.join("; "));
      }
      // Re-compare
      setTimeout(comparePrices, 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error desconocido");
    } finally {
      setUpdating(false);
    }
  }

  function toggleAll() {
    if (!result) return;
    if (selected.size === result.changes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(result.changes.map((c) => c.peyaSku)));
    }
  }

  function toggleOne(sku: string) {
    const next = new Set(selected);
    if (next.has(sku)) next.delete(sku);
    else next.add(sku);
    setSelected(next);
  }

  const fmt = (n: number) =>
    n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 0 });

  return (
    <div className="max-w-5xl mx-auto p-4">
      <h1 className="text-2xl font-bold mb-1">PedidosYa — Sync Precios</h1>
      <p className="text-gray-500 text-sm mb-6">
        Compara precios Lista 5 (PunTouch) con PedidosYa y actualiza los que cambiaron.
      </p>

      <button
        onClick={comparePrices}
        disabled={loading}
        className="bg-brand-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {loading ? "Comparando..." : "Comparar Precios"}
      </button>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl">
          {successMsg}
        </div>
      )}

      {result && (
        <div className="mt-6">
          {/* Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{result.peyaTotal}</div>
              <div className="text-xs text-gray-500">Productos PedidosYa</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{result.puntouchTotal}</div>
              <div className="text-xs text-gray-500">Productos Lista 5</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{result.matched}</div>
              <div className="text-xs text-gray-500">Coincidencias</div>
            </div>
            <div className="bg-white border rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-orange-500">{result.changes.length}</div>
              <div className="text-xs text-gray-500">Precios a cambiar</div>
            </div>
          </div>

          {result.changes.length === 0 ? (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-4 rounded-xl text-center font-semibold">
              Todos los precios están sincronizados
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="bg-white border rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 border-b text-left">
                        <th className="p-3">
                          <input
                            type="checkbox"
                            checked={selected.size === result.changes.length}
                            onChange={toggleAll}
                            className="rounded"
                          />
                        </th>
                        <th className="p-3">Producto</th>
                        <th className="p-3">EAN</th>
                        <th className="p-3 text-right">Precio Actual</th>
                        <th className="p-3 text-right">Precio Nuevo</th>
                        <th className="p-3 text-right">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.changes.map((c) => {
                        const diff = c.newPrice - c.currentPrice;
                        const pct = c.currentPrice > 0 ? ((diff / c.currentPrice) * 100).toFixed(1) : "N/A";
                        return (
                          <tr
                            key={c.peyaSku}
                            className={`border-b hover:bg-gray-50 ${selected.has(c.peyaSku) ? "bg-blue-50" : ""}`}
                          >
                            <td className="p-3">
                              <input
                                type="checkbox"
                                checked={selected.has(c.peyaSku)}
                                onChange={() => toggleOne(c.peyaSku)}
                                className="rounded"
                              />
                            </td>
                            <td className="p-3 font-medium">{c.peyaName}</td>
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

              {/* Apply button */}
              <div className="mt-4 flex items-center justify-between">
                <span className="text-sm text-gray-500">
                  {selected.size} de {result.changes.length} seleccionados
                </span>
                <button
                  onClick={applyUpdates}
                  disabled={updating || selected.size === 0}
                  className="bg-red-500 text-white px-6 py-3 rounded-xl font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors"
                >
                  {updating ? "Actualizando..." : `Actualizar ${selected.size} precios en PedidosYa`}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
