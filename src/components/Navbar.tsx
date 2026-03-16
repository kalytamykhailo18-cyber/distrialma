"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Navbar() {
  const { data: session } = useSession();
  const [search, setSearch] = useState("");
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (search.trim()) {
      router.push(`/productos?search=${encodeURIComponent(search.trim())}`);
    }
  }

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold text-blue-700 shrink-0">
          Distrialma
        </Link>

        <form onSubmit={handleSearch} className="flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar productos..."
            className="w-full px-4 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </form>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/productos"
            className="text-sm text-gray-600 hover:text-blue-700"
          >
            Productos
          </Link>
          {session?.user ? (
            <>
              {(session.user as { role?: string }).role === "admin" && (
                <Link
                  href="/admin"
                  className="text-sm text-gray-600 hover:text-blue-700"
                >
                  Admin
                </Link>
              )}
              <span className="text-sm text-gray-500">
                {session.user.name}
              </span>
              <button
                onClick={() => {
                  setSigningOut(true);
                  signOut();
                }}
                disabled={signingOut}
                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
              >
                {signingOut ? "Saliendo..." : "Salir"}
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
