"use client";

import { useEffect, useState, useRef } from "react";
import ProductCard from "./ProductCard";
import Pagination from "./Pagination";
import type { Product } from "@/types";

export interface PaginationState {
  page: number;
  totalPages: number;
  total: number;
  loading: boolean;
  setPage: (page: number) => void;
}

interface Props {
  initialProducts?: Product[];
  categoryId?: string;
  brandId?: string;
  search?: string;
  onPaginationReady?: (state: PaginationState) => void;
}

const HIDE_OOS_KEY = "hideOutOfStock";

export default function ProductGrid({
  initialProducts,
  categoryId,
  brandId,
  search,
  onPaginationReady,
}: Props) {
  const [hideOutOfStock, setHideOutOfStock] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHideOutOfStock(localStorage.getItem(HIDE_OOS_KEY) === "1");
    }
  }, []);

  function toggleHideOutOfStock() {
    const next = !hideOutOfStock;
    setHideOutOfStock(next);
    if (typeof window !== "undefined") {
      localStorage.setItem(HIDE_OOS_KEY, next ? "1" : "0");
    }
  }
  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [page, setPage] = useState(() => {
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("productListPage");
      if (saved) return parseInt(saved, 10) || 1;
    }
    return 1;
  });
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(!initialProducts);
  const [stockThreshold, setStockThreshold] = useState(0);
  const prevFilters = useRef({ categoryId, brandId, search, hideOutOfStock });
  const scrollRestored = useRef(false);

  useEffect(() => {
    if (onPaginationReady) {
      onPaginationReady({ page, totalPages, total, loading, setPage });
    }
  }, [page, totalPages, total, loading]);

  useEffect(() => {
    const filtersChanged =
      prevFilters.current.categoryId !== categoryId ||
      prevFilters.current.brandId !== brandId ||
      prevFilters.current.search !== search ||
      prevFilters.current.hideOutOfStock !== hideOutOfStock;

    prevFilters.current = { categoryId, brandId, search, hideOutOfStock };

    if (filtersChanged && page !== 1) {
      setPage(1);
      return;
    }

    sessionStorage.setItem("productListPage", String(page));
    fetchProducts();
  }, [page, categoryId, brandId, search, hideOutOfStock]);

  async function fetchProducts() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "24" });
    if (categoryId) params.set("category", categoryId);
    if (brandId) params.set("brand", brandId);
    if (search) params.set("search", search);
    if (hideOutOfStock) params.set("hideOutOfStock", "1");

    try {
      const res = await fetch(`/api/products?${params}`);
      const data = await res.json();
      setProducts(data.products || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      if (data.stockThreshold !== undefined) setStockThreshold(data.stockThreshold);
    } catch {
      setProducts([]);
      setTotalPages(1);
      setTotal(0);
    } finally {
      setLoading(false);
      // Restore scroll position when returning from product detail
      if (!scrollRestored.current) {
        scrollRestored.current = true;
        const savedPath = sessionStorage.getItem("productListPath");
        const savedScroll = sessionStorage.getItem("productListScrollY");
        const currentPath = window.location.pathname + window.location.search;
        if (savedPath === currentPath && savedScroll) {
          requestAnimationFrame(() => {
            window.scrollTo(0, parseInt(savedScroll, 10));
          });
        }
        sessionStorage.removeItem("productListScrollY");
        sessionStorage.removeItem("productListPath");
      }
    }
  }

  const pagination = (
    <Pagination
      page={page}
      totalPages={totalPages}
      total={total}
      loading={loading}
      onPageChange={setPage}
    />
  );

  return (
    <div style={{ minHeight: "80vh" }}>
      <div className="flex items-center justify-end mb-3">
        <button
          type="button"
          role="switch"
          aria-checked={hideOutOfStock}
          onClick={toggleHideOutOfStock}
          className="flex items-center gap-2 text-sm text-gray-700 select-none"
        >
          <span>Ocultar sin stock</span>
          <span
            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
              hideOutOfStock ? "bg-brand-400" : "bg-gray-300"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                hideOutOfStock ? "translate-x-4" : "translate-x-0.5"
              }`}
            />
          </span>
        </button>
      </div>
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-lg border p-4 animate-pulse"
            >
              <div className="w-full h-40 bg-gray-200 rounded mb-3" />
              <div className="h-4 bg-gray-200 rounded mb-2" />
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : products.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No se encontraron productos.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {products.map((product, i) => (
            <ProductCard key={product.sku} product={product} index={i} stockThreshold={stockThreshold} />
          ))}
        </div>
      )}

      <div className="mt-8">{pagination}</div>
    </div>
  );
}
