"use client";

import { useEffect, useState } from "react";

interface CategoryWithHidden {
  id: string;
  name: string;
  hidden: boolean;
}

export default function AdminCategoriasPage() {
  const [categories, setCategories] = useState<CategoryWithHidden[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!loading) {
      requestAnimationFrame(() => setReady(true));
    }
  }, [loading]);

  async function toggleCategory(categoryId: string, hidden: boolean) {
    setSaving(categoryId);
    await fetch("/api/admin/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categoryId, hidden }),
    });
    setCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, hidden } : c))
    );
    setSaving(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1
        className="text-2xl font-bold text-gray-900 mb-6 transition-all duration-500 ease-out"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(-8px)",
        }}
      >
        Categorías (Rubros)
      </h1>

      <p
        className="text-sm text-gray-500 mb-4 transition-all duration-500 ease-out delay-75"
        style={{
          opacity: ready ? 1 : 0,
          transform: ready ? "translateY(0)" : "translateY(-6px)",
        }}
      >
        Las categorías ocultas no se muestran en la tienda ni sus productos.
      </p>

      {loading ? (
        <div className="flex items-center gap-3 py-12 justify-center">
          <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-gray-400 text-sm">Cargando categorías...</span>
        </div>
      ) : (
        <div
          className="bg-white rounded-xl border shadow-sm overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{
            opacity: ready ? 1 : 0,
            transform: ready ? "translateY(0) scale(1)" : "translateY(12px) scale(0.98)",
          }}
        >
          <table className="w-full text-sm">
            <thead className="bg-gray-50/80 backdrop-blur-sm">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  Categoría
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">
                  ID
                </th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">
                  Visible
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, i) => (
                <tr
                  key={cat.id}
                  className="border-t transition-colors duration-200 hover:bg-gray-50/60"
                  style={{
                    opacity: ready ? 1 : 0,
                    transform: ready ? "translateY(0)" : "translateY(8px)",
                    transition: `opacity 350ms cubic-bezier(0.25,1,0.5,1) ${150 + i * 25}ms, transform 350ms cubic-bezier(0.25,1,0.5,1) ${150 + i * 25}ms, background-color 200ms ease`,
                  }}
                >
                  <td className="px-4 py-3">{cat.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">
                    {cat.id}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleCategory(cat.id, !cat.hidden)}
                      disabled={saving !== null}
                      className={`relative px-3 py-1 rounded-full text-xs font-medium transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-90 ${
                        cat.hidden
                          ? "bg-red-100 text-red-700 hover:bg-red-200 hover:shadow-sm"
                          : "bg-green-100 text-green-700 hover:bg-green-200 hover:shadow-sm"
                      } disabled:opacity-50 disabled:active:scale-100`}
                    >
                      <span
                        className="inline-block transition-all duration-200"
                        style={{
                          opacity: saving === cat.id ? 0 : 1,
                          transform: saving === cat.id ? "scale(0.8)" : "scale(1)",
                        }}
                      >
                        {cat.hidden ? "Oculto" : "Visible"}
                      </span>
                      {saving === cat.id && (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        </span>
                      )}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
