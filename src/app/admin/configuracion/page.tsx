"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export default function AdminConfigPage() {
  const [hideOutOfStock, setHideOutOfStock] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((data) => {
        setHideOutOfStock(data.hide_out_of_stock === "true");
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

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link
        href="/admin"
        className="text-sm text-blue-600 hover:underline mb-4 inline-block"
      >
        &larr; Volver al panel
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 mb-6">Configuración</h1>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <div className="bg-white rounded-lg border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-gray-900">
                Ocultar productos sin stock
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                Si está activado, solo se muestran productos con stock mayor a
                cero.
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
      )}
    </div>
  );
}
