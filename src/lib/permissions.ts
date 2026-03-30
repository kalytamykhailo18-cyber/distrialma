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
  { key: "etiquetas", label: "Etiquetas" },
  { key: "picking", label: "Picking" },
  { key: "compras", label: "Compras" },
  { key: "costeo", label: "Costeo" },
  { key: "usuarios", label: "Usuarios" },
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
  "/admin/etiquetas": "etiquetas",
  "/admin/compras": "compras",
  "/admin/precios": "costeo",
  "/admin/proveedores": "compras",
  "/admin/picking": "picking",
  "/admin/pedidosya": "costeo",
  "/admin/usuarios": "usuarios",
  "/reparto": "reparto",
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
