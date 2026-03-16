"use client";

import { useParams } from "next/navigation";
import ProductGrid from "@/components/ProductGrid";
import CategorySidebar from "@/components/CategorySidebar";

export default function CategoriaPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Productos por Categoría
      </h1>
      <div className="flex gap-6">
        <div className="hidden md:block w-56 shrink-0">
          <CategorySidebar activeId={id} />
        </div>
        <div className="flex-1">
          <ProductGrid categoryId={id} />
        </div>
      </div>
    </div>
  );
}
