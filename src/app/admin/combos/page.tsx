"use client";

import { useState, useEffect, useRef } from "react";
import type { Product } from "@/types";
import { formatPrice } from "@/lib/utils";
import ConfirmModal from "@/components/ConfirmModal";

interface ComboItem {
  sku: string;
  quantity: number;
  name?: string;
}

interface Combo {
  id: number;
  name: string;
  description: string | null;
  price: number;
  active: boolean;
  items: ComboItem[];
}

export default function CombosPage() {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [editId, setEditId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [items, setItems] = useState<ComboItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  // Product search
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadCombos();
  }, []);

  async function loadCombos() {
    setLoading(true);
    try {
      const [adminRes, publicRes] = await Promise.all([
        fetch("/api/admin/combos").then((r) => r.json()),
        fetch("/api/combos").then((r) => r.json()),
      ]);
      const adminCombos = adminRes.combos || [];
      const publicCombos = publicRes.combos || [];
      const priceMap = new Map(publicCombos.map((c: { id: number; price: number }) => [c.id, c.price]));
      setCombos(adminCombos.map((c: Combo) => ({
        ...c,
        price: c.price || priceMap.get(c.id) || 0,
      })));
    } catch {
      setCombos([]);
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) { setResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(value)}&limit=8`);
        const data = await res.json();
        setResults(data.products || []);
      } catch { setResults([]); }
      finally { setSearching(false); }
    }, 400);
  }

  function addProduct(product: Product) {
    if (items.find((i) => i.sku === product.sku)) return;
    setItems([...items, { sku: product.sku, quantity: 1, name: product.name }]);
    setSearch("");
    setResults([]);
  }

  function resetForm() {
    setEditId(null);
    setName("");
    setDescription("");
    setPrice("");
    setItems([]);
  }

  async function startEdit(combo: Combo) {
    setEditId(combo.id);
    setName(combo.name);
    setDescription(combo.description || "");
    // Only pre-fill price if it was a custom price (different from auto-calculated)
    // Leave empty so auto-calculation kicks in — prevents stale fixed prices
    setPrice("");
    // Fetch product names for items
    const itemsWithNames = await Promise.all(
      combo.items.map(async (i) => {
        try {
          const res = await fetch(`/api/products?search=${encodeURIComponent(i.sku)}&limit=1`);
          const data = await res.json();
          const product = data.products?.find((p: { sku: string }) => p.sku === i.sku);
          return { ...i, name: product?.name || i.sku };
        } catch {
          return { ...i, name: i.name || i.sku };
        }
      })
    );
    setItems(itemsWithNames);
  }

  async function handleSave() {
    setFormError("");
    if (!name.trim() || items.length < 2) {
      setFormError("Completá nombre y al menos 2 productos");
      return;
    }
    setSaving(true);
    try {
      const body = {
        id: editId,
        name: name.trim(),
        description: description.trim() || undefined,
        price: price ? parseFloat(price) : null,
        active: true,
        items: items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
      };
      const res = await fetch("/api/admin/combos", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        resetForm();
        await loadCombos();
      } else {
        const data = await res.json();
        setFormError(data.error || "Error al guardar");
      }
    } catch {
      setFormError("Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    setDeletingId(id);
    try {
      await fetch("/api/admin/combos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      await loadCombos();
    } finally {
      setDeletingId(null);
      setConfirmDeleteId(null);
    }
  }

  async function handleToggle(combo: Combo) {
    setTogglingId(combo.id);
    try {
      await fetch("/api/admin/combos", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...combo,
          active: !combo.active,
          items: combo.items.map((i) => ({ sku: i.sku, quantity: i.quantity })),
        }),
      });
      await loadCombos();
    } finally {
      setTogglingId(null);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Combos</h1>

      {/* Form */}
      <div className="bg-white rounded-lg border p-4 mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-3">
          {editId ? "Editar combo" : "Crear combo"}
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre del combo"
            className="px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          <input
            type="number"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="Precio especial (opcional, vacío = suma automática)"
            className="px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
        </div>

        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-3"
        />

        {/* Product search */}
        <div className="relative mb-3">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar producto para agregar..."
            className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          {searching && <span className="absolute right-3 top-2.5 text-gray-400 text-xs">Buscando...</span>}
          {results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-48 overflow-y-auto">
              {results.map((p) => {
                const added = items.some((i) => i.sku === p.sku);
                return (
                  <button
                    key={p.sku}
                    onClick={() => !added && addProduct(p)}
                    disabled={added}
                    className={`w-full text-left px-4 py-2 text-sm border-b last:border-b-0 ${
                      added ? "bg-gray-50 text-gray-400" : "hover:bg-brand-50"
                    }`}
                  >
                    <span className="font-mono text-gray-500 mr-2">{p.sku}</span>
                    {p.name}
                    <span className="ml-2 text-gray-400">{formatPrice(p.precioMayorista)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Selected items */}
        {items.length > 0 && (
          <div className="border rounded-lg p-3 mb-3 space-y-2">
            {items.map((item, idx) => (
              <div key={item.sku} className="flex items-center gap-3">
                <span className="text-sm flex-1">
                  <span className="font-mono text-gray-400 mr-1">{item.sku}</span>
                  {item.name || item.sku}
                </span>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Cant:</span>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => {
                      const newItems = [...items];
                      newItems[idx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                      setItems(newItems);
                    }}
                    className="w-14 text-center text-sm border rounded py-1"
                    min={1}
                  />
                </div>
                <button
                  onClick={() => setItems(items.filter((_, i) => i !== idx))}
                  className="text-red-500 hover:text-red-700 text-sm"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>
        )}

        {formError && (
          <p className="text-sm text-red-600 mb-2">{formError}</p>
        )}

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={saving || items.length < 2}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? "Guardando..." : editId ? "Actualizar" : "Crear combo"}
          </button>
          {editId && (
            <button
              onClick={resetForm}
              className="px-4 py-2 border text-gray-700 rounded-lg text-sm hover:bg-gray-50"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : combos.length === 0 ? (
        <p className="text-gray-400">No hay combos creados.</p>
      ) : (
        <div className="space-y-3">
          {combos.map((combo) => (
            <div
              key={combo.id}
              className={`bg-white rounded-lg border p-4 ${!combo.active ? "opacity-50" : ""}`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-medium text-gray-900">{combo.name}</h3>
                  {combo.description && (
                    <p className="text-xs text-gray-500">{combo.description}</p>
                  )}
                </div>
                <span className="text-lg font-bold text-green-700">
                  {formatPrice(combo.price)}
                </span>
              </div>
              <div className="text-sm text-gray-600 mb-3">
                {combo.items.map((item, i) => (
                  <span key={item.sku}>
                    {i > 0 && " + "}
                    {item.quantity > 1 && `${item.quantity}x `}
                    {item.name || item.sku}
                  </span>
                ))}
              </div>
              <div className="flex gap-2 text-sm">
                <button
                  onClick={() => startEdit(combo)}
                  className="text-brand-600 hover:underline"
                >
                  Editar
                </button>
                <button
                  onClick={() => handleToggle(combo)}
                  disabled={togglingId === combo.id}
                  className="text-amber-600 hover:underline disabled:opacity-50"
                >
                  {togglingId === combo.id ? "..." : combo.active ? "Desactivar" : "Activar"}
                </button>
                <button
                  onClick={() => setConfirmDeleteId(combo.id)}
                  disabled={deletingId === combo.id}
                  className="text-red-600 hover:underline disabled:opacity-50"
                >
                  {deletingId === combo.id ? "..." : "Eliminar"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmDeleteId !== null}
        message="¿Eliminar este combo?"
        loading={deletingId !== null}
        onConfirm={() => confirmDeleteId !== null && handleDelete(confirmDeleteId)}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
