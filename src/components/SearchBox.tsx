"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SearchBox({ initialValue }: { initialValue?: string }) {
  const [search, setSearch] = useState(initialValue || "");
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/productos?search=${encodeURIComponent(search.trim())}`);
    } else {
      router.push("/productos");
    }
  }

  return (
    <form onSubmit={handleSearch} className="w-full">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar productos..."
        className="w-full px-3 py-1.5 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </form>
  );
}
