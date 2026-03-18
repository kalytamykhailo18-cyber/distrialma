"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCategories } from "./CategoriesProvider";

export default function CategorySidebar({
  activeId,
  activeBrandId,
}: {
  activeId?: string;
  activeBrandId?: string;
}) {
  const { categories, brands, filter, setFilter, brandFilter, setBrandFilter } = useCategories();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"categorias" | "marcas">(activeBrandId ? "marcas" : "categorias");

  const saveScroll = useCallback(() => {
    sessionStorage.setItem("sidebarScrollY", String(window.scrollY));
  }, []);

  useEffect(() => {
    const saved = sessionStorage.getItem("sidebarScrollY");
    if (saved) {
      window.scrollTo(0, parseInt(saved, 10));
      sessionStorage.removeItem("sidebarScrollY");
    }
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const filteredCats = useMemo(() => {
    if (!filter.trim()) return categories;
    const term = filter.toLowerCase();
    return categories.filter((c) => c.name.toLowerCase().includes(term));
  }, [categories, filter]);

  const filteredBrands = useMemo(() => {
    if (!brandFilter.trim()) return brands;
    const term = brandFilter.toLowerCase();
    return brands.filter((b) => b.name.toLowerCase().includes(term));
  }, [brands, brandFilter]);

  const sidebarContent = (
    <nav className="p-4">
      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setTab("categorias")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "categorias"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Categorías
        </button>
        <button
          onClick={() => setTab("marcas")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "marcas"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Marcas
        </button>
      </div>

      {/* Categories tab */}
      {tab === "categorias" && (
        <div>
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar categorías..."
            className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />
          <ul className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            <li>
              <Link
                scroll={false}
                href="/productos"
                onClick={() => { saveScroll(); setOpen(false); }}
                className={`block px-3 py-2 text-sm rounded-lg ${
                  !activeId && !activeBrandId
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                Todas
              </Link>
            </li>
            {filteredCats.map((cat) => (
              <li key={cat.id}>
                <Link
                  scroll={false}
                  href={`/categoria/${cat.id}`}
                  onClick={() => { saveScroll(); setOpen(false); }}
                  className={`block px-3 py-2 text-sm rounded-lg ${
                    activeId === cat.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {cat.name}
                </Link>
              </li>
            ))}
            {filteredCats.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
            )}
          </ul>
        </div>
      )}

      {/* Brands tab */}
      {tab === "marcas" && (
        <div>
          <input
            type="text"
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            placeholder="Filtrar marcas..."
            className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
          />
          <ul className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
            {filteredBrands.map((brand) => (
              <li key={brand.id}>
                <Link
                  scroll={false}
                  href={`/marca/${brand.id}`}
                  onClick={() => { saveScroll(); setOpen(false); }}
                  className={`block px-3 py-2 text-sm rounded-lg ${
                    activeBrandId === brand.id
                      ? "bg-blue-50 text-blue-700 font-medium"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {brand.name}
                </Link>
              </li>
            ))}
            {filteredBrands.length === 0 && (
              <li className="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
            )}
          </ul>
        </div>
      )}
    </nav>
  );

  return (
    <>
      {/* Mobile toggle button */}
      <button
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-4 left-4 z-30 flex items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-full shadow-lg text-sm font-medium"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Filtros
      </button>

      {/* Mobile overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        onClick={() => setOpen(false)}
      />

      {/* Mobile drawer */}
      <aside
        className={`md:hidden fixed top-0 left-0 h-full w-72 bg-white z-50 shadow-xl transform transition-transform duration-300 ease-in-out overflow-y-auto ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4 border-b">
          <h2 className="font-semibold text-gray-900 text-lg">Filtros</h2>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg"
          >
            ✕
          </button>
        </div>
        {sidebarContent}
      </aside>

      {/* Desktop static sidebar */}
      <div className="hidden md:block">
        {sidebarContent}
      </div>
    </>
  );
}
