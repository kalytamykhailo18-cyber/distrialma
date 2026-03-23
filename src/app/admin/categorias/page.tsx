"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface CategoryWithHidden {
  id: string;
  name: string;
  hidden: boolean;
}

export default function AdminCategoriasPage() {
  const [categories, setCategories] = useState<CategoryWithHidden[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/categories")
      .then((r) => r.json())
      .then(setCategories)
      .finally(() => setLoading(false));
  }, []);

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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Categorías (Rubros)</h1>
        <Link
          href="/admin"
          className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          Volver
        </Link>
      </div>

      <p className="text-sm text-gray-500 mb-4">
        Las categorías ocultas no se muestran en la tienda ni sus productos.
      </p>

      {loading ? (
        <p className="text-gray-500">Cargando...</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
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
              {categories.map((cat) => (
                <tr key={cat.id} className="border-t">
                  <td className="px-4 py-3">{cat.name}</td>
                  <td className="px-4 py-3 font-mono text-gray-500">
                    {cat.id}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleCategory(cat.id, !cat.hidden)}
                      disabled={saving !== null}
                      className={`px-3 py-1 rounded text-xs font-medium ${
                        cat.hidden
                          ? "bg-red-100 text-red-700 hover:bg-red-200"
                          : "bg-green-100 text-green-700 hover:bg-green-200"
                      } disabled:opacity-50`}
                    >
                      {saving === cat.id
                        ? "..."
                        : cat.hidden
                        ? "Oculto"
                        : "Visible"}
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
