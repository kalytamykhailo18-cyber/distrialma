"use client";

import { useState, useEffect, useRef } from "react";

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
    <input
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Buscar productos..."
      className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
    />
  );
}
