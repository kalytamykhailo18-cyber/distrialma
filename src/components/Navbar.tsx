"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";
import { useCart } from "./CartProvider";

export default function Navbar() {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { totalItems } = useCart();

  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const navLinks = (
    <>
      <Link href="/productos" className="text-sm text-gray-600 hover:text-brand-600" onClick={() => setMenuOpen(false)}>
        Productos
      </Link>
      <a href="/#novedades" className="text-sm text-gray-600 hover:text-brand-600" onClick={() => setMenuOpen(false)}>
        Novedades
      </a>
      <a href="/#marcas" className="text-sm text-gray-600 hover:text-brand-600" onClick={() => setMenuOpen(false)}>
        Marcas
      </a>
      <a href="/#locales" className="text-sm text-gray-600 hover:text-brand-600" onClick={() => setMenuOpen(false)}>
        Locales
      </a>
    </>
  );

  const userLinks = (
    <>
      {session?.user ? (
        <>
          {isAdmin ? (
            <Link href="/admin" className="text-sm text-gray-600 hover:text-brand-600" onClick={() => setMenuOpen(false)}>
              Admin
            </Link>
          ) : (session.user as { role?: string }).role === "etiquetas" ? (
            <Link href="/admin/etiquetas" className="text-sm text-gray-600 hover:text-brand-600" onClick={() => setMenuOpen(false)}>
              Etiquetas
            </Link>
          ) : (
            <Link href="/mis-pedidos" className="text-sm text-gray-600 hover:text-brand-600" onClick={() => setMenuOpen(false)}>
              Mis Pedidos
            </Link>
          )}
          <span className="text-sm text-gray-500 hidden md:inline">{session.user.name}</span>
          <button
            onClick={() => { setSigningOut(true); signOut(); setMenuOpen(false); }}
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
          onClick={() => setMenuOpen(false)}
        >
          Ingresar
        </Link>
      )}
    </>
  );

  return (
    <nav className="bg-white shadow-sm border-b sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="shrink-0">
          <img src="/logo.png" alt="Distrialma" className="h-10" />
        </Link>

        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-4">
          {navLinks}
        </div>

        {/* Desktop right */}
        <div className="hidden md:flex items-center gap-3">
          <Link href="/carrito" className="relative text-gray-600 hover:text-brand-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-brand-400 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Link>
          {userLinks}
        </div>

        {/* Mobile: cart + hamburger */}
        <div className="flex md:hidden items-center gap-3">
          <Link href="/carrito" className="relative text-gray-600">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
            </svg>
            {totalItems > 0 && (
              <span className="absolute -top-2 -right-2 bg-brand-400 text-white text-xs w-5 h-5 flex items-center justify-center rounded-full font-medium">
                {totalItems > 99 ? "99+" : totalItems}
              </span>
            )}
          </Link>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="text-gray-600 hover:text-brand-600"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t bg-white px-4 py-3 space-y-3">
          <div className="flex flex-col gap-3">
            {navLinks}
          </div>
          <div className="border-t pt-3 flex flex-col gap-3">
            {session?.user && (
              <span className="text-sm text-gray-500">{session.user.name}</span>
            )}
            {userLinks}
          </div>
        </div>
      )}
    </nav>
  );
}
