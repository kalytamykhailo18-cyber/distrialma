"use client";

import Link from "next/link";
import { useEffect, useState, useMemo } from "react";
import { useCategories } from "./CategoriesProvider";

export default function CategorySidebar({
  activeId,
}: {
  activeId?: string;
}) {
  const { categories, filter, setFilter } = useCategories();
  const [open, setOpen] = useState(false);

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

  const filtered = useMemo(() => {
    if (!filter.trim()) return categories;
    const term = filter.toLowerCase();
    return categories.filter((cat) => cat.name.toLowerCase().includes(term));
  }, [categories, filter]);

  const filterInput = (
    <input
      type="text"
      value={filter}
      onChange={(e) => setFilter(e.target.value)}
      placeholder="Filtrar categorías..."
      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
    />
  );

  const categoryList = (
    <ul className="space-y-1">
      <li>
        <Link
          href="/productos"
          onClick={() => setOpen(false)}
          className={`block px-3 py-2 text-sm rounded-lg ${
            !activeId
              ? "bg-blue-50 text-blue-700 font-medium"
              : "text-gray-600 hover:bg-gray-50"
          }`}
        >
          Todas
        </Link>
      </li>
      {filtered.map((cat) => (
        <li key={cat.id}>
          <Link
            href={`/categoria/${cat.id}`}
            onClick={() => setOpen(false)}
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
      {filtered.length === 0 && (
        <li className="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
      )}
    </ul>
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
        Categorías
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
          <h2 className="font-semibold text-gray-900 text-lg">Categorías</h2>
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-500 text-lg"
          >
            ✕
          </button>
        </div>
        <nav className="p-4">
          {filterInput}
          {categoryList}
        </nav>
      </aside>

      {/* Desktop static sidebar */}
      <div className="hidden md:block">
        <h2 className="font-semibold text-gray-900 mb-3">Categorías</h2>
        {filterInput}
        {categoryList}
      </div>
    </>
  );
}
