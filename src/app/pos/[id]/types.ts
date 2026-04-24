export interface Terminal {
  id: number; nombre: string; sucursal: string; sucursalNombre: string;
  listas: string; cuit: string; flujo: string; requiereCliente: boolean;
  esCajero: boolean; modoPrueba: boolean; permisoPrecio: boolean;
}

export interface Pendiente {
  boleta: string; nroped: string; total: number; cant: number; fecha: string; hora: string;
  clienteCod: string; clienteNombre: string; empleadoCod: string; empleadoNombre: string; origen: string; notas: string;
  items: Array<{ sku: string; nombre: string; cantidad: number; precio: number; impo: number; lista: number }>;
}

export interface Empleado { cod: string; nombre: string; }
export interface Cliente { cod: string; nombre: string; cuit: string; zona: string; listaPrecios: string; }
export interface PosPromo { desde: number; precio: number; tipo: "por-unidad" | "precio-fijo"; label: string; }

export interface PosProduct {
  sku: string; nombre: string; unidad: string; precios: Record<number, number>;
  stock: number; codBarra: string; cantPorCaja: number; images: string[]; promos: PosPromo[];
}

export interface CartItem {
  sku: string; nombre: string; unidad: string; cantidad: number;
  precio: number; originalPrecio?: number; lista: number; images: string[];
}

export const LISTA_LABELS: Record<number, string> = { 1: "Minorista", 2: "Mayorista", 3: "Especial", 4: "Caja Cerrada", 5: "PedidosYa" };
export const STORAGE_KEY = "pos_cart_";
