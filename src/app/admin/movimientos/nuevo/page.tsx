"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { HiOutlineSearch, HiOutlineX, HiOutlineArrowLeft } from "react-icons/hi";

interface SearchProduct {
  sku: string;
  nombre: string;
  codbar: string;
  stock: number;
  unidad: string;
}

interface CartItem {
  sku: string;
  productName: string;
  cantidad: number;
  stock: number;
  unidad: string;
}

const DESTINOS_LOCALES = [
  "Local 1 Minorista",
  "Local 2 Envío a Vimar",
  "Local 3 Mayorista Merlo",
  "Local 4 Mayorista Pontevedra",
];

const DESTINOS_OTROS = [
  "Descuento empleados",
  "Descuento local",
  "Rotura de proveedor",
  "Rotura de empleado",
];

// All destinos used for validation on server side

export default function NuevoMovimiento() {
  const router = useRouter();
  const [destino, setDestino] = useState("");
  const [notas, setNotas] = useState("");
  const [items, setItems] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SearchProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Restore draft from sessionStorage
  useEffect(() => {
    try {
      const draft = sessionStorage.getItem("movimiento_draft");
      if (draft) {
        const d = JSON.parse(draft);
        if (d.destino) setDestino(d.destino);
        if (d.notas) setNotas(d.notas);
        if (d.items?.length) setItems(d.items);
      }
    } catch { /* ignore */ }
  }, []);

  // Save draft
  useEffect(() => {
    if (destino || items.length > 0) {
      sessionStorage.setItem("movimiento_draft", JSON.stringify({ destino, notas, items }));
    }
  }, [destino, notas, items]);

  const searchProducts = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const res = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setResults(data.products || []);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  function handleSearchChange(val: string) {
    setSearch(val);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchProducts(val), 300);
  }

  function addItem(product: SearchProduct) {
    const existing = items.find((i) => i.sku === product.sku);
    if (existing) {
      setItems((prev) =>
        prev.map((i) => i.sku === product.sku ? { ...i, cantidad: i.cantidad + 1 } : i)
      );
    } else {
      setItems((prev) => [
        ...prev,
        {
          sku: product.sku,
          productName: product.nombre,
          cantidad: 1,
          stock: product.stock,
          unidad: product.unidad,
        },
      ]);
    }
    setSearch("");
    setResults([]);
    searchRef.current?.focus();
  }

  function updateQty(sku: string, val: string) {
    const qty = parseFloat(val.replace(/,/g, ".")) || 0;
    setItems((prev) => prev.map((i) => (i.sku === sku ? { ...i, cantidad: qty } : i)));
  }

  function removeItem(sku: string) {
    setItems((prev) => prev.filter((i) => i.sku !== sku));
  }

  async function handleSubmit() {
    if (!destino) { alert("Seleccioná un destino"); return; }
    if (items.length === 0) { alert("Agregá al menos un producto"); return; }

    const invalid = items.filter((i) => i.cantidad <= 0);
    if (invalid.length > 0) { alert("Todos los productos deben tener cantidad mayor a 0"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/admin/movimientos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destino, notas, items }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al crear movimiento");
        return;
      }

      sessionStorage.removeItem("movimiento_draft");
      router.push("/admin/movimientos");
    } catch {
      alert("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => {
            if (items.length > 0 && !confirm("¿Salir? Se perderán los cambios no guardados.")) return;
            router.push("/admin/movimientos");
          }}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Nuevo Movimiento Interno</h1>
      </div>

      {/* Destino selector */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Envío a local</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {DESTINOS_LOCALES.map((d) => (
            <button
              key={d}
              onClick={() => setDestino(d)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                destino === d
                  ? "border-brand-400 bg-brand-50 text-brand-600 font-medium"
                  : "border-gray-200 hover:border-gray-300 text-gray-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Descuentos / Roturas</label>
        <div className="grid grid-cols-2 gap-2">
          {DESTINOS_OTROS.map((d) => (
            <button
              key={d}
              onClick={() => setDestino(d)}
              className={`px-3 py-2 text-sm rounded-lg border transition-colors text-left ${
                destino === d
                  ? "border-red-400 bg-red-50 text-red-600 font-medium"
                  : "border-gray-200 hover:border-gray-300 text-gray-700"
              }`}
            >
              {d}
            </button>
          ))}
        </div>
      </div>

      {/* Product search */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Buscar producto</label>
        <div className="relative">
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Nombre, SKU o código de barras..."
            className="w-full pl-10 pr-4 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-brand-400 focus:border-brand-400"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin w-4 h-4 border-2 border-brand-400 border-t-transparent rounded-full" />
            </div>
          )}
        </div>

        {/* Search results */}
        {results.length > 0 && (
          <div className="mt-2 border rounded-lg max-h-60 overflow-y-auto">
            {results.map((p) => (
              <button
                key={p.sku}
                onClick={() => addItem(p)}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0 flex items-center justify-between"
              >
                <div>
                  <span className="text-sm font-medium text-gray-800">{p.nombre}</span>
                  <span className="text-xs text-gray-400 ml-2">SKU: {p.sku}</span>
                </div>
                <span className="text-xs text-gray-500">Stock: {p.stock}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Items list */}
      {items.length > 0 && (
        <div className="bg-white border rounded-xl p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">
            Productos ({items.length})
          </h3>
          <div className="space-y-2">
            {items.map((item) => (
              <div
                key={item.sku}
                className="flex items-center gap-3 p-2 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">
                    {item.productName}
                  </p>
                  <p className="text-xs text-gray-400">
                    SKU: {item.sku} — Stock actual: {item.stock} {item.unidad}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={item.cantidad || ""}
                    onChange={(e) => updateQty(item.sku, e.target.value)}
                    min="0"
                    step={item.unidad === "KG" ? "0.001" : "1"}
                    className="w-20 text-sm text-center border rounded-lg px-2 py-1.5 focus:ring-2 focus:ring-brand-400"
                  />
                  <span className="text-xs text-gray-400 w-6">{item.unidad || "UN"}</span>
                  <button
                    onClick={() => removeItem(item.sku)}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
                  >
                    <HiOutlineX className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Notas (opcional)</label>
        <textarea
          value={notas}
          onChange={(e) => setNotas(e.target.value)}
          rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-400"
          placeholder="Observaciones sobre el movimiento..."
        />
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={saving || !destino || items.length === 0}
        className="w-full py-3 text-sm font-medium text-white bg-brand-400 rounded-xl hover:bg-brand-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {saving ? "Enviando..." : "Enviar para aprobación"}
      </button>
    </div>
  );
}
