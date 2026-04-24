"use client";

import { useSession, signOut } from "next-auth/react";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { PAGE_PERMISSION_MAP, hasPermission, isStaffUser } from "@/lib/permissions";
import {
  HiOutlineShoppingCart, HiOutlineCube, HiOutlineTruck, HiOutlineCurrencyDollar,
  HiOutlineChartBar, HiOutlineCog, HiOutlineChat, HiOutlineClipboardList,
  HiOutlineUserGroup, HiChevronDown, HiMenu, HiX, HiOutlineLogout,
} from "react-icons/hi";

interface MenuItem { href: string; label: string; perm: string }
interface MenuCategory { label: string; icon: React.ElementType; items: MenuItem[] }

const MENU_CATEGORIES: MenuCategory[] = [
  {
    label: "Catalogo", icon: HiOutlineCube, items: [
      { href: "/admin", label: "Productos", perm: "productos" },
      { href: "/admin/categorias", label: "Categorias", perm: "categorias" },
      { href: "/admin/marcas", label: "Marcas", perm: "marcas" },
      { href: "/admin/combos", label: "Combos", perm: "combos" },
      { href: "/admin/configuracion", label: "Configuracion", perm: "configuracion" },
    ],
  },
  {
    label: "Ventas", icon: HiOutlineShoppingCart, items: [
      { href: "/admin/pedidos", label: "Pedidos", perm: "pedidos" },
      { href: "/admin/reparto", label: "Reparto", perm: "reparto" },
      { href: "/admin/picking", label: "Picking", perm: "picking" },
      { href: "/admin/dias-entrega", label: "Dias Entrega", perm: "dias-entrega" },
      { href: "/admin/vendedor", label: "Tomar Pedido", perm: "vendedor" },
    ],
  },
  {
    label: "Compras", icon: HiOutlineTruck, items: [
      { href: "/admin/compras", label: "Ingresos", perm: "compras" },
      { href: "/admin/proveedores", label: "Proveedores", perm: "compras" },
      { href: "/admin/movimientos", label: "Movimientos", perm: "movimientos" },
      { href: "/admin/proveedores-productos", label: "Reposicion", perm: "compras" },
    ],
  },
  {
    label: "Precios", icon: HiOutlineCurrencyDollar, items: [
      { href: "/admin/precios", label: "Actualizar", perm: "costeo" },
      { href: "/admin/precios-masivos", label: "Masivos", perm: "costeo" },
      { href: "/admin/pedidosya", label: "PedidosYa", perm: "costeo" },
    ],
  },
  {
    label: "Caja", icon: HiOutlineClipboardList, items: [
      { href: "/admin/cierre-caja", label: "Cierre Caja", perm: "informes" },
      { href: "/admin/resumen-empleado", label: "Descuentos Empleados", perm: "informes" },
      { href: "/admin/cheques", label: "Cheques", perm: "cheques" },
      { href: "/admin/informes", label: "Informes", perm: "informes" },
    ],
  },
  {
    label: "Reportes", icon: HiOutlineChartBar, items: [
      { href: "/admin/dashboard", label: "Dashboard", perm: "dashboard" },
      { href: "/admin/resumen-productos", label: "Resumen Prod.", perm: "dashboard" },
    ],
  },
  {
    label: "WhatsApp", icon: HiOutlineChat, items: [
      { href: "/admin/inbox", label: "Inbox", perm: "informes" },
      { href: "/admin/notificaciones", label: "Deudas", perm: "notificaciones" },
      { href: "/admin/notificaciones/reactivar", label: "Reactivar clientes", perm: "notificaciones" },
      { href: "/admin/bot-qr", label: "Bot QR", perm: "clientes" },
    ],
  },
  {
    label: "Equipo", icon: HiOutlineUserGroup, items: [
      { href: "/admin/clientes", label: "Clientes", perm: "clientes" },
      { href: "/admin/vendedores", label: "Vendedores", perm: "vendedores" },
      { href: "/admin/usuarios", label: "Usuarios", perm: "usuarios" },
    ],
  },
  {
    label: "Config", icon: HiOutlineCog, items: [
      { href: "/admin/etiquetas", label: "Etiquetas", perm: "etiquetas" },
      { href: "/admin/terminales", label: "Terminales POS", perm: "terminales" },
      { href: "/admin/difusion", label: "Difusion WhatsApp", perm: "difusion" },
    ],
  },
];

