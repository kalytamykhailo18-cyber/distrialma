"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export default function Navbar() {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <Link href="/" className="text-xl font-bold text-brand-400 shrink-0">
          Distrialma
        </Link>

        <div className="flex items-center gap-3 shrink-0">
          <Link
            href="/productos"
            className="text-sm text-gray-600 hover:text-brand-400"
          >
            Productos
          </Link>
          {session?.user ? (
            <>
              {(session.user as { role?: string }).role === "admin" && (
                <Link
                  href="/admin"
                  className="text-sm text-gray-600 hover:text-brand-400"
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
              className="text-sm bg-brand-400 text-white px-4 py-2 rounded-lg hover:bg-brand-500"
            >
              Ingresar
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
