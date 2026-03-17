"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import ProductGrid, { PaginationState } from "@/components/ProductGrid";
import CategorySidebar from "@/components/CategorySidebar";
import PaginationCompact from "@/components/PaginationCompact";
import SearchBox from "@/components/SearchBox";
import { useCategories } from "@/components/CategoriesProvider";

export default function CategoriaPage() {
  const { id } = useParams<{ id: string }>();
  const { categories } = useCategories();
  const categoryName = categories.find((c) => c.id === id)?.name;
  const [pag, setPag] = useState<PaginationState | null>(null);

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl md:text-2xl font-bold text-gray-900">
          {categoryName || "Productos"}
        </h1>
        <div className="order-3 md:order-2 w-full md:w-auto md:flex-1 md:max-w-sm">
          <SearchBox />
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
          <ProductGrid categoryId={id} onPaginationReady={setPag} />
        </div>
      </div>
    </div>
  );
}
