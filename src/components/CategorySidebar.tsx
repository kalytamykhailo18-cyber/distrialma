"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Category } from "@/types";

export default function CategorySidebar({
  activeId,
}: {
  activeId?: string;
}) {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then(setCategories)
      .catch(() => {});
  }, []);

  return (
    <aside className="w-full">
      <h2 className="font-semibold text-gray-900 mb-3">Categorías</h2>
      <ul className="space-y-1">
        <li>
          <Link
            href="/productos"
            className={`block px-3 py-1.5 text-sm rounded-lg ${
              !activeId
                ? "bg-blue-50 text-blue-700 font-medium"
                : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            Todas
          </Link>
        </li>
        {categories.map((cat) => (
          <li key={cat.id}>
            <Link
              href={`/categoria/${cat.id}`}
              className={`block px-3 py-1.5 text-sm rounded-lg ${
                activeId === cat.id
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat.name}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
