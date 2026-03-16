"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProductGrid from "@/components/ProductGrid";
import CategorySidebar from "@/components/CategorySidebar";

function ProductosContent() {
  const searchParams = useSearchParams();
  const search = searchParams.get("search") || undefined;

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {search ? `Resultados para "${search}"` : "Todos los Productos"}
      </h1>
      <div className="flex gap-6">
        <div className="hidden md:block w-56 shrink-0">
          <CategorySidebar />
        </div>
        <div className="flex-1">
          <ProductGrid search={search} />
        </div>
      </div>
    </div>
  );
}

export default function ProductosPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 py-6 text-gray-500">
          Cargando...
        </div>
      }
    >
      <ProductosContent />
    </Suspense>
  );
}
