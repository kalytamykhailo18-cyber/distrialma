"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import type { Product } from "@/types";
import type { LabelFormat, LabelProduct } from "@/lib/label-pdf";
import { FORMAT_LABELS } from "@/lib/label-pdf";

interface SelectedProduct {
  product: Product;
  quantity: number;
}

export default function EtiquetasPage() {
  const [format, setFormat] = useState<LabelFormat>("gondola");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<Product[]>([]);
  const [selected, setSelected] = useState<SelectedProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [generating, setGenerating] = useState(false);
  const searchTimeout = useRef<NodeJS.Timeout | null>(null);

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
        quantity: s.quantity,
      }));
      const doc = await generateLabelPdf(format, labels);
      const blob = doc.output("blob");
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank");
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Etiquetas</h1>
        <Link
          href="/admin"
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
        >
          Volver
        </Link>
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
                  ? "bg-blue-600 text-white border-blue-600"
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
        <div className="relative">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Buscar por nombre o SKU..."
            className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      alreadyAdded
                        ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                        : "hover:bg-blue-50 cursor-pointer"
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
            : "bg-blue-600 text-white hover:bg-blue-700"
        }`}
      >
        {generating
          ? "Generando PDF..."
          : `Generar PDF — ${totalLabels} etiqueta${totalLabels !== 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
