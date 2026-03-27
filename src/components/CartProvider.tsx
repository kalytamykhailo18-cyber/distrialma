"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { CartItem } from "@/types";

// Cart key: sku + mode combination (same product can be in cart as unit AND box)
function cartKey(sku: string, mode: string): string {
  return `${sku}::${mode}`;
}

function itemKey(item: CartItem): string {
  return cartKey(item.sku, item.mode);
}

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity" | "mode">, mode?: "unit" | "box") => void;
  removeItem: (sku: string, mode: "unit" | "box") => void;
  updateQuantity: (sku: string, mode: "unit" | "box", quantity: number) => void;
  clearCart: () => void;
  findItem: (sku: string, mode: "unit" | "box") => CartItem | undefined;
  totalItems: number;
  totalPrice: number;
}

const CartContext = createContext<CartContextType | null>(null);

const STORAGE_KEY = "distrialma_cart";

function loadCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveCart(items: CartItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full or unavailable
  }
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setItems(loadCart());
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveCart(items);
  }, [items, loaded]);

  const addItem = useCallback(
    (item: Omit<CartItem, "quantity" | "mode">, mode: "unit" | "box" = "unit") => {
      const key = cartKey(item.sku, mode);
      const minQty = mode === "unit" && item.pesoMayorista > 0 ? item.pesoMayorista : 1;
      setItems((prev) => {
        const existing = prev.find((i) => itemKey(i) === key);
        if (existing) {
          return prev.map((i) =>
            itemKey(i) === key ? { ...i, quantity: i.quantity + 1 } : i
          );
        }
        return [...prev, { ...item, quantity: minQty, mode }];
      });
    },
    []
  );

  const removeItem = useCallback((sku: string, mode: "unit" | "box") => {
    const key = cartKey(sku, mode);
    setItems((prev) => prev.filter((i) => itemKey(i) !== key));
  }, []);

  const updateQuantity = useCallback((sku: string, mode: "unit" | "box", quantity: number) => {
    const key = cartKey(sku, mode);
    setItems((prev) =>
      prev.map((i) => {
        if (itemKey(i) !== key) return i;
        const minQty = i.mode === "unit" && i.pesoMayorista > 0 ? i.pesoMayorista : 1;
        const newQty = Math.max(minQty, quantity);
        return { ...i, quantity: newQty };
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const findItem = (sku: string, mode: "unit" | "box") => {
    return items.find((i) => i.sku === sku && i.mode === mode);
  };

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  // Check which SKUs have a box entry (for pricing unit entries at caja price)
  const skusWithBox = new Set(
    items.filter((i) => i.mode === "box" && i.precioCajaCerrada > 0).map((i) => i.sku)
  );

  const totalPrice = items.reduce((sum, i) => {
    if (i.mode === "box" && i.precioCajaCerrada > 0) {
      return sum + i.precioCajaCerrada * i.cantidadPorCaja * i.quantity;
    }
    // Unit mode: use caja cerrada price if same SKU has a box entry, or qty >= cantidadPorCaja
    if (i.mode === "unit" && i.precioCajaCerrada > 0 && (skusWithBox.has(i.sku) || (i.cantidadPorCaja > 0 && i.quantity >= i.cantidadPorCaja))) {
      return sum + i.precioCajaCerrada * i.quantity;
    }
    return sum + i.precioMayorista * i.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        clearCart,
        findItem,
        totalItems,
        totalPrice,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
