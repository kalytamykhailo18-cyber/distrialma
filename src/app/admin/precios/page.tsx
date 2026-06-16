"use client";

import { useState, useRef } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineSearch } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, useDataReady } from "@/components/AnimateIn";
import ConfirmModal from "@/components/ConfirmModal";

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
  { key: "precio5", label: "PedidosYa" },
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
  const [hlIdx, setHlIdx] = useState(-1);
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState<Record<string, string>>({});
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const productReady = useDataReady(product);
  const [confirmAction, setConfirmAction] = useState<{ message: string; action: () => Promise<void> } | null>(null);

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
        // Use 0 as a real value (was falling through `|| ""`, which made 0
        // look empty and made saved zeros invisible to the user)
        const fmt = (n: number | null | undefined) => (n === null || n === undefined) ? "" : String(n);
        setForm({
          costo: fmt(data.product.costo),
          precio: fmt(data.product.precio),
          precio2: fmt(data.product.precio2),
          precio3: fmt(data.product.precio3),
          precio4: fmt(data.product.precio4),
          precio5: fmt(data.product.precio5),
        });
        setTimeout(() => { const el = document.getElementById("price-precio") as HTMLInputElement; if (el) { el.focus(); el.select(); } }, 300);
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

  async function handleApplyCosto() {
    if (!product) return;
    const costo = parseFloat(form.costo);
    if (!costo) return;
    try {
      const preview = await fetch("/api/admin/stock-entries/apply-similar?sku=" + product.sku).then(r => r.json());
      if (!preview.products || preview.products.length === 0) { setError("No se encontraron productos similares"); return; }
      const names = preview.products.map((p: {nombre: string}) => p.nombre).join(", ");
      setConfirmAction({
        message: `Aplicar costo $${costo} a ${preview.products.length} productos similares: ${names}`,
        action: async () => {
          const res = await fetch("/api/admin/stock-entries/apply-similar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sku: product.sku, costo }),
          });
          const data = await res.json();
          if (data.updated > 0) setSuccess("Costo aplicado a " + data.updated + " productos similares");
          else setError("No se actualizaron productos");
        },
      });
    } catch { setError("Error al aplicar a similares"); }
  }

  async function handleCloneListas() {
    if (!product) return;
    try {
      const preview = await fetch("/api/admin/stock-entries/apply-similar?sku=" + product.sku).then(r => r.json());
      if (!preview.products || preview.products.length === 0) { setError("No se encontraron productos similares"); return; }
      const names = preview.products.map((p: {nombre: string}) => p.nombre).join(", ");
      setConfirmAction({
        message: `Clonar listas a ${preview.products.length} productos similares: ${names}`,
        action: async () => {
          const res = await fetch("/api/admin/stock-entries/apply-similar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sku: product.sku, mode: "clone", precios: form }),
          });
          const data = await res.json();
          if (data.updated > 0) setSuccess("Listas clonadas a " + data.updated + " productos similares");
          else setError("No se actualizaron productos");
        },
      });
    } catch { setError("Error al clonar listas"); }
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
          costo: form.costo !== "" ? parseFloat(form.costo) : undefined,
          precio: form.precio !== "" ? parseFloat(form.precio) : undefined,
          precio2: form.precio2 !== "" ? parseFloat(form.precio2) : undefined,
          precio3: form.precio3 !== "" ? parseFloat(form.precio3) : undefined,
          precio4: form.precio4 !== "" ? parseFloat(form.precio4) : undefined,
          precio5: form.precio5 !== "" ? parseFloat(form.precio5) : undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess("Precios actualizados");
        // Update product in place — empty stays previous, 0 stays 0
        const pickNum = (v: string, fallback: number) => v === "" ? fallback : parseFloat(v);
        setProduct((prev) => prev ? {
          ...prev,
          costo: pickNum(form.costo, prev.costo),
          precio: pickNum(form.precio, prev.precio),
          precio2: pickNum(form.precio2, prev.precio2),
          precio3: pickNum(form.precio3, prev.precio3),
          precio4: pickNum(form.precio4, prev.precio4),
          precio5: pickNum(form.precio5, prev.precio5),
        } : prev);
        searchInputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        setTimeout(() => { searchInputRef.current?.focus(); }, 400);
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
    <PageTransition className="max-w-2xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-6">Actualizar Precios</h1>
      </Stagger>

      {/* Search */}
        <div className="relative mb-6" style={{ zIndex: searchResults.length > 0 ? 60 : "auto" }}>
          <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => { handleSearch(e.target.value); setHlIdx(-1); }}
            onKeyDown={(e) => {
              if (searchResults.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setHlIdx((p) => Math.min(p + 1, searchResults.length - 1)); }
                else if (e.key === "ArrowUp") { e.preventDefault(); setHlIdx((p) => Math.max(p - 1, 0)); }
                else if (e.key === "Enter" && hlIdx >= 0) { e.preventDefault(); selectProduct(searchResults[hlIdx].sku); setHlIdx(-1); }
                else if (e.key === "Escape") { setSearchResults([]); setHlIdx(-1); }
              }
            }}
            ref={searchInputRef}
            placeholder="Buscar por nombre, SKU o código de barras..."
            className="w-full pl-10 pr-4 py-2.5 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          {searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">Buscando...</span>}

          {/* Search results dropdown */}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border shadow-lg z-50 max-h-60 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={r.sku}
                  onClick={() => { selectProduct(r.sku); setHlIdx(-1); }}
                  onMouseEnter={() => setHlIdx(i)}
                  className={`w-full text-left px-4 py-2 text-sm border-b last:border-0 ${i === hlIdx ? "bg-brand-50 text-brand-700" : hoverRow}`}
                  style={staggerStyle(true, i)}
                >
                  <span className="font-medium text-gray-900">{r.name}</span>
                  <span className="text-gray-400 ml-2">SKU {r.sku}</span>
                  {r.barcode && <span className="text-gray-400 ml-2">EAN {r.barcode}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

      {loading && <LoadingCenter text="Cargando producto..." />}

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2 mb-4">{error}</p>}
      {success && <p className="text-sm text-green-600 bg-green-50 border border-green-200 rounded-xl px-3 py-2 mb-4">{success}</p>}

      {/* Product detail */}
      {product && (
        <Stagger delay={150}>
          <div className="bg-white rounded-xl border shadow-sm p-4 sm:p-6 overflow-hidden">
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
              {PRICE_FIELDS.map((field, i) => {
                const isCosto = field.key === "costo";
                return (
                  <div
                    key={field.key}
                    className={`flex flex-wrap sm:flex-nowrap items-center gap-2 sm:gap-3 ${hoverRow} rounded-lg px-2 -mx-2 py-2`}
                    style={staggerStyle(productReady, i)}
                  >
                    <span className="text-sm text-gray-700 w-20 sm:w-24 shrink-0">{field.label}</span>
                    {!isCosto && (
                      <MarginInput
                        margin={getMargin(field.key)}
                        onChange={(pct) => updateFromMargin(field.key, pct)}
                      />
                    )}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-gray-400">$</span>
                      <input
                        id={`price-${field.key}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={form[field.key] || ""}
                        onChange={(e) => updateField(field.key, e.target.value)}
                        placeholder="0"
                        className={`w-full min-w-0 text-right px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 ${
                          isCosto ? "border-brand-400 font-medium" : "border-gray-300"
                        }`}
                      />
                    </div>
                    {!isCosto && parseFloat(form[field.key] || "0") > 0 && parseFloat(form.costo || "0") > 0 && parseFloat(form[field.key] || "0") < parseFloat(form.costo || "0") && (
                      <span className="text-xs text-red-600 font-medium shrink-0">
                        ⚠ bajo costo
                      </span>
                    )}
                    {!isCosto && product[field.key as keyof Product] !== parseFloat(form[field.key] || "0") && parseFloat(form[field.key] || "0") > 0 && !(parseFloat(form[field.key] || "0") < parseFloat(form.costo || "0")) && (
                      <span className="text-xs text-amber-600 shrink-0">
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
              className={`mt-6 w-full py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50 transition-colors ${springBtn}`}
            >
              {saving ? "Guardando..." : "Guardar precios"}
            </button>
            {parseFloat(form.costo || "0") > 0 && (
              <>
                <button onClick={handleApplyCosto} disabled={saving}
                  className={`mt-3 w-full py-2.5 text-sm font-semibold text-blue-700 bg-blue-50 border-2 border-blue-200 rounded-xl hover:bg-blue-100 disabled:opacity-50 transition-colors ${springBtn}`}>
                  Aplicar costo a similares
                </button>
                <button onClick={handleCloneListas} disabled={saving}
                  className={`mt-2 w-full py-2.5 text-sm font-semibold text-green-700 bg-green-50 border-2 border-green-200 rounded-xl hover:bg-green-100 disabled:opacity-50 transition-colors ${springBtn}`}>
                  Clonar listas a similares
                </button>
              </>
            )}
          </div>
        </Stagger>
      )}
      <ConfirmModal
        open={!!confirmAction}
        message={confirmAction?.message || ""}
        onConfirm={async () => {
          if (confirmAction) {
            try { await confirmAction.action(); } catch { setError("Error"); }
          }
          setConfirmAction(null);
        }}
        onCancel={() => setConfirmAction(null)}
      />
    </PageTransition>
  );
}
