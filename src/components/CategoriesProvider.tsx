"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Category } from "@/types";

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
}

const CategoriesContext = createContext<CategoriesContextType>({
  categories: [],
  loading: true,
});

export function useCategories() {
  return useContext(CategoriesContext);
}

export default function CategoriesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setCategories(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <CategoriesContext.Provider value={{ categories, loading }}>
      {children}
    </CategoriesContext.Provider>
  );
}
