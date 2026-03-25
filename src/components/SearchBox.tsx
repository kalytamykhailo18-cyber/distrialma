"use client";

import { useState, useEffect, useRef } from "react";
import { HiOutlineSearch } from "react-icons/hi";

interface Props {
  initialValue?: string;
  onSearch: (value: string) => void;
}

export default function SearchBox({ initialValue, onSearch }: Props) {
  const restoredRef = useRef(false);
  const [value, setValue] = useState(() => {
    if (initialValue) return initialValue;
    if (typeof window !== "undefined") {
      const saved = sessionStorage.getItem("productSearchText");
      if (saved) return saved;
    }
    return "";
  });
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Fire initial search if restored from sessionStorage
  useEffect(() => {
    if (!restoredRef.current && value && !initialValue) {
      restoredRef.current = true;
      onSearch(value.trim());
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value.trim());
      sessionStorage.setItem("productSearchText", value.trim());
    }, 400);
    return () => clearTimeout(timerRef.current);
  }, [value]);

  return (
    <div className="relative">
      <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-brand-500" />
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar productos..."
        className="w-full pl-10 pr-4 py-2.5 border border-brand-600 rounded-xl text-sm font-medium focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-700"
      />
    </div>
  );
}
