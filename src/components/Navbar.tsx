"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { useCart } from "./CartProvider";
import { hasPermission, isStaffUser } from "@/lib/permissions";

export default function Navbar() {
  const { data: session } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const { totalItems } = useCart();

  const user = session?.user as { role?: string; permissions?: string[]; name?: string } | undefined;
  const role = user?.role;
  const permissions = user?.permissions;
  const isStaff = isStaffUser(role);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [dropdownOpen]);

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

  const STAFF_MENU: { href: string; label: string; perm: string }[] = [
    { href: "/admin", label: "Productos", perm: "productos" },
    { href: "/admin/configuracion", label: "Configuración", perm: "configuracion" },
    { href: "/admin/categorias", label: "Categorías", perm: "categorias" },
    { href: "/admin/marcas", label: "Marcas", perm: "marcas" },
    { href: "/admin/combos", label: "Combos", perm: "combos" },
    { href: "/admin/pedidos", label: "Pedidos", perm: "pedidos" },
    { href: "/reparto", label: "Reparto", perm: "reparto" },
    { href: "/admin/dias-entrega", label: "Días Entrega", perm: "dias-entrega" },
    { href: "/admin/informes", label: "Informes", perm: "informes" },
    { href: "/admin/usuarios", label: "Usuarios", perm: "usuarios" },
    { href: "/admin/etiquetas", label: "Etiquetas", perm: "etiquetas" },
  ];

  function getUserMenuItems(): { href: string; label: string }[] {
    if (!session?.user) return [];
    if (isStaff) {
      return STAFF_MENU.filter((item) =>
        hasPermission(role, permissions, item.perm as Parameters<typeof hasPermission>[2])
      );
    }
    return [
      { href: "/mis-pedidos", label: "Mis Pedidos" },
      { href: "/estado-cuenta", label: "Mi Cuenta" },
      { href: "/lista-precios", label: "Lista Precios" },
    ];
  }

  const menuItems = getUserMenuItems();

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
          {/* Cart */}
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

          {/* User dropdown or login */}
          {session?.user ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-brand-600 px-3 py-1.5 rounded-lg border border-gray-200 hover:border-brand-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span className="max-w-[120px] truncate">{session.user.name}</span>
                <svg className={`w-3.5 h-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg border shadow-lg py-1 z-50">
                  {menuItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDropdownOpen(false)}
                      className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-brand-600"
                    >
                      {item.label}
                    </Link>
                  ))}
                  <div className="border-t my-1" />
                  <button
                    onClick={() => { setSigningOut(true); signOut(); setDropdownOpen(false); }}
                    disabled={signingOut}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {signingOut ? "Saliendo..." : "Salir"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/login"
              className="text-sm bg-brand-400 text-white px-4 py-2 rounded-lg hover:bg-brand-500"
            >
              Ingresar
            </Link>
          )}
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
              <span className="text-sm text-gray-500 font-medium">{session.user.name}</span>
            )}
            {menuItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className="text-sm text-gray-600 hover:text-brand-600"
              >
                {item.label}
              </Link>
            ))}
            {session?.user ? (
              <button
                onClick={() => { setSigningOut(true); signOut(); setMenuOpen(false); }}
                disabled={signingOut}
                className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50 text-left"
              >
                {signingOut ? "Saliendo..." : "Salir"}
              </button>
            ) : (
              <Link
                href="/login"
                className="text-sm bg-brand-400 text-white px-4 py-2 rounded-lg hover:bg-brand-500 text-center"
                onClick={() => setMenuOpen(false)}
              >
                Ingresar
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
