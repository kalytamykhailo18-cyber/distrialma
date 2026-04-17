"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCategories } from "./CategoriesProvider";
import { HiChevronDown } from "react-icons/hi";

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
  const catListRef = useRef<HTMLUListElement>(null);
  const brandListRef = useRef<HTMLUListElement>(null);

  // Persist sidebar state continuously so it's available on any navigation
  useEffect(() => {
    sessionStorage.setItem("sidebarTab", tab);
  }, [tab]);

  useEffect(() => {
    const catEl = catListRef.current;
    const brandEl = brandListRef.current;
    const onCatScroll = () => {
      if (catEl) sessionStorage.setItem("sidebarCatScrollY", String(catEl.scrollTop));
    };
    const onBrandScroll = () => {
      if (brandEl) sessionStorage.setItem("sidebarBrandScrollY", String(brandEl.scrollTop));
    };
    catEl?.addEventListener("scroll", onCatScroll, { passive: true });
    brandEl?.addEventListener("scroll", onBrandScroll, { passive: true });
    return () => {
      catEl?.removeEventListener("scroll", onCatScroll);
      brandEl?.removeEventListener("scroll", onBrandScroll);
    };
  });

  const saveScrollPositions = useCallback(() => {
    sessionStorage.setItem("sidebarPageScrollY", String(window.scrollY));
    // Clear search/page state when switching category/brand
    sessionStorage.removeItem("productSearchText");
    sessionStorage.removeItem("productListPage");
  }, []);

  // Restore scroll positions on mount
  useEffect(() => {
    const savedPageScroll = sessionStorage.getItem("sidebarPageScrollY");
    if (savedPageScroll) {
      window.scrollTo(0, parseInt(savedPageScroll, 10));
      sessionStorage.removeItem("sidebarPageScrollY");
    }

    const savedTab = sessionStorage.getItem("sidebarTab");
    if (savedTab === "categorias" || savedTab === "marcas") {
      setTab(savedTab);
    }
  }, []);

  // Restore sidebar list scroll after categories/brands load
  useEffect(() => {
    if (categories.length > 0 && catListRef.current) {
      const saved = sessionStorage.getItem("sidebarCatScrollY");
      if (saved) {
        catListRef.current.scrollTop = parseInt(saved, 10);
      }
    }
  }, [categories]);

  useEffect(() => {
    if (brands.length > 0 && brandListRef.current) {
      const saved = sessionStorage.getItem("sidebarBrandScrollY");
      if (saved) {
        brandListRef.current.scrollTop = parseInt(saved, 10);
      }
    }
  }, [brands]);

  // No longer needed — mobile uses inline collapsible, not a full-screen drawer

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
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-all duration-200 ${
            tab === "categorias"
              ? "border-brand-500 text-brand-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Categorías
        </button>
        <button
          onClick={() => setTab("marcas")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 transition-all duration-200 ${
            tab === "marcas"
              ? "border-brand-500 text-brand-600"
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
            className="w-full px-3 py-1.5 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-2"
          />
          <ul ref={catListRef} className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)] scroll-auto">
            <li>
              <Link
                scroll={false}
                href="/productos"
                onClick={() => { saveScrollPositions(); setOpen(false); }}
                className={`block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                  !activeId && !activeBrandId
                    ? "bg-brand-100 text-brand-700 font-semibold shadow-sm"
                    : "text-gray-600 hover:bg-brand-50 hover:text-brand-600 hover:translate-x-1 hover:font-medium"
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
                  onClick={() => { saveScrollPositions(); setOpen(false); }}
                  className={`block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    activeId === cat.id
                      ? "bg-brand-100 text-brand-700 font-semibold shadow-sm"
                      : "text-gray-600 hover:bg-brand-50 hover:text-brand-600 hover:translate-x-1 hover:font-medium"
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
            className="w-full px-3 py-1.5 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-2"
          />
          <ul ref={brandListRef} className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)] scroll-auto">
            {filteredBrands.map((brand) => (
              <li key={brand.id}>
                <Link
                  scroll={false}
                  href={`/marca/${brand.id}`}
                  onClick={() => { saveScrollPositions(); setOpen(false); }}
                  className={`block px-3 py-2 text-sm rounded-lg transition-all duration-200 ${
                    activeBrandId === brand.id
                      ? "bg-brand-100 text-brand-700 font-semibold shadow-sm"
                      : "text-gray-600 hover:bg-brand-50 hover:text-brand-600 hover:translate-x-1 hover:font-medium"
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
      {/* Mobile: inline collapsible */}
      <div className="md:hidden mb-4">
        <button
          onClick={() => setOpen(!open)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white border rounded-xl shadow-sm text-sm font-medium text-gray-700 transition-colors duration-200 hover:bg-gray-50"
        >
          <span>{tab === "categorias" ? "Categorías" : "Marcas"}</span>
          <HiChevronDown className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${open ? "rotate-180" : ""}`} />
        </button>
        <div
          className="overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
          style={{ maxHeight: open ? 400 : 0, opacity: open ? 1 : 0 }}
        >
          <div className="bg-white border border-t-0 rounded-b-xl shadow-sm">
            {sidebarContent}
          </div>
        </div>
      </div>

      {/* Desktop static sidebar */}
      <div className="hidden md:block">
        {sidebarContent}
      </div>
    </>
  );
}
