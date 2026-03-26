"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { HiOutlineArrowLeft, HiOutlineSearch } from "react-icons/hi";

function CostoSinIva({ costoConIva, ivaPct, onSync, disabled }: {
  costoConIva: string;
  ivaPct: number;
  onSync: (conIva: string) => void;
  disabled: boolean;
}) {
  const [localValue, setLocalValue] = useState("");
  const [focused, setFocused] = useState(false);

  // Update local value from parent when not focused
  useEffect(() => {
    if (!focused) {
      const c = parseFloat(costoConIva) || 0;
      setLocalValue(c > 0 ? (c / (1 + ivaPct / 100)).toFixed(2) : "");
    }
  }, [costoConIva, ivaPct, focused]);

  return (
    <div className="min-w-[150px] flex-1">
      <label className="block text-sm font-semibold text-gray-700 mb-1">Costo sin IVA</label>
      <input
        type="number"
        min="0"
        step="0.01"
        value={localValue}
        onFocus={() => setFocused(true)}
        onChange={(e) => {
          setLocalValue(e.target.value);
          const neto = parseFloat(e.target.value) || 0;
          if (neto > 0) {
            const conIva = Math.round(neto * (1 + ivaPct / 100) * 100) / 100;
            onSync(String(conIva));
          } else {
            onSync("");
          }
        }}
        onBlur={() => setFocused(false)}
        disabled={disabled}
        placeholder="0.00"
        className="w-full text-right px-3 py-1.5 border-2 border-gray-300 rounded-lg text-lg focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
      />
    </div>
  );
}

interface EntryItem {
  id: number;
  sku: string;
  productName: string;
  cantidad: number;
  costo: number | null;
  costeado: boolean;
  isNewProduct: boolean;
  precio: number;
  precio2: number;
  precio3: number;
  precio4: number;
  precio5: number;
  porceGan2: number;
  porceGan3: number;
  porceGan4: number;
  rubro?: string;
  marca?: string;
  unidad?: string;
  cantPorCaja?: number;
}

interface StockEntry {
  id: number;
  proveedorCod: string;
  proveedorName: string;
  usuario: string;
  estado: string;
  subtotal: number;
  iva: number;
  iibb: number;
  percepciones: number;
  total: number;
  notas: string | null;
  createdAt: string;
  items: EntryItem[];
}

interface CosteoRow {
  id: number;
  costo: string;
  precio: string;
  precio2: string;
  precio3: string;
  precio4: string;
  precio5: string;
}

interface NewProductRow {
  sku: string;
  rubro: string;
  marca: string;
  unidad: string;
  cantidadPorCaja: string;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function EntryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [entry, setEntry] = useState<StockEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [applyingId, setApplyingId] = useState<number | null>(null);
  const [confirmApply, setConfirmApply] = useState<{ itemId: number; sku: string; costo: number; products: { sku: string; nombre: string }[] } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Add product to pending entry
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState<{ sku: string; name: string; barcode: string }[]>([]);
  const [addSearching, setAddSearching] = useState(false);
  const [addingProduct, setAddingProduct] = useState(false);
  const addTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Invoice type
  const [invoiceType, setInvoiceType] = useState<"A" | "X">("A");

