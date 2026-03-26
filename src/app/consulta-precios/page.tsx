"use client";

import { useState, useRef, useEffect } from "react";

function BrandCarousel() {
  const [brands, setBrands] = useState<{ id: string; name: string; logo?: string }[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/brands").then((r) => r.json()),
      fetch("/api/admin/featured-brands?logos=1").then((r) => r.json()),
    ])
      .then(([allBrands, featuredData]) => {
        const featuredSet = new Set(featuredData.brandIds || []);
        const logos: Record<string, string> = featuredData.logos || {};
        const filtered = (allBrands || [])
          .filter((b: { id: string }) => featuredSet.has(b.id))
          .map((b: { id: string; name: string }) => ({
            ...b,
            logo: logos[b.id] || undefined,
          }));
        setBrands(filtered);
      })
      .catch(() => setBrands([]));
  }, []);

  if (brands.length === 0) return null;

  const items = [...brands, ...brands];
  const duration = brands.length * 3;

  return (
    <div className="overflow-hidden w-full mt-8">
      <div
        className="flex items-center gap-12 animate-carousel"
        style={{ width: "max-content", animationDuration: `${duration}s` }}
      >
        {items.map((brand, i) => (
          <div key={`${brand.id}-${i}`} className="flex items-center justify-center shrink-0">
            {brand.logo ? (
              <img src={brand.logo} alt={brand.name} className="h-16 sm:h-20 object-contain" />
            ) : (
              <span className="text-lg font-medium text-gray-600 whitespace-nowrap">{brand.name}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
  image: string | null;
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
      <div className="bg-brand-400 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img src="/logo.png" alt="Distrialma" className="h-8 sm:h-10" />
          <h1 className="text-white text-base sm:text-xl font-bold">Consulta de Precios</h1>
        </div>
        <span className="text-white/70 text-xs sm:text-sm hidden sm:block">
          {new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </span>
      </div>

      {/* Search bar */}
      <div className="px-4 py-4 bg-gray-800">
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
          placeholder="Escanee o escriba el nombre..."
          autoFocus
          autoComplete="off"
          className="w-full text-center text-base sm:text-xl py-3 px-4 rounded-xl border-2 border-brand-400 bg-gray-700 text-white placeholder-gray-400 focus:outline-none focus:border-brand-300 focus:ring-2 focus:ring-brand-400"
        />
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center px-4 py-4 sm:py-8">
        {loading && (
          <p className="text-xl sm:text-3xl text-gray-400 animate-pulse">Buscando...</p>
        )}

        {notFound && (
          <div className="text-center">
            <p className="text-2xl sm:text-4xl text-red-400 font-bold mb-2">Producto no encontrado</p>
            <p className="text-base sm:text-xl text-gray-500">Intente con otro código</p>
          </div>
        )}

        {product && (
          <div className="w-full max-w-4xl">
            <div className="flex flex-col md:flex-row gap-6">
              {/* Left: Image */}
              <div className="flex flex-col items-center md:items-start gap-3 md:w-1/2">
                {product.image ? (
                  <div className="w-full h-48 sm:h-56 md:w-80 md:h-80 bg-white rounded-2xl overflow-hidden flex items-center justify-center">
                    <img src={product.image} alt={product.name} className="max-w-full max-h-full object-contain" />
                  </div>
                ) : (
                  <div className="w-full h-48 sm:h-56 md:w-80 md:h-80 bg-gray-800 rounded-2xl flex items-center justify-center">
                    <span className="text-gray-600 text-lg">Sin imagen</span>
                  </div>
                )}
                <div className="text-center md:text-left">
                  <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-1">{product.name}</h2>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 text-sm text-gray-400">
                    {product.brand && <span>{product.brand}</span>}
                    {product.category && <span>| {product.category}</span>}
                    <span>| SKU {product.sku}</span>
                  </div>
                  <div className="mt-2">
                    <span className={`text-sm ${product.stock > 0 ? "text-green-400" : "text-red-400"}`}>
                      Stock: {product.stock} {product.unit || "UN"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Prices stacked */}
              <div className="flex flex-col gap-3 md:w-1/2">
                {product.precioMinorista > 0 && (
                  <div className="bg-green-900/50 border-2 border-green-500 rounded-2xl p-4 sm:p-5 flex items-center justify-between">
                    <p className="text-green-400 text-base sm:text-lg font-medium">Minorista</p>
                    <div className="text-right">
                      <p className="text-white text-2xl sm:text-4xl font-bold">{formatPrice(product.precioMinorista)}</p>
                      {product.unit === "KG" && <p className="text-green-400 text-xs">por KG</p>}
                    </div>
                  </div>
                )}

                {product.precioMayorista > 0 && (
                  <div className="bg-blue-900/50 border-2 border-blue-500 rounded-2xl p-4 sm:p-5 flex items-center justify-between">
                    <p className="text-blue-400 text-base sm:text-lg font-medium">Mayorista</p>
                    <div className="text-right">
                      <p className="text-white text-2xl sm:text-4xl font-bold">{formatPrice(product.precioMayorista)}</p>
                      {product.unit === "KG" && <p className="text-blue-400 text-xs">por KG</p>}
                    </div>
                  </div>
                )}

                {product.precioCajaCerrada > 0 && (
                  <div className="bg-purple-900/50 border-2 border-purple-500 rounded-2xl p-4 sm:p-5 flex items-center justify-between">
                    <p className="text-purple-400 text-base sm:text-lg font-medium">Caja Cerrada</p>
                    <div className="text-right">
                      <p className="text-white text-2xl sm:text-4xl font-bold">{formatPrice(product.precioCajaCerrada)}</p>
                      {caja > 0 && <p className="text-purple-400 text-xs">x{caja} {product.unit === "KG" ? "KG" : "un."}</p>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!loading && !product && !notFound && (
          <div className="text-center w-full">
            <img src="/logo.png" alt="Distrialma" className="h-20 sm:h-28 mx-auto mb-6 brightness-0 invert opacity-30" />
            <p className="text-xl sm:text-3xl text-gray-500 font-medium">Escanee un producto</p>
            <p className="text-sm sm:text-lg text-gray-600 mt-2">o escriba el nombre y presione Enter</p>
            <BrandCarousel />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="bg-gray-800 px-4 py-2 text-center">
        <p className="text-gray-500 text-xs">Precios sujetos a cambio sin previo aviso</p>
      </div>
    </div>
  );
}
