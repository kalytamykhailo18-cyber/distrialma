"use client";

import { useState, useRef, useEffect } from "react";

interface Product {
  sku: string;
  name: string;
  barcode: string;
  category: string;
  brand: string;
  unit: string;
  precioMinorista: number;
  precioMayorista: number;
  precioCajaCerrada: number;
  precioLista5: number;
  stock: number;
  cantidadPorCaja: string;
}

function formatPrice(n: number): string {
  if (!n) return "";
  return "$ " + n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export default function ConsultaPreciosPage() {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<Product | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const clearTimer = useRef<ReturnType<typeof setTimeout>>();

  // Always keep focus on input
  useEffect(() => {
    inputRef.current?.focus();
    const interval = setInterval(() => {
      if (document.activeElement !== inputRef.current) {
        inputRef.current?.focus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Auto-clear product after 15 seconds
  useEffect(() => {
    if (product || notFound) {
      clearTimer.current = setTimeout(() => {
        setProduct(null);
        setNotFound(false);
        setQuery("");
        inputRef.current?.focus();
      }, 15000);
      return () => clearTimeout(clearTimer.current);
    }
  }, [product, notFound]);

  async function handleSearch() {
    if (!query.trim()) return;
    setLoading(true);
    setProduct(null);
    setNotFound(false);

    try {
      const res = await fetch(`/api/price-check?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json();
      if (data.product) {
        setProduct(data.product);
      } else {
        setNotFound(true);
      }
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }

  const caja = parseInt(product?.cantidadPorCaja || "0") || 0;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <div className="bg-brand-400 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="Distrialma" className="h-10 brightness-0 invert" />
          <h1 className="text-white text-2xl font-bold">Consulta de Precios</h1>
        </div>
        <span className="text-white/70 text-sm">
          {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>

      {/* Search bar */}
      <div className="px-6 py-6 bg-gray-800">
        <div className="max-w-2xl mx-auto">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleSearch();
              }
            }}
            placeholder="Escanee el código de barras o escriba el nombre..."
            autoFocus
            autoComplete="off"
            className="w-full text-center text-2xl py-4 px-6 rounded-xl border-2 border-brand-400 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-400"
          />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-6 py-8">
        {loading && (
          <p className="text-3xl text-gray-400 animate-pulse">Buscando...</p>
        )}

        {notFound && (
          <div className="text-center">
            <p className="text-4xl text-red-400 font-bold mb-2">Producto no encontrado</p>
            <p className="text-xl text-gray-500">Intente con otro código</p>
          </div>
        )}

        {product && (
          <div className="w-full max-w-3xl">
            {/* Product name */}
            <div className="text-center mb-8">
              <h2 className="text-4xl font-bold text-white mb-2">{product.name}</h2>
              <div className="flex items-center justify-center gap-4 text-lg text-gray-400">
                {product.brand && <span>{product.brand}</span>}
                {product.category && <span>{product.category}</span>}
                <span>SKU {product.sku}</span>
                {product.barcode && <span>EAN {product.barcode}</span>}
              </div>
            </div>

            {/* Prices */}
            <div className="grid grid-cols-2 gap-4">
              {product.precioMinorista > 0 && (
                <div className="bg-green-900/50 border-2 border-green-500 rounded-2xl p-6 text-center">
                  <p className="text-green-400 text-lg font-medium mb-1">Minorista</p>
                  <p className="text-white text-5xl font-bold">{formatPrice(product.precioMinorista)}</p>
                  {product.unit === "KG" && <p className="text-green-400 text-base mt-1">por KG</p>}
                </div>
              )}

              {product.precioMayorista > 0 && (
                <div className="bg-blue-900/50 border-2 border-blue-500 rounded-2xl p-6 text-center">
                  <p className="text-blue-400 text-lg font-medium mb-1">Mayorista</p>
                  <p className="text-white text-5xl font-bold">{formatPrice(product.precioMayorista)}</p>
                  {product.unit === "KG" && <p className="text-blue-400 text-base mt-1">por KG</p>}
                </div>
              )}

              {product.precioCajaCerrada > 0 && (
                <div className="bg-purple-900/50 border-2 border-purple-500 rounded-2xl p-6 text-center">
                  <p className="text-purple-400 text-lg font-medium mb-1">Caja Cerrada</p>
                  <p className="text-white text-5xl font-bold">{formatPrice(product.precioCajaCerrada)}</p>
                  {caja > 0 && <p className="text-purple-400 text-base mt-1">x{caja} {product.unit === "KG" ? "KG" : "un."}</p>}
                </div>
              )}

              {product.precioLista5 > 0 && (
                <div className="bg-amber-900/50 border-2 border-amber-500 rounded-2xl p-6 text-center">
                  <p className="text-amber-400 text-lg font-medium mb-1">Lista 5</p>
                  <p className="text-white text-5xl font-bold">{formatPrice(product.precioLista5)}</p>
                  {product.unit === "KG" && <p className="text-amber-400 text-base mt-1">por KG</p>}
                </div>
              )}
            </div>

            {/* Stock */}
            <div className="text-center mt-6">
              <span className={`text-lg ${product.stock > 0 ? "text-green-400" : "text-red-400"}`}>
                Stock: {product.stock} {product.unit || "UN"}
              </span>
            </div>
          </div>
        )}

        {!loading && !product && !notFound && (
          <div className="text-center">
            <p className="text-3xl text-gray-500 font-medium">Escanee un producto</p>
            <p className="text-xl text-gray-600 mt-2">o escriba el nombre y presione Enter</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-800 px-6 py-3 text-center">
        <p className="text-gray-500 text-sm">Precios sujetos a cambio sin previo aviso</p>
      </div>
    </div>
  );
}
