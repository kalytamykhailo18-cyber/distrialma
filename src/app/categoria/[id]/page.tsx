"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import ProductGrid, { PaginationState } from "@/components/ProductGrid";
import CategorySidebar from "@/components/CategorySidebar";
import PaginationCompact from "@/components/PaginationCompact";
import SearchBox from "@/components/SearchBox";
import { useCategories } from "@/components/CategoriesProvider";
import ComboGrid from "@/components/ComboGrid";

export default function CategoriaPage() {
  const { id } = useParams<{ id: string }>();
  const { categories } = useCategories();
  const category = categories.find((c) => c.id === id);
  const categoryName = category?.name;
  const isComboCategory = categoryName?.toUpperCase() === "COMBOS";
  const [search, setSearch] = useState("");
  const [pag, setPag] = useState<PaginationState | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-base md:text-xl font-bold text-gray-900">
          Productos {categoryName && <span className="text-sm md:text-lg text-gray-500 font-normal">/ Categoría: {categoryName}</span>}
        </h1>
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-sm">
          <SearchBox onSearch={setSearch} />
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
      <div className="md:flex md:gap-6">
        <div className="md:w-56 shrink-0">
          <CategorySidebar activeId={id} />
        </div>
        <div className="flex-1">
          {isComboCategory ? (
            <ComboGrid />
          ) : (
            <ProductGrid
              categoryId={id}
              search={search || undefined}
              onPaginationReady={setPag}
            />
          )}
        </div>
      </div>
    </div>
  );
}
