"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState, useRef, useEffect } from "react";
import { useCart } from "./CartProvider";
import { hasPermission, isStaffUser } from "@/lib/permissions";
import {
  HiOutlineShoppingCart, HiOutlineUser, HiChevronDown, HiX, HiMenu,
  HiOutlineCube, HiOutlineCog, HiOutlineViewGrid, HiOutlineTag,
  HiOutlineGift, HiOutlineClipboardList, HiOutlineTruck, HiOutlineCalendar,
  HiOutlineChartBar, HiOutlineUserGroup, HiOutlinePrinter,
  HiOutlineDocumentText, HiOutlineCreditCard, HiOutlineLogout,
  HiOutlineOfficeBuilding, HiOutlineCurrencyDollar,
} from "react-icons/hi";
import type { IconType } from "react-icons";

const ICON_MAP: Record<string, IconType> = {
  productos: HiOutlineCube,
  configuracion: HiOutlineCog,
  categorias: HiOutlineViewGrid,
  marcas: HiOutlineTag,
  combos: HiOutlineGift,
  pedidos: HiOutlineClipboardList,
  reparto: HiOutlineTruck,
  "dias-entrega": HiOutlineCalendar,
  informes: HiOutlineChartBar,
  compras: HiOutlineShoppingCart,
  precios: HiOutlineCurrencyDollar,
  proveedores: HiOutlineOfficeBuilding,
  usuarios: HiOutlineUserGroup,
  etiquetas: HiOutlinePrinter,
  "mis-pedidos": HiOutlineClipboardList,
  "mi-cuenta": HiOutlineCreditCard,
  "lista-precios": HiOutlineDocumentText,
};

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

  const STAFF_MENU: { href: string; label: string; perm: string; iconKey: string }[] = [
    { href: "/admin", label: "Productos", perm: "productos", iconKey: "productos" },
    { href: "/admin/configuracion", label: "Configuración", perm: "configuracion", iconKey: "configuracion" },
    { href: "/admin/categorias", label: "Categorías", perm: "categorias", iconKey: "categorias" },
    { href: "/admin/marcas", label: "Marcas", perm: "marcas", iconKey: "marcas" },
    { href: "/admin/combos", label: "Combos", perm: "combos", iconKey: "combos" },
    { href: "/admin/pedidos", label: "Pedidos", perm: "pedidos", iconKey: "pedidos" },
    { href: "/reparto", label: "Reparto", perm: "reparto", iconKey: "reparto" },
    { href: "/admin/dias-entrega", label: "Días Entrega", perm: "dias-entrega", iconKey: "dias-entrega" },
    { href: "/admin/informes", label: "Informes", perm: "informes", iconKey: "informes" },
    { href: "/admin/compras", label: "Compras", perm: "compras", iconKey: "compras" },
    { href: "/admin/precios", label: "Precios", perm: "costeo", iconKey: "precios" },
    { href: "/admin/proveedores", label: "Proveedores", perm: "compras", iconKey: "proveedores" },
    { href: "/admin/usuarios", label: "Usuarios", perm: "usuarios", iconKey: "usuarios" },
    { href: "/admin/etiquetas", label: "Etiquetas", perm: "etiquetas", iconKey: "etiquetas" },
  ];

  const CUSTOMER_MENU: { href: string; label: string; iconKey: string }[] = [
    { href: "/mis-pedidos", label: "Mis Pedidos", iconKey: "mis-pedidos" },
    { href: "/estado-cuenta", label: "Mi Cuenta", iconKey: "mi-cuenta" },
    { href: "/lista-precios", label: "Lista Precios", iconKey: "lista-precios" },
  ];

  function getUserMenuItems(): { href: string; label: string; iconKey: string }[] {
    if (!session?.user) return [];
    if (isStaff) {
      return STAFF_MENU.filter((item) =>
        hasPermission(role, permissions, item.perm as Parameters<typeof hasPermission>[2])
      );
    }
    return CUSTOMER_MENU;
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
            <HiOutlineShoppingCart className="w-6 h-6" />
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
                <HiOutlineUser className="w-4 h-4" />
                <span className="max-w-[120px] truncate">{session.user.name}</span>
                <HiChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${dropdownOpen ? "rotate-180" : ""}`} />
              </button>

              <div
                className={`absolute right-0 mt-1 w-52 bg-white rounded-lg border shadow-lg py-1 z-50 origin-top transition-all duration-200 ease-out ${
                  dropdownOpen
                    ? "opacity-100 scale-100 translate-y-0"
                    : "opacity-0 scale-95 -translate-y-1 pointer-events-none"
                }`}
              >
                {menuItems.map((item) => {
                  const Icon = ICON_MAP[item.iconKey];
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-2.5 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:text-brand-600 transition-colors"
                    >
                      {Icon && <Icon className="w-4 h-4 text-gray-400" />}
                      {item.label}
                    </Link>
                  );
                })}
                <div className="border-t my-1" />
                <button
                  onClick={() => { setSigningOut(true); signOut(); setDropdownOpen(false); }}
                  disabled={signingOut}
                  className="w-full text-left flex items-center gap-2.5 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  <HiOutlineLogout className="w-4 h-4" />
                  {signingOut ? "Saliendo..." : "Salir"}
                </button>
              </div>
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
            <HiOutlineShoppingCart className="w-6 h-6" />
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
            {menuOpen ? (
              <HiX className="w-6 h-6" />
            ) : (
              <HiMenu className="w-6 h-6" />
            )}
          </button>
        </div>
      </div>

      {/* Mobile slide-down */}
      <div
        className={`md:hidden overflow-hidden transition-all duration-300 ease-in-out ${
          menuOpen ? "max-h-[calc(100vh-56px)] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <div className="border-t bg-white px-4 py-3 space-y-3 overflow-y-auto max-h-[calc(100vh-56px)] scroll-auto">
          <div className="flex flex-col gap-3">
            {navLinks}
          </div>
          <div className="border-t pt-3 flex flex-col gap-1">
            {session?.user && (
              <span className="text-sm text-gray-500 font-medium px-2 mb-1">{session.user.name}</span>
            )}
            {menuItems.map((item) => {
              const Icon = ICON_MAP[item.iconKey];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2.5 text-sm text-gray-600 hover:text-brand-600 hover:bg-gray-50 px-2 py-1.5 rounded-lg transition-colors"
                >
                  {Icon && <Icon className="w-4 h-4 text-gray-400" />}
                  {item.label}
                </Link>
              );
            })}
            {session?.user ? (
              <button
                onClick={() => { setSigningOut(true); signOut(); setMenuOpen(false); }}
                disabled={signingOut}
                className="flex items-center gap-2.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50 text-left px-2 py-1.5 rounded-lg transition-colors"
              >
                <HiOutlineLogout className="w-4 h-4" />
                {signingOut ? "Saliendo..." : "Salir"}
              </button>
            ) : (
              <Link
                href="/login"
                className="text-sm bg-brand-400 text-white px-4 py-2 rounded-lg hover:bg-brand-500 text-center mt-1"
                onClick={() => setMenuOpen(false)}
              >
                Ingresar
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
