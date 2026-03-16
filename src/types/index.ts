export interface Product {
  sku: string;
  name: string;
  categoryId: string;
  category: string;
  brandId: string;
  brand: string;
  barcode: string;
  precioMayorista: number;
  precioCajaCerrada: number;
  precioEspecial?: number;
  stock: number;
  images: string[];
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
  price: number;
  priceLabel: string;
  quantity: number;
}
