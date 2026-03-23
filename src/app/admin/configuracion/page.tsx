"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminConfigPage() {
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [stockThreshold, setStockThreshold] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setHideOutOfStock(data.hide_out_of_stock === "true");
        setStockThreshold(data.stock_threshold || "0");
      })
      .finally(() => setLoading(false));
  }, []);

  async function toggleStock() {
    setSaving(true);
    const newValue = !hideOutOfStock;
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "hide_out_of_stock",
        value: String(newValue),
      }),
    });
    setHideOutOfStock(newValue);
    setSaving(false);
  }

  async function saveThreshold() {
    setSaving(true);
    await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key: "stock_threshold",
        value: stockThreshold,
      }),
    });
    setSaving(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <Link
          href="/admin"
          className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          Volver
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <div className="space-y-4">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">
                  Ocultar productos con poco stock
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Si está activado, oculta productos con stock igual o menor al mínimo configurado.
                </p>
              </div>
              <button
                onClick={toggleStock}
                disabled={saving}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  hideOutOfStock
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                } disabled:opacity-50`}
              >
                {saving
                  ? "..."
                  : hideOutOfStock
                  ? "Activado"
                  : "Desactivado"}
              </button>
            </div>
          </div>

          {hideOutOfStock && (
            <div className="bg-white rounded-lg border p-6">
              <h2 className="font-semibold text-gray-900 mb-2">
                Stock mínimo para mostrar
              </h2>
              <p className="text-sm text-gray-500 mb-3">
                Productos con stock igual o menor a este valor se ocultan de la tienda.
              </p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  value={stockThreshold}
                  onChange={(e) => setStockThreshold(e.target.value)}
                  min="0"
                  className="w-24 px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                />
                <span className="text-sm text-gray-500">unidades</span>
                <button
                  onClick={saveThreshold}
                  disabled={saving}
                  className="px-4 py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
                >
                  {saving ? "..." : "Guardar"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
