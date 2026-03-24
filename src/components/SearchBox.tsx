"use client";

import { useState, useEffect, useRef } from "react";
import { HiOutlineSearch } from "react-icons/hi";

interface Props {
  initialValue?: string;
  onSearch: (value: string) => void;
}

export default function SearchBox({ initialValue, onSearch }: Props) {
  const [value, setValue] = useState(initialValue || "");
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onSearch(value.trim());
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
