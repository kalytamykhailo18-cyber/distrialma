"use client";

import { useEffect, useState } from "react";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

const PRICE_LISTS = [
  { lista: 1, label: "Minorista" },
  { lista: 2, label: "Mayorista" },
  { lista: 3, label: "Especial" },
  { lista: 4, label: "Caja Cerrada" },
  { lista: 5, label: "Lista 5" },
];

export default function AdminConfigPage() {
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [stockThreshold, setStockThreshold] = useState("0");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Margins
  const [margins, setMargins] = useState<Record<number, string>>({});
  const [savingMargins, setSavingMargins] = useState(false);
  const [marginSaved, setMarginSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/settings").then((r) => r.json()),
      fetch("/api/admin/price-margins").then((r) => r.json()),
    ])
      .then(([settings, marginData]) => {
        setHideOutOfStock(settings.hide_out_of_stock === "true");
        setStockThreshold(settings.stock_threshold || "0");
        const m: Record<number, string> = {};
        for (const mg of marginData.margins || []) {
          m[mg.lista] = String(mg.margen);
        }
        setMargins(m);
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
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Configuración</h1>
      </Stagger>

      {loading ? (
        <LoadingCenter />
      ) : (
        <div className="space-y-4">
          <Stagger delay={50}>
            <div className="bg-white rounded-xl shadow-sm border p-6">
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
                  className={`${springBtn} px-4 py-2 rounded-xl text-sm font-medium ${
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
          </Stagger>

          {hideOutOfStock && (
            <Stagger delay={100}>
              <div className="bg-white rounded-xl shadow-sm border p-6">
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
                    className="w-24 px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                  <span className="text-sm text-gray-500">unidades</span>
                  <button
                    onClick={saveThreshold}
                    disabled={saving}
                    className={`${springBtn} px-4 py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50`}
                  >
                    {saving ? "..." : "Guardar"}
                  </button>
                </div>
              </div>
            </Stagger>
          )}

          {/* Price margins */}
          <Stagger delay={150}>
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="font-semibold text-gray-900 mb-1">
                Márgenes de ganancia por lista
              </h2>
              <p className="text-sm text-gray-500 mb-4">
                Al costear un ingreso, los precios se calculan automáticamente: Costo × (1 + Margen%). Se redondea sin decimales.
              </p>
              <div className="space-y-2">
                {PRICE_LISTS.map((pl, i) => (
                  <div key={pl.lista} className={`flex items-center gap-3 rounded-lg px-2 py-1 ${hoverRow}`} style={staggerStyle(true, i)}>
                    <span className="text-sm text-gray-700 w-28">{pl.label}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.1"
                      value={margins[pl.lista] || ""}
                      onChange={(e) => setMargins((prev) => ({ ...prev, [pl.lista]: e.target.value }))}
                      placeholder="0"
                      className="w-24 px-3 py-2 border border-brand-400 rounded-xl text-sm text-right focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                    <span className="text-sm text-gray-400">%</span>
                  </div>
                ))}
              </div>
              <button
                onClick={async () => {
                  setSavingMargins(true);
                  setMarginSaved(false);
                  await fetch("/api/admin/price-margins", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      margins: PRICE_LISTS.map((pl) => ({
                        lista: pl.lista,
                        margen: parseFloat(margins[pl.lista] || "0") || 0,
                      })),
                    }),
                  });
                  setSavingMargins(false);
                  setMarginSaved(true);
                  setTimeout(() => setMarginSaved(false), 2000);
                }}
                disabled={savingMargins}
                className={`${springBtn} mt-4 px-4 py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50`}
              >
                {savingMargins ? "..." : marginSaved ? "Guardado!" : "Guardar márgenes"}
              </button>
            </div>
          </Stagger>
        </div>
      )}
    </PageTransition>
  );
}