function CollapsiblePanel({ open, children }: { open: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const firstRender = useRef(true);

  const measure = useCallback(() => {
    if (ref.current) setHeight(ref.current.scrollHeight);
  }, []);

  useEffect(() => {
    measure();
    if (firstRender.current) { firstRender.current = false; }
  }, [open, children, measure]);

  return (
    <div
      style={{
        height: open ? height : 0,
        opacity: open ? 1 : 0,
        transition: firstRender.current ? "none" : "height 280ms cubic-bezier(0.25, 1, 0.5, 1), opacity 200ms ease",
      }}
      className="overflow-hidden"
    >
      <div ref={ref}>{children}</div>
    </div>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const role = user?.role;
  const permissions = user?.permissions;
  const isStaff = isStaffUser(role);

  const requiredPerm = PAGE_PERMISSION_MAP[pathname] ||
    Object.entries(PAGE_PERMISSION_MAP)
      .sort((a, b) => b[0].length - a[0].length)
      .find(([path]) => pathname.startsWith(path + "/"))?.[1];

  const allowed = isStaff && (!requiredPerm || hasPermission(role, permissions, requiredPerm));

  // Auto-expand category of current page
  useEffect(() => {
    for (const cat of MENU_CATEGORIES) {
      if (cat.items.some((item) => item.href === pathname || (item.href !== "/admin" && pathname.startsWith(item.href + "/")))) {
        setExpandedCat(cat.label);
        break;
      }
    }
  }, [pathname]);

  // Close sidebar on navigation (mobile)
  useEffect(() => { setSidebarOpen(false); }, [pathname]);

  useEffect(() => {
    if (status === "loading") return;
    if (!session?.user || !isStaff) { router.push("/login"); return; }
    if (!allowed) {
      // Redirect to first permitted page
      for (const cat of MENU_CATEGORIES) {
        for (const item of cat.items) {
          if (hasPermission(role, permissions, item.perm as Parameters<typeof hasPermission>[2])) {
            router.push(item.href); return;
          }
        }
      }
      router.push("/");
      return;
    }
    // If on /admin exactly and not admin role, redirect to first permitted page
    if (pathname === "/admin" && role !== "admin") {
      for (const cat of MENU_CATEGORIES) {
        for (const item of cat.items) {
          if (item.href !== "/admin" && hasPermission(role, permissions, item.perm as Parameters<typeof hasPermission>[2])) {
            router.push(item.href); return;
          }
        }
      }
    }
  }, [session, status, router, allowed, isStaff, permissions, pathname, role]);

  if (status === "loading" || !session?.user || !allowed) {
    return <div className="max-w-7xl mx-auto px-4 py-12 text-center text-gray-500">Cargando...</div>;
  }

  const visibleCategories = MENU_CATEGORIES.map((cat) => ({
    ...cat,
    items: cat.items.filter((item) => hasPermission(role, permissions, item.perm as Parameters<typeof hasPermission>[2])),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="flex h-[calc(100vh-57px)] overflow-hidden">
      {/* Mobile overlay */}
      <div
        className={`fixed inset-0 z-40 md:hidden transition-opacity duration-300 ${sidebarOpen ? "bg-black/30 opacity-100" : "opacity-0 pointer-events-none"}`}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`fixed md:static inset-y-0 left-0 top-14 z-50 w-56 bg-white border-r flex flex-col transition-transform duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}`}>
        <div className="flex-1 overflow-y-auto py-2">
          {(() => {
            // Compute the single best-matching item (longest matching href) across all categories
            const allItems = visibleCategories.flatMap((c) => c.items);
            let bestMatchHref: string | null = null;
            let bestMatchLen = -1;
            for (const item of allItems) {
              if (item.href === pathname) {
                if (item.href.length > bestMatchLen) { bestMatchHref = item.href; bestMatchLen = item.href.length; }
              } else if (item.href !== "/admin" && pathname.startsWith(item.href + "/")) {
                if (item.href.length > bestMatchLen) { bestMatchHref = item.href; bestMatchLen = item.href.length; }
              }
            }
            return visibleCategories.map((cat) => {
            const isExpanded = expandedCat === cat.label;
            const Icon = cat.icon;
            const isActive = cat.items.some((item) => item.href === bestMatchHref);
            return (
              <div key={cat.label}>
                <button onClick={() => setExpandedCat(isExpanded ? null : cat.label)}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-all duration-200 ${isActive ? "text-gray-900 bg-gray-200" : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="flex-1 text-left">{cat.label}</span>
                  <HiChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isExpanded ? "rotate-180" : ""}`} />
                </button>
                <CollapsiblePanel open={isExpanded}>
                  <div className="ml-6 border-l pl-2 py-1">
                    {cat.items.map((item, i) => {
                      const itemActive = item.href === bestMatchHref;
                      return (
                        <Link key={item.href} href={item.href}
                          style={{ transitionDelay: isExpanded ? `${i * 30}ms` : "0ms" }}
                          className={`block px-3 py-1.5 text-sm rounded transition-all duration-200 ${isExpanded ? "opacity-100 translate-x-0" : "opacity-0 -translate-x-2"} ${itemActive ? "text-white font-medium bg-brand-500" : "text-gray-600 hover:text-brand-600 hover:bg-gray-100"}`}>
                          {item.label}
                        </Link>
                      );
                    })}
                  </div>
                </CollapsiblePanel>
              </div>
            );
          });
          })()}
        </div>
        {/* Logout */}
        <div className="border-t px-3 py-2">
          <button
            onClick={() => signOut()}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors duration-150"
          >
            <HiOutlineLogout className="w-4 h-4" />
            Salir
          </button>
        </div>
      </aside>

      {/* Mobile sidebar toggle */}
      <button onClick={() => setSidebarOpen(!sidebarOpen)}
        className="fixed bottom-4 left-4 z-50 md:hidden w-12 h-12 bg-brand-500 text-white rounded-full shadow-lg flex items-center justify-center">
        {sidebarOpen ? <HiX className="w-6 h-6" /> : <HiMenu className="w-6 h-6" />}
      </button>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-gray-50">
        {children}
      </main>
    </div>
  );
}
