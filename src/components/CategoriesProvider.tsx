"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Category } from "@/types";

interface CategoriesContextType {
  categories: Category[];
  loading: boolean;
  filter: string;
  setFilter: (value: string) => void;
}

const CategoriesContext = createContext<CategoriesContextType>({
  categories: [],
  loading: true,
  filter: "",
  setFilter: () => {},
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
  const [filter, setFilter] = useState("");

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
    <CategoriesContext.Provider value={{ categories, loading, filter, setFilter }}>
      {children}
    </CategoriesContext.Provider>
  );
}