  // Tax fields
  const [taxSubtotal, setTaxSubtotal] = useState("");
  const [taxIvaPct, setTaxIvaPct] = useState("21");
  const [taxIva, setTaxIva] = useState("");
  const [taxIibbPct, setTaxIibbPct] = useState("");
  const [taxIibb, setTaxIibb] = useState("");
  const [taxPercPct, setTaxPercPct] = useState("");
  const [taxPerc, setTaxPerc] = useState("");
  const [applyResult, setApplyResult] = useState<{ message: string; products: { sku: string; nombre: string }[] } | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);

  // Costeo form state
  const [costeoRows, setCosteoRows] = useState<CosteoRow[]>([]);
  const [newProductRows, setNewProductRows] = useState<NewProductRow[]>([]);

  // Margins for auto-calculation
  const [margins, setMargins] = useState<Record<string, number>>({});

  // Rubros and Marcas for dropdowns
  const [rubros, setRubros] = useState<{ id: string; name: string }[]>([]);
  const [marcas, setMarcas] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadEntry();
    loadCatalogs();
    loadMargins();
  }, []);

  function loadMargins() {
    fetch("/api/admin/price-margins")
      .then((r) => r.json())
      .then((data) => {
        const m: Record<string, number> = {};
        for (const margin of data.margins || []) {
          m["precio" + (margin.lista === 1 ? "" : margin.lista)] = margin.margen;
        }
        setMargins(m);
      })
      .catch(() => {});
  }

  function loadEntry() {
    setLoading(true);
    fetch(`/api/admin/stock-entries/${params.id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setEntry(data.entry);
        // Initialize tax fields — if saved, use saved values; otherwise calc from items
        if (data.entry.subtotal > 0) {
          setTaxSubtotal(String(data.entry.subtotal));
          if (data.entry.iva > 0) setTaxIva(String(data.entry.iva));
          if (data.entry.iibb > 0) setTaxIibb(String(data.entry.iibb));
          if (data.entry.percepciones > 0) setTaxPerc(String(data.entry.percepciones));
        } else {
          // Auto-calculate subtotal from item costs
          let sub = 0;
          for (const item of data.entry.items) {
            const c = item.costo || 0;
            if (c > 0) sub += c * item.cantidad;
          }
          if (sub > 0) {
            setTaxSubtotal(sub.toFixed(2));
            // Auto-calculate IVA (Argentine: subtotal includes IVA)
            const ivaPct = 21;
            const neto = sub / (1 + ivaPct / 100);
            setTaxIva((sub - neto).toFixed(2));
          }
        }
        // Initialize costeo rows
        setCosteoRows(
          data.entry.items.map((item: EntryItem) => ({
            id: item.id,
            costo: item.costo != null ? String(item.costo) : "",
            precio: item.precio > 0 ? String(item.precio) : "",
            precio2: item.precio2 > 0 ? String(item.precio2) : "",
            precio3: item.precio3 > 0 ? String(item.precio3) : "",
            precio4: item.precio4 > 0 ? String(item.precio4) : "",
            precio5: item.precio5 > 0 ? String(item.precio5) : "",
          }))
        );
        // Initialize new product rows
        setNewProductRows(
          data.entry.items
            .filter((i: EntryItem) => i.isNewProduct)
            .map((item: EntryItem) => ({
              sku: item.sku,
              rubro: item.rubro || "",
              marca: item.marca || "",
              unidad: item.unidad || "",
              cantidadPorCaja: item.cantPorCaja ? String(item.cantPorCaja) : "",
            }))
        );
      })
      .catch(() => setError("Error al cargar ingreso"))
      .finally(() => setLoading(false));
  }

  function loadCatalogs() {
    // Load rubros
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => setRubros(data || []))
      .catch(() => {});
    // Load marcas
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => setMarcas(data || []))
      .catch(() => {});
  }

  function updateCosteo(id: number, value: string) {
    const costo = parseFloat(value);
    setCosteoRows((prev) => {
      const newRows = prev.map((r) => {
        if (r.id !== id) return r;
        const updated = { ...r, costo: value };
        if (!isNaN(costo) && costo > 0 && entry) {
          const item = entry.items.find((i) => i.id === id);
          if (item && item.costo && item.costo > 0) {
            for (const field of ["precio", "precio2", "precio3", "precio4", "precio5"] as const) {
              const currentPrice = item[field];
              if (currentPrice > 0) {
                updated[field] = String(Math.round(costo * currentPrice / item.costo));
              }
            }
          } else {
            for (const field of ["precio", "precio2", "precio3", "precio4", "precio5"] as const) {
              const margin = margins[field];
              if (margin && margin > 0) {
                updated[field] = String(Math.round(costo * (1 + margin / 100)));
              }
            }
          }
        }
        return updated;
      });
      // Auto-update subtotal from all items
      recalcSubtotal(newRows);
      return newRows;
    });
  }

  function recalcSubtotal(rows: CosteoRow[]) {
    if (!entry) return;
    let sub = 0;
    for (const r of rows) {
      const c = parseFloat(r.costo) || 0;
      const item = entry.items.find((i) => i.id === r.id);
      if (c > 0 && item) {
        sub += c * item.cantidad;
      }
    }
    if (sub > 0) {
      setTaxSubtotal(sub.toFixed(2));
      // Recalc taxes — Argentine logic: subtotal includes IVA, IIBB/Perc on neto
      const iPct = parseFloat(taxIvaPct) || 0;
      const neto = iPct > 0 ? sub / (1 + iPct / 100) : sub;
      const ivaAmount = sub - neto;
      if (iPct > 0) setTaxIva(ivaAmount.toFixed(2));
      const bPct = parseFloat(taxIibbPct) || 0;
      if (bPct > 0) setTaxIibb((neto * bPct / 100).toFixed(2));
      const pPct = parseFloat(taxPercPct) || 0;
      if (pPct > 0) setTaxPerc((neto * pPct / 100).toFixed(2));
    }
  }

  function updateNewProduct(sku: string, field: keyof NewProductRow, value: string) {
    setNewProductRows((prev) =>
      prev.map((r) => (r.sku === sku ? { ...r, [field]: value } : r))
    );
  }


  async function handleCosteo() {
    if (!entry) return;

    // Validate: at least one cost
    const validItems = costeoRows.filter(
      (r) => r.costo.trim() !== "" && parseFloat(r.costo) > 0
    );
    if (validItems.length === 0) {
      setError("Ingresá al menos un costo");
      return;
    }

    setError("");
    setSuccess("");
    setSaving(true);

    try {
      const res = await fetch(`/api/admin/stock-entries/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: costeoRows
            .filter((r) => r.costo.trim() !== "" && parseFloat(r.costo) > 0)
            .map((r) => ({
              id: r.id,
              costo: parseFloat(r.costo),
              precio: r.precio ? parseFloat(r.precio) : undefined,
              precio2: r.precio2 ? parseFloat(r.precio2) : undefined,
              precio3: r.precio3 ? parseFloat(r.precio3) : undefined,
              precio4: r.precio4 ? parseFloat(r.precio4) : undefined,
              precio5: r.precio5 ? parseFloat(r.precio5) : undefined,
            })),
          newProductData: newProductRows.length > 0 ? newProductRows : undefined,
          subtotal: parseFloat(taxSubtotal) || 0,
          iva: invoiceType === "A" ? (parseFloat(taxIva) || 0) : 0,
          iibb: invoiceType === "A" ? (parseFloat(taxIibb) || 0) : 0,
          percepciones: invoiceType === "A" ? (parseFloat(taxPerc) || 0) : 0,
          total: invoiceType === "A"
            ? (parseFloat(taxSubtotal) || 0) + (parseFloat(taxIibb) || 0) + (parseFloat(taxPerc) || 0)
            : (parseFloat(taxSubtotal) || 0),
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");

      setSuccess(
        data.allCosteado
          ? "Costeo completado. Todos los items costeados."
          : "Costos actualizados."
      );

      // Reload
      loadEntry();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar costeo");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!entry) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-red-600">{error || "Ingreso no encontrado"}</p>
      </div>
    );
  }

  const isPendiente = entry.estado === "pendiente";

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Back */}
      <button
        onClick={() => router.push("/admin/compras")}
        className="flex items-center gap-2 text-base text-gray-600 hover:text-brand-600 mb-5 transition-colors font-medium"
      >
        <HiOutlineArrowLeft className="w-5 h-5" />
        Volver a compras
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Ingreso #{entry.id}
          </h1>
          <div className="text-base text-gray-600 mt-2 space-y-1">
            <p><span className="font-semibold">Proveedor:</span> {entry.proveedorName}</p>
            <p><span className="font-semibold">Fecha:</span> {formatDate(entry.createdAt)}</p>
            <p><span className="font-semibold">Usuario:</span> {entry.usuario}</p>
            {entry.notas && <p><span className="font-semibold">Notas:</span> {entry.notas}</p>}
          </div>
        </div>
        <span
          className={`text-base px-4 py-1.5 rounded-full font-bold ${
            entry.estado === "costeado"
              ? "bg-green-100 text-green-700 border-2 border-green-300"
              : "bg-amber-100 text-amber-700 border-2 border-amber-300"
          }`}
        >
          {entry.estado === "costeado" ? "Costeado" : "Pendiente"}
        </span>
      </div>

      {/* Total */}
      {entry.total > 0 && (
        <div className="mb-5 bg-blue-50 rounded-lg border-2 border-blue-200 p-5">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-base">
            <div>
              <span className="text-gray-600 text-sm font-semibold block">Subtotal</span>
              <span className="font-medium text-gray-900">{formatPrice(entry.subtotal)}</span>
            </div>
            <div>
              <span className="text-gray-600 text-sm font-semibold block">IVA</span>
              <span className="font-medium text-gray-900">{entry.iva > 0 ? formatPrice(entry.iva) : "—"}</span>
            </div>
            <div>
              <span className="text-gray-600 text-sm font-semibold block">IIBB</span>
              <span className="font-medium text-gray-900">{entry.iibb > 0 ? formatPrice(entry.iibb) : "—"}</span>
            </div>
            <div>
              <span className="text-gray-600 text-sm font-semibold block">Percepciones</span>
              <span className="font-medium text-gray-900">{entry.percepciones > 0 ? formatPrice(entry.percepciones) : "—"}</span>
            </div>
            <div>
              <span className="text-gray-600 text-sm font-semibold block">Total</span>
              <span className="font-bold text-lg text-gray-900">{formatPrice(entry.total)}</span>
            </div>
          </div>
        </div>
      )}

      {/* Add product to pending entry */}
      {isPendiente && (
        <div className="mb-5">
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={addQuery}
              onChange={(e) => {
                setAddQuery(e.target.value);
                clearTimeout(addTimeout.current);
                if (e.target.value.trim().length < 2) { setAddResults([]); return; }
                setAddSearching(true);
                addTimeout.current = setTimeout(() => {
                  fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(e.target.value.trim())}`)
                    .then((r) => r.json())
                    .then((data) => setAddResults(data.products || []))
                    .catch(() => setAddResults([]))
                    .finally(() => setAddSearching(false));
                }, 300);
              }}
              placeholder="Agregar producto al ingreso..."
              disabled={addingProduct}
              className="w-full pl-10 pr-4 py-1.5 border-2 border-brand-400 rounded-lg text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
            />
            {addSearching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">...</span>}
          </div>
          {addResults.length > 0 && (
            <div className="bg-white border-2 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
              {addResults.map((p) => (
                <button
                  key={p.sku}
                  disabled={addingProduct || entry.items.some((i) => i.sku === p.sku)}
                  onClick={async () => {
                    setAddingProduct(true);
                    try {
                      const res = await fetch(`/api/admin/stock-entries/${params.id}`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ sku: p.sku, productName: p.name, cantidad: 1 }),
                      });
                      if (res.ok) {
                        setAddQuery("");
                        setAddResults([]);
                        loadEntry();
                      }
                    } catch { /* ignore */ }
                    setAddingProduct(false);
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-gray-50 text-base border-b last:border-0 disabled:opacity-30"
                >
                  <span className="text-gray-900 font-medium">{p.name}</span>
                  <span className="text-gray-500 text-sm ml-2">SKU {p.sku}</span>
                  {entry.items.some((i) => i.sku === p.sku) && <span className="text-sm text-green-600 ml-2 font-medium">ya agregado</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Items cards */}
      <div className="space-y-6 mb-8">
        {entry.items.map((item) => {
          const costeoRow = costeoRows.find((r) => r.id === item.id);
          const priceFields = [
            { field: "precio" as const, label: "Minorista" },
            { field: "precio2" as const, label: "Mayorista" },
            { field: "precio3" as const, label: "Especial" },
            { field: "precio4" as const, label: "Caja" },
            { field: "precio5" as const, label: "Lista 5" },
          ];

          return (
            <div key={item.id} className="bg-white rounded-lg border-2">
              {/* Header row */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3 border-b-2 bg-green-50 rounded-t-lg">
                <span className="text-lg font-bold text-gray-900">{item.productName}</span>
                {item.isNewProduct && (
                  <span className="text-sm px-2.5 py-1 bg-blue-100 text-blue-700 rounded font-semibold">
                    Nuevo
                  </span>
                )}
                <span className="text-base text-gray-500">SKU {item.sku}</span>
                {isPendiente && !item.costeado ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-600">Cant:</span>
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={item.cantidad}
                      onChange={(e) => {
                        // Update locally first
                        const newCant = parseFloat(e.target.value) || 0;
                        setEntry((prev) => prev ? {
                          ...prev,
                          items: prev.items.map((i) => i.id === item.id ? { ...i, cantidad: newCant } : i),
                        } : prev);
                      }}
                      onBlur={async (e) => {
                        // Save to server on blur
                        const newCant = parseFloat(e.target.value) || 0;
                        if (newCant <= 0) return;
                        try {
                          await fetch(`/api/admin/stock-entries/${params.id}`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ itemId: item.id, cantidad: newCant, updateQty: true }),
                          });
                        } catch { /* ignore */ }
                      }}
                      className="w-20 text-right px-2 py-1.5 border-2 border-gray-300 rounded text-base focus:outline-none focus:border-brand-600"
                    />
                  </div>
                ) : (
                  <span className="text-base text-gray-600 font-medium">Cant: {item.cantidad}</span>
                )}
                {item.costeado ? (
                  <span className="text-sm text-green-700 font-bold bg-green-100 px-3 py-1 rounded border border-green-300">OK</span>
                ) : (
                  <span className="text-sm text-amber-700 font-bold bg-amber-100 px-3 py-1 rounded border border-amber-300">Pend.</span>
                )}
                {isPendiente && !item.costeado && (
                  <button
                    onClick={async () => {
                      if (!entry) return;
                      setDeletingItemId(item.id);
                      try {
                        const res = await fetch(`/api/admin/stock-entries/${params.id}`, {
                          method: "DELETE",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ itemId: item.id }),
                        });
                        if (res.ok) loadEntry();
                      } catch { /* ignore */ }
                      finally { setDeletingItemId(null); }
                    }}
                    disabled={deletingItemId === item.id}
                    className="ml-auto px-4 py-2 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {deletingItemId === item.id ? "..." : "Quitar"}
                  </button>
                )}
              </div>

              {/* Costo — sin IVA / con IVA */}
              {(() => {
                const costoConIvaVal = parseFloat(costeoRow?.costo || "") || (item.costo || 0);
                const ivaPctVal = parseFloat(taxIvaPct) || 21;
                const costoSinIvaVal = costoConIvaVal > 0 ? costoConIvaVal / (1 + ivaPctVal / 100) : 0;
                const subSinIva = costoSinIvaVal * item.cantidad;
                const subConIva = costoConIvaVal * item.cantidad;
                return (
                  <div className="px-5 pb-4 pt-3">
                    {isPendiente && !item.costeado ? (
                      <>
                        <div className="flex flex-wrap gap-3">
                          <CostoSinIva
                            costoConIva={costeoRow?.costo || ""}
                            ivaPct={ivaPctVal}
                            onSync={(conIva) => updateCosteo(item.id, conIva)}
                            disabled={saving}
                          />
                          <div className="min-w-[150px] flex-1">
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Costo con IVA</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={costeoRow?.costo || ""}
                              onChange={(e) => updateCosteo(item.id, e.target.value)}
                              disabled={saving}
                              placeholder={item.costo != null && item.costo > 0 ? String(item.costo) : "0.00"}
                              className="w-full text-right px-3 py-1.5 border-2 border-brand-400 rounded-lg text-lg font-medium focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                            />
                          </div>
                        </div>
                        {costoConIvaVal > 0 && item.cantidad > 1 && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            <div className="text-sm text-gray-600 text-right bg-gray-50 rounded px-2 py-1.5">
                              Subtotal s/IVA: <span className="font-semibold">{formatPrice(subSinIva)}</span>
                            </div>
                            <div className="text-sm text-gray-800 text-right bg-amber-50 rounded px-2 py-1.5 font-semibold">
                              Subtotal c/IVA: {formatPrice(subConIva)}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <div>
                        <label className="block text-sm font-semibold text-gray-700 mb-1">Costo</label>
                        <span className="block text-right text-gray-900 text-base font-medium">
                          {item.costo != null ? formatPrice(item.costo) : "—"}
                        </span>
                      </div>
                )}
                  </div>
                );
              })()}

              {/* Prices grid */}
              {isPendiente && (
                <div className="px-5 pb-4">
                  <div className="flex flex-wrap gap-3">
                    {priceFields.map(({ field, label }) => {
                      const costoVal = parseFloat(costeoRow?.costo || "0");
                      const priceVal = parseFloat(costeoRow?.[field] || "0");
                      const currentMargin = costoVal > 0 && priceVal > 0 ? ((priceVal / costoVal - 1) * 100).toFixed(2) : "";

                      return (
                        <div key={field} className="bg-gray-50 rounded-lg p-3 border min-w-[150px] flex-1">
                          <label className="block text-sm font-medium text-gray-700 mb-1.5">{label}</label>
                          {!item.costeado ? (
                            <div className="space-y-2">
                              <div className="relative">
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={currentMargin}
                                  onChange={(e) => {
                                    const pct = parseFloat(e.target.value);
                                    const c = parseFloat(costeoRow?.costo || "0");
                                    if (!isNaN(pct) && c > 0) {
                                      const newPrice = String(Math.round(c * (1 + pct / 100)));
                                      setCosteoRows((prev) =>
                                        prev.map((r) => r.id === item.id ? { ...r, [field]: newPrice } : r)
                                      );
                                    }
                                  }}
                                  disabled={saving}
                                  className="w-full text-right pr-7 pl-3 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                                />
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                              </div>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={costeoRow?.[field] || ""}
                                onChange={(e) => {
                                  setCosteoRows((prev) =>
                                    prev.map((r) => r.id === item.id ? { ...r, [field]: e.target.value } : r)
                                  );
                                }}
                                disabled={saving}
                                placeholder={item[field] > 0 ? String(item[field]) : "0.00"}
                                className="w-full text-right px-3 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                              />
                            </div>
                          ) : (
                            <span className="block text-right text-gray-900 text-base font-medium">{formatPrice(item[field])}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Aplicar a similares */}
              {isPendiente && !item.isNewProduct && costeoRow?.costo && parseFloat(costeoRow.costo) > 0 && (
                <div className="border-t-2 px-5 py-3">
                  <button
                    onClick={async () => {
                      setLoadingPreview(true);
                      try {
                        const res = await fetch(`/api/admin/stock-entries/apply-similar?sku=${item.sku}`);
                        const data = await res.json();
                        if (data.products?.length > 0) {
                          setConfirmApply({ itemId: item.id, sku: item.sku, costo: parseFloat(costeoRow.costo), products: data.products });
                        } else {
                          setApplyResult({ message: "No se encontraron productos similares", products: [] });
                        }
                      } catch {
                        setApplyResult({ message: "Error al buscar similares", products: [] });
                      } finally {
                        setLoadingPreview(false);
                      }
                    }}
                    disabled={saving || applyingId === item.id || loadingPreview}
                    className="w-full py-2.5 text-sm font-semibold text-blue-700 bg-blue-50 border-2 border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition-colors"
                  >
                    {applyingId === item.id ? "Aplicando..." : "Aplicar a similares"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* New product extra fields */}
      {isPendiente && newProductRows.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-bold text-gray-800 mb-4">
            Datos de productos nuevos
          </h2>
          <div className="space-y-4">
            {newProductRows.map((np) => {
              const item = entry.items.find((i) => i.sku === np.sku);
              return (
                <div
                  key={np.sku}
                  className="bg-blue-50 rounded-lg border-2 border-blue-200 p-5"
                >
                  <p className="text-base font-bold text-gray-900 mb-3">
                    {item?.productName} <span className="text-gray-500 font-medium">(SKU: {np.sku})</span>
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Rubro
                      </label>
                      <select
                        value={np.rubro}
                        onChange={(e) =>
                          updateNewProduct(np.sku, "rubro", e.target.value)
                        }
                        disabled={saving}
                        className="w-full px-3 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                      >
                        <option value="">—</option>
                        {rubros.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Marca
                      </label>
                      <select
                        value={np.marca}
                        onChange={(e) =>
                          updateNewProduct(np.sku, "marca", e.target.value)
                        }
                        disabled={saving}
                        className="w-full px-3 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                      >
                        <option value="">—</option>
                        {marcas.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Unidad
                      </label>
                      <input
                        type="text"
                        value={np.unidad}
                        onChange={(e) =>
                          updateNewProduct(np.sku, "unidad", e.target.value)
                        }
                        disabled={saving}
                        placeholder="Ej: UN, KG"
                        className="w-full px-3 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        Cant. por caja
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={np.cantidadPorCaja}
                        onChange={(e) =>
                          updateNewProduct(
                            np.sku,
                            "cantidadPorCaja",
                            e.target.value
                          )
                        }
                        disabled={saving}
                        placeholder="0"
                        className="w-full px-3 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Error / Success */}
      {error && <p className="text-base font-semibold text-red-600 mb-5 bg-red-50 border-2 border-red-200 rounded-lg px-4 py-3">{error}</p>}
      {success && <p className="text-base font-semibold text-green-700 mb-5 bg-green-50 border-2 border-green-200 rounded-lg px-4 py-3">{success}</p>}

      {applyResult && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-lg px-4 py-3 mb-5">
          <p className="text-base text-blue-700 font-semibold">{applyResult.message}</p>
          {applyResult.products.length > 0 && (
            <ul className="mt-2 text-sm text-blue-600 space-y-1 max-h-48 overflow-y-auto">
              {applyResult.products.map((p) => (
                <li key={p.sku}>• {p.nombre} (SKU {p.sku})</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Invoice type toggle + taxes */}
      {isPendiente && (
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => setInvoiceType("A")}
            className={`px-5 py-2 rounded-lg text-base font-bold border-2 transition-colors ${
              invoiceType === "A"
                ? "bg-brand-400 text-white border-brand-400"
                : "bg-white text-gray-600 border-gray-300 hover:border-brand-400"
            }`}
          >
            Factura A
          </button>
          <button
            onClick={() => setInvoiceType("X")}
            className={`px-5 py-2 rounded-lg text-base font-bold border-2 transition-colors ${
              invoiceType === "X"
                ? "bg-brand-400 text-white border-brand-400"
                : "bg-white text-gray-600 border-gray-300 hover:border-brand-400"
            }`}
          >
            Factura X
          </button>
        </div>
      )}
      {isPendiente && invoiceType === "A" && (() => {
        const sub = parseFloat(taxSubtotal) || 0;
        const ivaPctVal = parseFloat(taxIvaPct) || 0;
        const neto = ivaPctVal > 0 ? sub / (1 + ivaPctVal / 100) : sub;
        const iibbPctVal = parseFloat(taxIibbPct) || 0;
        const percPctVal = parseFloat(taxPercPct) || 0;
        const iibbCalc = neto * iibbPctVal / 100;
        const percCalc = neto * percPctVal / 100;
        const total = sub + iibbCalc + percCalc;

        function recalcAll(newSub: string, newIvaPct: string, newIibbPct: string, newPercPct: string) {
          const s = parseFloat(newSub) || 0;
          const ip = parseFloat(newIvaPct) || 0;
          const n = ip > 0 ? s / (1 + ip / 100) : s;
          const ivaVal = s - n;
          setTaxIva(ivaVal > 0 ? ivaVal.toFixed(2) : "");
          const bp = parseFloat(newIibbPct) || 0;
          setTaxIibb(bp > 0 && n > 0 ? (n * bp / 100).toFixed(2) : "");
          const pp = parseFloat(newPercPct) || 0;
          setTaxPerc(pp > 0 && n > 0 ? (n * pp / 100).toFixed(2) : "");
        }

        return (
          <div className="bg-white rounded-lg border-2 p-5 mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Datos de la factura</h3>
            <div className="space-y-4">
              {/* Subtotal (con IVA) */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Subtotal (con IVA)</label>
                <input type="number" min="0" step="0.01" value={taxSubtotal}
                  onChange={(e) => {
                    setTaxSubtotal(e.target.value);
                    recalcAll(e.target.value, taxIvaPct, taxIibbPct, taxPercPct);
                  }}
                  disabled={saving}
                  placeholder="0.00"
                  className="w-full text-right px-3 py-1.5 border-2 border-brand-400 rounded-lg text-base focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                />
              </div>

              {/* Neto (sin IVA) — calculated, read-only */}
              {sub > 0 && (
                <div className="flex justify-between items-center text-base text-gray-600 px-1 bg-gray-50 rounded py-2">
                  <span className="font-semibold">Neto (sin IVA)</span>
                  <span className="font-bold">$ {neto.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}

              {/* IVA / IIBB / Perc */}
              <div className="flex flex-wrap gap-3">
                {/* IVA */}
                <div className="bg-gray-50 rounded-lg p-3 border min-w-[150px] flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">IVA</label>
                  <div className="relative mb-2">
                    <input type="number" min="0" step="0.01" value={taxIvaPct}
                      onChange={(e) => {
                        setTaxIvaPct(e.target.value);
                        recalcAll(taxSubtotal, e.target.value, taxIibbPct, taxPercPct);
                      }}
                      disabled={saving}
                      className="w-full text-right pr-7 pl-2 py-2 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                  </div>
                  <input type="number" min="0" step="0.01" value={taxIva}
                    onChange={(e) => setTaxIva(e.target.value)}
                    disabled={saving} placeholder="0.00"
                    className="w-full text-right px-2 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                  />
                </div>
                {/* IIBB — on neto */}
                <div className="bg-gray-50 rounded-lg p-3 border min-w-[150px] flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">IIBB</label>
                  <div className="relative mb-2">
                    <input type="number" min="0" step="0.01" value={taxIibbPct}
                      onChange={(e) => {
                        setTaxIibbPct(e.target.value);
                        recalcAll(taxSubtotal, taxIvaPct, e.target.value, taxPercPct);
                      }}
                      disabled={saving}
                      className="w-full text-right pr-7 pl-2 py-2 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                  </div>
                  <input type="number" min="0" step="0.01" value={taxIibb}
                    onChange={(e) => setTaxIibb(e.target.value)}
                    disabled={saving} placeholder="0.00"
                    className="w-full text-right px-2 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                  />
                </div>
                {/* Perc IVA — on neto */}
                <div className="bg-gray-50 rounded-lg p-3 border min-w-[150px] flex-1">
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Perc.</label>
                  <div className="relative mb-2">
                    <input type="number" min="0" step="0.01" value={taxPercPct}
                      onChange={(e) => {
                        setTaxPercPct(e.target.value);
                        recalcAll(taxSubtotal, taxIvaPct, taxIibbPct, e.target.value);
                      }}
                      disabled={saving}
                      className="w-full text-right pr-7 pl-2 py-2 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-gray-400 pointer-events-none">%</span>
                  </div>
                  <input type="number" min="0" step="0.01" value={taxPerc}
                    onChange={(e) => setTaxPerc(e.target.value)}
                    disabled={saving} placeholder="0.00"
                    className="w-full text-right px-2 py-1.5 border-2 border-gray-300 rounded-lg text-base focus:outline-none focus:border-brand-600 disabled:opacity-50 disabled:bg-gray-100"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-between items-center mt-4 pt-4 border-t-2">
              <span className="text-base font-bold text-gray-800">Total factura</span>
              <span className="text-2xl font-bold text-gray-900">
                $ {total.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        );
      })()}

      {/* Factura X — just total, no tax breakdown */}
      {isPendiente && invoiceType === "X" && (
        <div className="bg-white rounded-lg border-2 p-5 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-base font-bold text-gray-800">Total factura</span>
            <span className="text-2xl font-bold text-gray-900">
              $ {(parseFloat(taxSubtotal) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Costeo button */}
      {isPendiente && (
        <button
          onClick={handleCosteo}
          disabled={saving}
          className="w-full sm:w-auto px-8 py-3 text-lg font-bold text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
        >
          {saving ? "Guardando costeo..." : "Confirmar costeo"}
        </button>
      )}

      {/* Apply similar confirmation modal */}
      {confirmApply && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setConfirmApply(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-lg shadow-xl p-6 w-[420px] max-w-[90vw] max-h-[80vh] overflow-y-auto">
            <h3 className="text-base font-bold text-gray-900 mb-2">Aplicar costo ${confirmApply.costo} a similares</h3>
            <p className="text-sm text-gray-500 mb-3">Se actualizará el costo y se recalcularán los precios manteniendo los márgenes actuales en estos {confirmApply.products.length} productos:</p>
            <ul className="space-y-1 mb-4 max-h-48 overflow-y-auto">
              {confirmApply.products.map((p) => (
                <li key={p.sku} className="text-sm text-gray-700 py-1 px-2 bg-gray-50 rounded">
                  {p.nombre} <span className="text-gray-400">({p.sku})</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmApply(null)}
                disabled={applyingId !== null}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  setApplyingId(confirmApply.itemId);
                  setApplyResult(null);
                  const data_sku = confirmApply.sku;
                  const data_costo = confirmApply.costo;
                  setConfirmApply(null);
                  try {
                    const res = await fetch("/api/admin/stock-entries/apply-similar", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ sku: data_sku, costo: data_costo }),
                    });
                    const data = await res.json();
                    if (data.updated > 0) {
                      setApplyResult({
                        message: `${data.updated} productos actualizados`,
                        products: data.products || [],
                      });
                    } else {
                      setApplyResult({ message: "No se encontraron productos similares", products: [] });
                    }
                  } catch {
                    setApplyResult({ message: "Error al aplicar", products: [] });
                  } finally {
                    setApplyingId(null);
                  }
                }}
                disabled={applyingId !== null}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {applyingId !== null ? "Aplicando..." : "Confirmar"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
