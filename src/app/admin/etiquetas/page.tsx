"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import type { Product } from "@/types";
import type { LabelFormat, LabelProduct } from "@/lib/label-pdf";
import ConfirmModal from "@/components/ConfirmModal";
import { FORMAT_LABELS } from "@/lib/label-pdf";

interface SelectedProduct {
  product: Product;
  quantity: number;
}

interface PriceChange {
  id: number;
  sku: string;
  name: string;
  field: string;
  oldPrice: string;
  newPrice: string;
  detectedAt: string;
}

const FIELD_LABELS: Record<string, string> = {
  precio: "Minorista",
  precio2: "Mayorista",
  precio4: "Caja Cerrada",
};

export default function EtiquetasPage() {
  const { data: session } = useSession();
  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const isMinorista = user?.permissions?.includes("minorista") ?? false;
  const [format, setFormat] = useState<LabelFormat>("gondola");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

  // Barcode input
  const [barcode, setBarcode] = useState("");
  const [barcodeLoading, setBarcodeLoading] = useState(false);

  // Brand filter
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);
  const [selectedBrand, setSelectedBrand] = useState("");
  const [brandProducts, setBrandProducts] = useState<Product[]>([]);
  const [loadingBrand, setLoadingBrand] = useState(false);

  // Price tracking state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ scanned: number; changes: number; isFirstScan: boolean } | null>(null);
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [loadingChanges, setLoadingChanges] = useState(false);
  const [lastScanDate, setLastScanDate] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    loadPriceChanges();
  }, []);

  async function loadPriceChanges() {
    setLoadingChanges(true);
    try {
      const res = await fetch("/api/admin/price-changes?days=30");
      const data = await res.json();
      setPriceChanges(data.changes || []);
      if (data.changes && data.changes.length > 0) {
        setLastScanDate(data.changes[0].detectedAt);
      }
    } catch {
      setPriceChanges([]);
    } finally {
      setLoadingChanges(false);
    }
  }

  async function runPriceScan() {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/admin/price-scan", { method: "POST" });
      const data = await res.json();
      setScanResult(data);
      setLastScanDate(new Date().toISOString());
      await loadPriceChanges();
    } catch {
      alert("Error al escanear precios");
    } finally {
      setScanning(false);
    }
  }

  async function addChangedProducts() {
    // Get unique SKUs from price changes
    const skus = Array.from(new Set(priceChanges.map((c) => c.sku)));
    const newSelected = [...selected];
    for (const sku of skus) {
      if (newSelected.find((s) => s.product.sku === sku)) continue;
      try {
        const res = await fetch(`/api/products/${encodeURIComponent(sku)}`);
        if (!res.ok) continue;
        const product = await res.json();
        newSelected.push({ product, quantity: 1 });
      } catch {
        // skip if product not found
      }
    }
    setSelected(newSelected);
  }

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => setBrands(data || []))
      .catch(() => setBrands([]));
  }, []);

  async function handleBarcode() {
    if (!barcode.trim()) return;
    setBarcodeLoading(true);
    try {
      const res = await fetch(`/api/products?search=${encodeURIComponent(barcode.trim())}&limit=1`);
      const data = await res.json();
      if (data.products && data.products.length > 0) {
        addProduct(data.products[0]);
        setBarcode("");
      } else {
        alert("Producto no encontrado con ese código de barras");
      }
    } catch {
      alert("Error al buscar");
    } finally {
      setBarcodeLoading(false);
    }
  }

  async function handleBrandFilter(brandId: string) {
    setSelectedBrand(brandId);
    if (!brandId) { setBrandProducts([]); return; }
    setLoadingBrand(true);
    try {
      const res = await fetch(`/api/products?brand=${brandId}&limit=100`);
      const data = await res.json();
      setBrandProducts(data.products || []);
    } catch {
      setBrandProducts([]);
    } finally {
      setLoadingBrand(false);
    }
  }

  function handleSearch(value: string) {
    setSearch(value);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!value.trim()) {
      setResults([]);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/products?search=${encodeURIComponent(value)}&limit=10`);
        const data = await res.json();
        setResults(data.products || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }

  async function clearPriceChanges() {
    setClearing(true);
    await fetch("/api/admin/price-changes", { method: "DELETE" });
    setPriceChanges([]);
    setScanResult(null);
    setLastScanDate(null);
    setClearing(false);
    setShowClearConfirm(false);
  }

  function addProduct(product: Product) {
    if (selected.find((s) => s.product.sku === product.sku)) return;
    setSelected([...selected, { product, quantity: 1 }]);
    setSearch("");
    setResults([]);
  }

  function removeProduct(sku: string) {
    setSelected(selected.filter((s) => s.product.sku !== sku));
  }

  function updateQuantity(sku: string, qty: number) {
    if (qty < 1) qty = 1;
    if (qty > 100) qty = 100;
    setSelected(selected.map((s) => (s.product.sku === sku ? { ...s, quantity: qty } : s)));
  }

  async function generatePdf() {
    if (selected.length === 0) return;
    setGenerating(true);
    try {
      const { generateLabelPdf } = await import("@/lib/label-pdf");
      const labels: LabelProduct[] = selected.map((s) => ({
        sku: s.product.sku,
        name: s.product.name,
        barcode: s.product.barcode,
        unit: s.product.unit,
        cantidadPorCaja: s.product.cantidadPorCaja,
        precioMinorista: s.product.precioMinorista || 0,
        precioMayorista: s.product.precioMayorista,
        precioCajaCerrada: s.product.precioCajaCerrada,
        promocion: s.product.promocion,
        quantity: s.quantity,
      }));
      const doc = await generateLabelPdf(format, labels, isMinorista ? "minorista" : "mayorista");
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Error al generar el PDF");
    } finally {
      setGenerating(false);
    }
  }

  const totalLabels = selected.reduce((sum, s) => sum + s.quantity, 0);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Etiquetas</h1>

      {/* Price changes */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-medium text-gray-700">Cambios de precios</h2>
            {lastScanDate && (
              <p className="text-xs text-gray-400 mt-0.5">
                Última actualización: {new Date(lastScanDate).toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" })}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {priceChanges.length > 0 && (
              <button
                onClick={() => setShowClearConfirm(true)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200"
              >
                Limpiar
              </button>
            )}
            <button
              onClick={runPriceScan}
              disabled={scanning}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                scanning
                  ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                  : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {scanning ? "Escaneando..." : "Escanear precios"}
            </button>
          </div>
        </div>

        {scanResult && (
          <div className={`text-sm p-3 rounded-lg mb-3 ${
            scanResult.isFirstScan
              ? "bg-brand-50 text-brand-600"
              : scanResult.changes > 0
              ? "bg-yellow-50 text-yellow-700"
              : "bg-green-50 text-green-700"
          }`}>
            {scanResult.isFirstScan
              ? `Primera captura realizada: ${scanResult.scanned} productos registrados. En el próximo escaneo se detectarán los cambios.`
              : scanResult.changes > 0
              ? `Se detectaron ${scanResult.changes} cambios de precio en ${scanResult.scanned} productos.`
              : `Sin cambios. ${scanResult.scanned} productos verificados.`}
          </div>
        )}

        {loadingChanges ? (
          <p className="text-sm text-gray-400">Cargando...</p>
        ) : priceChanges.length > 0 ? (
          <>
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Producto</th>
                    <th className="text-left px-3 py-2 font-medium text-gray-600">Lista</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Anterior</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Nuevo</th>
                    <th className="text-right px-3 py-2 font-medium text-gray-600">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {priceChanges.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <div className="truncate max-w-[200px]">{c.name}</div>
                        <div className="text-xs text-gray-400">{c.sku}</div>
                      </td>
                      <td className="px-3 py-2 text-gray-600">{FIELD_LABELS[c.field] || c.field}</td>
                      <td className="px-3 py-2 text-right text-red-500 line-through">${Number(c.oldPrice).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-green-600 font-medium">${Number(c.newPrice).toFixed(2)}</td>
                      <td className="px-3 py-2 text-right text-gray-400 text-xs">
                        {new Date(c.detectedAt).toLocaleDateString("es-AR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              onClick={addChangedProducts}
              className="mt-3 w-full py-2 bg-yellow-500 text-white rounded-lg text-sm font-medium hover:bg-yellow-600 transition-colors"
            >
              Agregar {Array.from(new Set(priceChanges.map((c) => c.sku))).length} productos con cambios a las etiquetas
            </button>
          </>
        ) : (
          <p className="text-sm text-gray-400">
            No hay cambios de precios registrados. Presioná &quot;Escanear precios&quot; para iniciar el seguimiento.
          </p>
        )}
      </div>

      {/* Format selector */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Formato de etiqueta</h2>
        <div className="flex flex-wrap gap-3">
          {(Object.keys(FORMAT_LABELS) as LabelFormat[]).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                format === f
                  ? "bg-brand-400 text-white border-brand-400"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {FORMAT_LABELS[f]}
            </button>
          ))}
        </div>
      </div>

      {/* Product search */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Agregar productos</h2>

        {/* Barcode input */}
        <div className="flex gap-2 mb-3">
          <input
            type="text"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleBarcode(); }}
            placeholder="Código de barras..."
            className="flex-1 px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          <button
            onClick={handleBarcode}
            disabled={barcodeLoading || !barcode.trim()}
            className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {barcodeLoading ? "..." : "Agregar"}
          </button>
        </div>

        {/* Brand filter */}
        <div className="mb-3">
          <select
            value={selectedBrand}
            onChange={(e) => handleBrandFilter(e.target.value)}
            className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 bg-white"
          >
            <option value="">Filtrar por marca...</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          {loadingBrand && <p className="text-xs text-gray-400 mt-1">Cargando productos...</p>}
          {brandProducts.length > 0 && (
            <div className="mt-2 max-h-40 overflow-y-auto border rounded-lg">
              {brandProducts.map((p) => {
                const alreadyAdded = selected.some((s) => s.product.sku === p.sku);
                return (
                  <button
                    key={p.sku}
                    onClick={() => !alreadyAdded && addProduct(p)}
                    disabled={alreadyAdded}
                    className={`w-full text-left px-3 py-1.5 text-sm border-b last:border-b-0 ${
                      alreadyAdded ? "bg-gray-50 text-gray-400" : "hover:bg-brand-50"
                    }`}
                  >
                    <span className="font-mono text-gray-500 mr-2">{p.sku}</span>
                    {p.name}
                    {alreadyAdded && <span className="ml-2 text-xs">(agregado)</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Name/SKU search */}
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          {searching && (
            <div className="absolute right-3 top-2.5 text-gray-400 text-sm">Buscando...</div>
          )}
          {results.length > 0 && (
            <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
              {results.map((p) => {
                const alreadyAdded = selected.some((s) => s.product.sku === p.sku);
                return (
                  <button
                    key={p.sku}
                    onClick={() => !alreadyAdded && addProduct(p)}
                    disabled={alreadyAdded}
                    className={`w-full text-left px-4 py-2 text-sm border-b last:border-b-0 ${
                      alreadyAdded ? "bg-gray-50 text-gray-400" : "hover:bg-brand-50"
                    }`}
                  >
                    <span className="font-mono text-gray-500 mr-2">{p.sku}</span>
                    {p.name}
                    {alreadyAdded && <span className="ml-2 text-xs">(agregado)</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Selected products */}
      {selected.length > 0 && (
        <div className="bg-white rounded-lg border p-4 mb-4">
          <h2 className="text-sm font-medium text-gray-700 mb-3">
            Productos seleccionados ({selected.length})
          </h2>
          <div className="space-y-2">
            {selected.map((s) => (
              <div
                key={s.product.sku}
                className="flex items-center justify-between gap-3 py-2 border-b last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{s.product.name}</div>
                  <div className="text-xs text-gray-500">
                    SKU: {s.product.sku} | {s.product.barcode || "Sin código"}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => updateQuantity(s.product.sku, s.quantity - 1)}
                    className="w-7 h-7 flex items-center justify-center rounded border text-gray-600 hover:bg-gray-100"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={s.quantity}
                    onChange={(e) => updateQuantity(s.product.sku, parseInt(e.target.value) || 1)}
                    className="w-12 text-center text-sm border rounded py-1"
                    min={1}
                    max={100}
                  />
                  <button
                    onClick={() => updateQuantity(s.product.sku, s.quantity + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded border text-gray-600 hover:bg-gray-100"
                  >
                    +
                  </button>
                  <button
                    onClick={() => removeProduct(s.product.sku)}
                    className="text-red-500 hover:text-red-700 text-sm ml-2"
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Generate button */}
      <button
        onClick={generatePdf}
        disabled={selected.length === 0 || generating}
        className={`w-full py-3 rounded-lg text-sm font-medium transition-colors ${
          selected.length === 0 || generating
            ? "bg-gray-300 text-gray-500 cursor-not-allowed"
            : "bg-brand-400 text-white hover:bg-brand-500"
        }`}
      >
        {generating
          ? "Generando PDF..."
          : `Generar PDF — ${totalLabels} etiqueta${totalLabels !== 1 ? "s" : ""}`}
      </button>

      <ConfirmModal
        open={showClearConfirm}
        message="¿Limpiar todos los cambios de precios? Esta acción no se puede deshacer."
        loading={clearing}
        onConfirm={clearPriceChanges}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}
