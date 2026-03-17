"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { Category, Brand } from "@/types";

interface CategoriesContextType {
  categories: Category[];
  brands: Brand[];
  loading: boolean;
  filter: string;
  setFilter: (value: string) => void;
  brandFilter: string;
  setBrandFilter: (value: string) => void;
}

const CategoriesContext = createContext<CategoriesContextType>({
  categories: [],
  brands: [],
  loading: true,
  filter: "",
  setFilter: () => {},
  brandFilter: "",
  setBrandFilter: () => {},
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
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/categories").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
    ])
      .then(([cats, brnds]) => {
        if (Array.isArray(cats)) setCategories(cats);
        if (Array.isArray(brnds)) setBrands(brnds);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <CategoriesContext.Provider
      value={{ categories, brands, loading, filter, setFilter, brandFilter, setBrandFilter }}
    >
      {children}
    </CategoriesContext.Provider>
  );
}
