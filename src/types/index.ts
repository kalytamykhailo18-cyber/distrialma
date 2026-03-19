export interface Product {
  sku: string;
  name: string;
  categoryId: string;
  category: string;
  brandId: string;
  brand: string;
  barcode: string;
  unit: string;
  minimoCompra: string;
  pesoMayorista: number;
  cantidadPorCaja: number;
  precioMinorista?: number;
  precioMayorista: number;
  precioCajaCerrada: number;
  precioEspecial?: number;
  stock: number;
  images: { id: number; url: string }[];
  description?: string;
}

export interface Category {
  id: string;
  name: string;
}

export interface Brand {
  id: string;
  name: string;
}

export interface CartItem {
  sku: string;
  name: string;
  unit: string;
  pesoMayorista: number;
  precioMayorista: number;
  precioCajaCerrada: number;
  cantidadPorCaja: number;
  quantity: number;
  mode: "unit" | "box";
}
