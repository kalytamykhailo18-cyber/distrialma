"use client";

import { useState, useRef } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineSearch } from "react-icons/hi";

interface Product {
  sku: string;
  nombre: string;
  barcode: string;
  unidad: string;
  rubro: string;
  marca: string;
  costo: number;
  precio: number;
  precio2: number;
  precio3: number;
  precio4: number;
  precio5: number;
  stock: number;
}

interface SearchResult {
  sku: string;
  name: string;
  barcode: string;
  stock: number;
}

const PRICE_FIELDS = [
  { key: "costo", label: "Costo" },
  { key: "precio", label: "Minorista" },
  { key: "precio2", label: "Mayorista" },
  { key: "precio3", label: "Especial" },
  { key: "precio4", label: "Caja Cerrada" },
  { key: "precio5", label: "Lista 5" },
] as const;

function MarginInput({ margin, onChange }: { margin: string; onChange: (val: string) => void }) {
  const [local, setLocal] = useState(margin);
  const [focused, setFocused] = useState(false);

  const displayVal = focused ? local : margin;

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min="0"
        step="0.01"
        placeholder="%"
        value={displayVal}
        onChange={(e) => { setLocal(e.target.value); onChange(e.target.value); }}
        onFocus={() => { setFocused(true); setLocal(margin); }}
        onBlur={() => setFocused(false)}
        className="w-16 text-right px-2 py-1.5 border border-gray-200 rounded text-xs text-gray-500 focus:outline-none focus:border-brand-600"
      />
      <span className="text-xs text-gray-400">%</span>
    </div>
  );
}

export default function PreciosPage() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  function handleSearch(value: string) {
    setQuery(value);
    clearTimeout(timerRef.current);
    if (!value.trim()) {
      setSearchResults([]);
      return;
    }
    timerRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        setSearchResults(data.products || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function selectProduct(sku: string) {
    setSearchResults([]);
    setQuery("");
    setLoading(true);
    setProduct(null);
    setSuccess("");
    setError("");
    try {
      const res = await fetch(`/api/admin/precios?sku=${sku}`);
      const data = await res.json();
      if (data.product) {
        setProduct(data.product);
        setForm({
          costo: String(data.product.costo || ""),
          precio: String(data.product.precio || ""),
          precio2: String(data.product.precio2 || ""),
          precio3: String(data.product.precio3 || ""),
          precio4: String(data.product.precio4 || ""),
          precio5: String(data.product.precio5 || ""),
        });
      } else {
        setError(data.error || "Producto no encontrado");
      }
    } catch {
      setError("Error al buscar producto");
    } finally {
      setLoading(false);
    }
  }

  function updateField(key: string, value: string) {
    const newForm = { ...form, [key]: value };

    // If costo changed, recalculate prices maintaining margins
    if (key === "costo" && product) {
      const newCosto = parseFloat(value);
      const oldCosto = product.costo;
      if (!isNaN(newCosto) && newCosto > 0 && oldCosto > 0) {
        for (const f of ["precio", "precio2", "precio3", "precio4", "precio5"]) {
          const oldPrice = product[f as keyof Product] as number;
          if (oldPrice > 0) {
            newForm[f] = String(Math.round(newCosto * oldPrice / oldCosto));
          }
        }
      }
    }

    setForm(newForm);
  }

  function getMargin(priceKey: string): string {
    const costo = parseFloat(form.costo || "0");
    const price = parseFloat(form[priceKey] || "0");
    if (costo > 0 && price > 0) {
      return ((price / costo - 1) * 100).toFixed(2);
    }
    return "";
  }

  function updateFromMargin(priceKey: string, pctStr: string) {
    const pct = parseFloat(pctStr);
    const costo = parseFloat(form.costo || "0");
    if (!isNaN(pct) && costo > 0) {
      setForm((prev) => ({ ...prev, [priceKey]: String(Math.round(costo * (1 + pct / 100))) }));
    }
  }

  async function handleSave() {
    if (!product) return;
    setSaving(true);
    setSuccess("");
    setError("");
    try {
      const res = await fetch("/api/admin/precios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: product.sku,
          costo: form.costo ? parseFloat(form.costo) : undefined,
          precio: form.precio ? parseFloat(form.precio) : undefined,
          precio2: form.precio2 ? parseFloat(form.precio2) : undefined,
          precio3: form.precio3 ? parseFloat(form.precio3) : undefined,
          precio4: form.precio4 ? parseFloat(form.precio4) : undefined,
          precio5: form.precio5 ? parseFloat(form.precio5) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Precios actualizados");
        // Refresh product data
        selectProduct(product.sku);
      } else {
        setError(data.error || "Error al guardar");
      }
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Actualizar Precios</h1>

      {/* Search */}
      <div className="relative mb-6">
        <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-500" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Buscar por nombre, SKU o código de barras..."
          className="w-full pl-10 pr-4 py-2.5 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        />
        {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Buscando...</span>}

        {/* Search results dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-lg border shadow-lg z-50 max-h-60 overflow-y-auto">
            {searchResults.map((r) => (
              <button
                key={r.sku}
                onClick={() => selectProduct(r.sku)}
                className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b last:border-0"
              >
                <span className="font-medium text-gray-900">{r.name}</span>
                <span className="text-gray-400 ml-2">SKU {r.sku}</span>
                {r.barcode && <span className="text-gray-400 ml-2">EAN {r.barcode}</span>}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading && <p className="text-gray-400">Cargando producto...</p>}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-4">{success}</p>}

      {/* Product detail */}
      {product && (
        <div className="bg-white rounded-lg border p-6">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-gray-900">{product.nombre}</h2>
            <p className="text-sm text-gray-500">
              SKU {product.sku}
              {product.barcode && <span className="ml-3">EAN {product.barcode}</span>}
              {product.marca && <span className="ml-3">{product.marca}</span>}
              {product.rubro && <span className="ml-3">{product.rubro}</span>}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Stock: {product.stock} {product.unidad || "UN"}
            </p>
          </div>

          <div className="space-y-3">
            {PRICE_FIELDS.map((field) => {
              const isCosto = field.key === "costo";
              return (
                <div key={field.key} className="flex items-center gap-3">
                  <span className="text-sm text-gray-700 w-24">{field.label}</span>
                  {!isCosto && (
                    <MarginInput
                      margin={getMargin(field.key)}
                      onChange={(pct) => updateFromMargin(field.key, pct)}
                    />
                  )}
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-gray-400">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form[field.key] || ""}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder="0"
                      className={`flex-1 text-right px-3 py-2 border rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 ${
                        isCosto ? "border-brand-400 font-medium" : "border-gray-300"
                      }`}
                    />
                  </div>
                  {!isCosto && product[field.key as keyof Product] !== parseFloat(form[field.key] || "0") && parseFloat(form[field.key] || "0") > 0 && (
                    <span className="text-xs text-amber-600">
                      era {formatPrice(product[field.key as keyof Product] as number)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="mt-6 w-full py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 transition-colors"
          >
            {saving ? "Guardando..." : "Guardar precios"}
          </button>
        </div>
      )}
    </div>
  );
}
