"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePlus } from "react-icons/hi";

interface Proveedor {
  cod: string;
  nombre: string;
  saldo: number;
}

export default function ProveedoresPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function loadData() {
    setLoading(true);
    fetch("/api/admin/proveedores")
      .then((r) => r.json())
      .then((data) => setProveedores(data.proveedores || []))
      .catch(() => setProveedores([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAdd() {
    if (!newName.trim()) {
      setError("Nombre requerido");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setNewName("");
      setShowAdd(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  const filtered = filter.trim()
    ? proveedores.filter((p) =>
        p.nombre.toLowerCase().includes(filter.toLowerCase())
      )
    : proveedores;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 transition-colors"
        >
          <HiOutlinePlus className="w-4 h-4" />
          Nuevo proveedor
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 rounded-lg border p-4 mb-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => {
                setShowAdd(false);
                setNewName("");
                setError("");
              }}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 border border-brand-400 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar proveedores..."
        className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-4"
      />

      {loading ? (
        <p className="text-gray-400">Cargando proveedores...</p>
      ) : (
        <div className="bg-white rounded-lg border divide-y max-h-[60vh] overflow-y-auto">
          {filtered.map((p) => (
            <div
              key={p.cod}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50"
            >
              <div>
                <span className="text-sm text-gray-900">{p.nombre}</span>
                <span className="text-xs text-gray-400 ml-2">#{p.cod}</span>
              </div>
              <span
                className={`text-sm font-medium ${
                  p.saldo > 0 ? "text-red-600" : "text-gray-400"
                }`}
              >
                {p.saldo > 0 ? formatPrice(p.saldo) : "—"}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  );
}
