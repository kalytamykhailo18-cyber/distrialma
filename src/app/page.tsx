"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { HiOutlineLocationMarker, HiOutlineClock, HiOutlineMail } from "react-icons/hi";
import { FaWhatsapp, FaInstagram, FaFacebookF } from "react-icons/fa";

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
          <BrandLogos />
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
                      <HiOutlineLocationMarker className="w-4 h-4 mt-0.5 text-brand-400 shrink-0" />
                      <span>{store.address}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <HiOutlineClock className="w-4 h-4 mt-0.5 text-brand-400 shrink-0" />
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
                <FaWhatsapp className="w-5 h-5 text-green-500" />
                +54 9 11 5413-7677
              </a>
              <a href="mailto:compras@distrialma.com.ar" className="flex items-center gap-2 hover:text-brand-600">
                <HiOutlineMail className="w-5 h-5 text-brand-400" />
                compras@distrialma.com.ar
              </a>
              <a href="https://www.instagram.com/distri.alma" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-600">
                <FaInstagram className="w-5 h-5 text-brand-400" />
                @distri.alma
              </a>
              <a href="https://www.facebook.com/distrialma2020" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-brand-600">
                <FaFacebookF className="w-5 h-5 text-brand-400" />
                Distrialma
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Brand logos — infinite scrolling carousel
function BrandLogos() {
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

  // Duplicate brands for seamless infinite loop
  const items = [...brands, ...brands];
  const duration = brands.length * 3; // 3 seconds per brand

  return (
    <div className="overflow-hidden w-full">
      <div
        className="flex items-center gap-10 animate-carousel"
        style={{
          width: "max-content",
          animationDuration: `${duration}s`,
        }}
      >
        {items.map((brand, i) => (
          <Link
            key={`${brand.id}-${i}`}
            href={`/marca/${brand.id}`}
            className={`flex items-center justify-center shrink-0 rounded-lg hover:shadow-sm transition-colors ${
              brand.logo ? "" : "px-4 py-2 bg-white border hover:border-brand-400"
            }`}
          >
            {brand.logo ? (
              <img src={brand.logo} alt={brand.name} className="h-14 object-contain" />
            ) : (
              <span className="text-sm font-medium text-gray-700 whitespace-nowrap">{brand.name}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
