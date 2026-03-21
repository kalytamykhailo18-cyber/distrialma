"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface PriceNewsProduct {
  sku: string;
  name: string;
  precioMayorista: number;
  oldPrice: number | null;
  image: string | null;
}

const STORES = [
  {
    name: "Local 1 — Merlo",
    address: "Av. Calle Real 387, Merlo, Buenos Aires",
    hours: "Lunes a Sábados 8:00 a 18:00",
    mapEmbed: "https://maps.google.com/maps?width=600&height=400&hl=es&q=Av%20Calle%20Real%20387%20Merlo%20Buenos%20Aires&t=&z=16&ie=UTF8&iwloc=B&output=embed",
  },
  {
    name: "Local 2 — Pontevedra",
    address: "Av. Patricios 7399, Pontevedra, Buenos Aires",
    hours: "Lunes a Sábados 9:00 a 17:00",
    mapEmbed: "https://maps.google.com/maps?width=600&height=400&hl=es&q=Av%20Patricios%207399%20Pontevedra%20Buenos%20Aires&t=&z=16&ie=UTF8&iwloc=B&output=embed",
  },
  {
    name: "Local 3 — Merlo",
    address: "Av. Calle Real 435, Merlo, Buenos Aires",
    hours: "Lunes a Domingos 8:00 a 21:30",
    mapEmbed: "https://maps.google.com/maps?width=600&height=400&hl=es&q=Av%20Calle%20Real%20435%20Merlo%20Buenos%20Aires&t=&z=16&ie=UTF8&iwloc=B&output=embed",
  },
];

export default function Home() {
  const [news, setNews] = useState<PriceNewsProduct[]>([]);
  const [activeStore, setActiveStore] = useState(0);

  useEffect(() => {
    fetch("/api/price-news")
      .then((r) => r.json())
      .then((data) => setNews(data.products || []))
      .catch(() => setNews([]));
  }, []);

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-b from-brand-50 to-white">
        <div className="max-w-7xl mx-auto px-4 py-12 text-center">
          <img src="/logo.png" alt="Alma" className="h-24 mx-auto mb-4" />
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-3">
            Distrialma
          </h1>
          <p className="text-lg text-gray-600 mb-8">
            Distribuidora Mayorista — Bebidas, Alimentos, Limpieza y más
          </p>
          <Link
            href="/productos"
            className="bg-brand-400 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-brand-500 transition-colors inline-block"
          >
            Ver Productos
          </Link>
        </div>
      </div>

      {/* Module 1: Price News */}
      {news.length > 0 && (
        <div id="novedades" className="bg-white py-12 scroll-mt-16">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
              Novedades de precios
            </h2>
            <p className="text-gray-500 text-center mb-8">
              Productos con actualizaciones recientes
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {news.map((product) => (
                <Link
                  key={product.sku}
                  href={`/productos/${product.sku}`}
                  className="bg-white rounded-lg border hover:shadow-md transition-shadow p-4 flex flex-col"
                >
                  <div className="w-full h-32 bg-gray-100 rounded mb-3 flex items-center justify-center overflow-hidden">
                    {product.image ? (
                      <img
                        src={product.image}
                        alt={product.name}
                        className="max-h-full max-w-full object-contain"
                      />
                    ) : (
                      <span className="text-gray-400 text-xs">Sin imagen</span>
                    )}
                  </div>
                  <h3 className="text-xs font-medium text-gray-900 mb-2 line-clamp-2">
                    {product.name}
                  </h3>
                  <div className="mt-auto">
                    {product.oldPrice && (
                      <span className="text-xs text-gray-400 line-through mr-2">
                        {formatPrice(product.oldPrice)}
                      </span>
                    )}
                    <span className="text-sm font-bold text-green-700">
                      {formatPrice(product.precioMayorista)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Module 2: Brand Logos */}
      <div id="marcas" className="bg-gray-50 py-12 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Nuestras marcas
          </h2>
          <p className="text-gray-500 text-center mb-8">
            Trabajamos con las mejores marcas del mercado
          </p>
          <div id="brand-logos" className="flex flex-wrap justify-center gap-6 items-center opacity-60">
            <BrandLogos />
          </div>
        </div>
      </div>

      {/* Module 3: Stores & Contact */}
      <div id="locales" className="bg-white py-12 scroll-mt-16">
        <div className="max-w-7xl mx-auto px-4">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">
            Nuestros locales
          </h2>
          <p className="text-gray-500 text-center mb-8">
            Visitanos en cualquiera de nuestras sucursales
          </p>

          <div className="md:flex md:gap-6 mb-10">
            {/* Store cards */}
            <div className="md:w-1/3 space-y-3 mb-4 md:mb-0">
              {STORES.map((store, idx) => (
                <button
                  key={store.name}
                  onClick={() => setActiveStore(idx)}
                  className={`w-full text-left rounded-xl p-4 transition-colors ${
                    activeStore === idx
                      ? "bg-brand-50 border-2 border-brand-400"
                      : "bg-gray-50 border-2 border-transparent hover:border-gray-200"
                  }`}
                >
                  <h3 className="font-semibold text-gray-900 mb-2">{store.name}</h3>
                  <div className="space-y-1.5 text-sm text-gray-600">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 text-brand-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{store.address}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 text-brand-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{store.hours}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Single map */}
            <div className="md:w-2/3 rounded-xl overflow-hidden border" style={{ minHeight: 350 }}>
              <iframe
                key={activeStore}
                src={STORES[activeStore].mapEmbed}
                width="100%"
                height="100%"
                style={{ border: 0, minHeight: 350 }}
                allowFullScreen
                loading="lazy"
              />
            </div>
          </div>

          {/* Contact info */}
          <div className="bg-gray-50 rounded-xl p-6 md:p-8">
            <h3 className="font-semibold text-gray-900 mb-4 text-center">Contacto</h3>
            <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-600">
              <a href="https://wa.me/5491154137677" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-600">
                <svg className="w-5 h-5 text-green-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                  <path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.492a.5.5 0 00.611.611l4.458-1.495A11.952 11.952 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-2.386 0-4.592-.842-6.312-2.243l-.44-.36-3.2 1.072 1.072-3.2-.36-.44A9.958 9.958 0 012 12C2 6.477 6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
                </svg>
                +54 9 11 5413-7677
              </a>
              <a href="mailto:compras@distrialma.com.ar" className="flex items-center gap-2 hover:text-brand-600">
                <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                compras@distrialma.com.ar
              </a>
              <a href="https://www.instagram.com/distri.alma" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-600">
                <svg className="w-5 h-5 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
                </svg>
                @distri.alma
              </a>
              <a href="https://www.facebook.com/distrialma2020" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-600">
                <svg className="w-5 h-5 text-brand-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                </svg>
                Distrialma
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Brand logos — shows brand names as text badges for now (can be replaced with uploaded logos later)
function BrandLogos() {
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    fetch("/api/brands")
      .then((r) => r.json())
      .then((data) => setBrands((data || []).slice(0, 20)))
      .catch(() => setBrands([]));
  }, []);

  if (brands.length === 0) return null;

  return (
    <>
      {brands.map((brand) => (
        <Link
          key={brand.id}
          href={`/marca/${brand.id}`}
          className="px-4 py-2 bg-white border rounded-lg text-sm font-medium text-gray-700 hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          {brand.name}
        </Link>
      ))}
    </>
  );
}
