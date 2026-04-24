export const ALL_PERMISSIONS = [
  { key: "productos", label: "Productos" },
  { key: "configuracion", label: "Configuración" },
  { key: "categorias", label: "Categorías" },
  { key: "marcas", label: "Marcas" },
  { key: "combos", label: "Combos" },
  { key: "pedidos", label: "Pedidos" },
  { key: "reparto", label: "Reparto" },
  { key: "dias-entrega", label: "Días Entrega" },
  { key: "informes", label: "Informes" },
  { key: "dashboard", label: "Dashboard" },
  { key: "cheques", label: "Cheques" },
  { key: "clientes", label: "Clientes" },
  { key: "notificaciones", label: "Notificaciones WhatsApp" },
  { key: "etiquetas", label: "Etiquetas" },
  { key: "picking", label: "Picking" },
  { key: "compras", label: "Compras" },
  { key: "costeo", label: "Costeo" },
  { key: "movimientos", label: "Movimientos Internos" },
  { key: "vendedores", label: "Vendedores (admin)" },
  { key: "vendedor", label: "Vendedor (toma pedidos)" },
  { key: "cierre-caja", label: "Cierre de Caja" },
  { key: "usuarios", label: "Usuarios" },
  { key: "terminales", label: "Terminales POS" },
  { key: "difusion", label: "Difusion WhatsApp" },
] as const;

// Special flags (not page permissions, but user config options)
export const USER_FLAGS = [
  { key: "minorista", label: "Etiquetas Minorista", description: "Muestra precios minoristas en etiquetas" },
] as const;

export type Permission = (typeof ALL_PERMISSIONS)[number]["key"];

export const VALID_PERM_KEYS: string[] = [
  ...ALL_PERMISSIONS.map((p) => p.key),
  ...USER_FLAGS.map((f) => f.key),
];

// Map admin pages to their required permission
export const PAGE_PERMISSION_MAP: Record<string, Permission> = {
  "/admin": "productos",
  "/admin/configuracion": "configuracion",
  "/admin/categorias": "categorias",
  "/admin/marcas": "marcas",
  "/admin/combos": "combos",
  "/admin/pedidos": "pedidos",
  "/admin/dias-entrega": "dias-entrega",
  "/admin/informes": "informes",
  "/admin/dashboard": "dashboard",
  "/admin/resumen-productos": "dashboard",
  "/admin/etiquetas": "etiquetas",
  "/admin/compras": "compras",
  "/admin/precios": "costeo",
  "/admin/proveedores": "compras",
  "/admin/movimientos": "movimientos",
  "/admin/vendedores": "vendedores",
  "/admin/clientes": "clientes",
  "/admin/vendedor": "vendedor",
  "/admin/picking": "picking",
  "/admin/pedidosya": "costeo",
  "/admin/cierre-caja": "cierre-caja",
  "/admin/resumen-empleado": "cierre-caja",
  "/admin/cheques": "cheques",
  "/admin/notificaciones": "notificaciones",
  "/admin/notificaciones/reactivar": "notificaciones",
  "/admin/usuarios": "usuarios",
  "/admin/reparto": "reparto",
  "/admin/terminales": "terminales",
  "/admin/difusion": "difusion",
  "/admin/bot-qr": "clientes",
};

export function hasPermission(
  role: string | undefined,
  permissions: string[] | undefined,
  required: Permission
): boolean {
  if (role === "admin") return true;
  return permissions?.includes(required) ?? false;
}

export function isStaffUser(role: string | undefined): boolean {
  return role === "admin" || role === "staff";
}
