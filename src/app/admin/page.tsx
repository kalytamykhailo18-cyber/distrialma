"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Pagination from "@/components/Pagination";
import type { Product } from "@/types";

export default function AdminPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [inputValue, setInputValue] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProducts();
  }, [page, search]);

  function handleSearch() {
    setPage(1);
    setSearch(inputValue.trim());
  }

  async function fetchProducts() {
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      limit: "20",
    });
    if (search) params.set("search", search);

    try {
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts(data.products);
      setTotalPages(data.totalPages);
      setTotal(data.total);
    } catch {
      console.error("Error loading products");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          Admin — Productos
        </h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/admin/configuracion"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Configuración
          </Link>
          <Link
            href="/admin/categorias"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Categorías
          </Link>
          <Link
            href="/admin/marcas"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Marcas
          </Link>
          <Link
            href="/admin/combos"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Combos
          </Link>
          <Link
            href="/admin/pedidos"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Pedidos
          </Link>
          <Link
            href="/reparto"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Reparto
          </Link>
          <Link
            href="/admin/dias-entrega"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Días Entrega
          </Link>
          <Link
            href="/admin/informes"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Informes
          </Link>
          <Link
            href="/admin/etiquetas"
            className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
          >
            Etiquetas
          </Link>
        </div>
      </div>

      <div className="mb-4 flex gap-2 max-w-md">
        <input
          type="text"
          placeholder="Buscar producto..."
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          disabled={loading}
          className="flex-1 px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 disabled:opacity-50"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
        >
          Buscar
        </button>
      </div>

      <div className="bg-white rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                SKU
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Nombre
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Imágenes
              </th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">
                Descripción
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-t animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-48" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-12" /></td>
                </tr>
              ))
            ) : (
              products.map((p) => (
                <tr key={p.sku} className="border-t">
                  <td className="px-4 py-3 font-mono text-gray-500">
                    {p.sku}
                  </td>
                  <td className="px-4 py-3">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.images.length > 0 ? (
                      <span className="text-green-600">
                        {p.images.length} img
                      </span>
                    ) : (
                      <span className="text-gray-400">Sin imagen</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {p.description ? (
                      <span className="text-green-600">Tiene</span>
                    ) : (
                      <span className="text-gray-400">Sin desc.</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/productos/${p.sku}`}
                      className="text-brand-600 hover:underline text-sm"
                    >
                      Editar
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-6">
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          loading={loading}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}
