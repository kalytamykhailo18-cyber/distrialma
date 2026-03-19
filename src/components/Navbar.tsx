"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useCart } from "./CartProvider";

export default function Navbar() {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const { totalItems } = useCart();

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
          <Link
            href="/carrito"
            className="relative text-gray-600 hover:text-brand-400"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-brand-400 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
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
