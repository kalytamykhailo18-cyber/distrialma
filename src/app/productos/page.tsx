"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import ProductGrid, { PaginationState } from "@/components/ProductGrid";
import CategorySidebar from "@/components/CategorySidebar";
import PaginationCompact from "@/components/PaginationCompact";
import SearchBox from "@/components/SearchBox";
import { PageTransition, Stagger, LoadingCenter } from "@/components/AnimateIn";

function getRestoredSearch(): string {
  if (typeof window !== "undefined") {
    return sessionStorage.getItem("productSearchText") || "";
  }
  return "";
}

function ProductosContent() {
  const searchParams = useSearchParams();
  const initialSearch = searchParams.get("search") || getRestoredSearch();
  const [search, setSearch] = useState(initialSearch);
  const [pag, setPag] = useState<PaginationState | null>(null);

  return (
    <PageTransition className="max-w-7xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <h1 className="text-base md:text-xl font-bold text-gray-900">
            Productos
          </h1>
          <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-sm">
            <SearchBox initialValue={initialSearch} onSearch={setSearch} />
          </div>
          {pag && (
            <div className="order-2 md:order-3">
              <PaginationCompact
                page={pag.page}
                totalPages={pag.totalPages}
                total={pag.total}
                loading={pag.loading}
                onPageChange={pag.setPage}
              />
            </div>
          )}
        </div>
      </Stagger>
      <div className="md:flex md:gap-6">
        <div className="md:w-56 shrink-0">
          <CategorySidebar />
        </div>
        <Stagger delay={100} className="flex-1">
          <ProductGrid
            search={search || undefined}
            onPaginationReady={setPag}
          />
        </Stagger>
      </div>
    </PageTransition>
  );
}

export default function ProductosPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-6">
          <LoadingCenter />
        </div>
      }
    >
      <ProductosContent />
    </Suspense>
  );
}
