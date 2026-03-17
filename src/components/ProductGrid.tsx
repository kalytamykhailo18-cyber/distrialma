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

export default function ProductGrid({
  initialProducts,
  categoryId,
  brandId,
  search,
  onPaginationReady,
}: Props) {
  const [products, setProducts] = useState<Product[]>(initialProducts || []);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(!initialProducts);
  const prevFilters = useRef({ categoryId, brandId, search });

  useEffect(() => {
    if (onPaginationReady) {
      onPaginationReady({ page, totalPages, total, loading, setPage });
    }
  }, [page, totalPages, total, loading]);

  useEffect(() => {
    const filtersChanged =
      prevFilters.current.categoryId !== categoryId ||
      prevFilters.current.brandId !== brandId ||
      prevFilters.current.search !== search;

    prevFilters.current = { categoryId, brandId, search };

    if (filtersChanged && page !== 1) {
      setPage(1);
      return;
    }

    fetchProducts();
  }, [page, categoryId, brandId, search]);

  async function fetchProducts() {
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), limit: "24" });
    if (categoryId) params.set("category", categoryId);
    if (brandId) params.set("brand", brandId);
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
    <div>
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
          {products.map((product) => (
            <ProductCard key={product.sku} product={product} />
          ))}
        </div>
      )}

      <div className="mt-8">{pagination}</div>
    </div>
  );
}
