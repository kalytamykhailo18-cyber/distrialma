"use client";

import { createContext, useContext, useState, useEffect, useCallback } from "react";
import type { CartItem } from "@/types";

interface CartContextType {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "quantity" | "mode">, mode?: "unit" | "box") => void;
  removeItem: (sku: string) => void;
  updateQuantity: (sku: string, quantity: number) => void;
  updateMode: (sku: string, mode: "unit" | "box") => void;
  clearCart: () => void;
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
      const minQty = mode === "unit" && item.pesoMayorista > 0 ? item.pesoMayorista : 1;
      setItems((prev) => {
        const existing = prev.find((i) => i.sku === item.sku);
        if (existing) {
          const step = existing.mode === "unit" && existing.pesoMayorista > 0 ? existing.pesoMayorista : 1;
          return prev.map((i) =>
            i.sku === item.sku ? { ...i, quantity: i.quantity + step } : i
          );
        }
        return [...prev, { ...item, quantity: minQty, mode }];
      });
    },
    []
  );

  const removeItem = useCallback((sku: string) => {
    setItems((prev) => prev.filter((i) => i.sku !== sku));
  }, []);

  const updateQuantity = useCallback((sku: string, quantity: number) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.sku !== sku) return i;
        const minQty = i.mode === "unit" && i.pesoMayorista > 0 ? i.pesoMayorista : 1;
        const newQty = Math.max(minQty, quantity);
        return { ...i, quantity: newQty };
      })
    );
  }, []);

  const updateMode = useCallback((sku: string, mode: "unit" | "box") => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.sku !== sku) return i;
        const minQty = mode === "unit" && i.pesoMayorista > 0 ? i.pesoMayorista : 1;
        const newQty = Math.max(minQty, i.quantity);
        return { ...i, mode, quantity: newQty };
      })
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
  }, []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  const totalPrice = items.reduce((sum, i) => {
    const price = i.mode === "box" && i.precioCajaCerrada > 0
      ? i.precioCajaCerrada * i.cantidadPorCaja
      : i.precioMayorista;
    return sum + price * i.quantity;
  }, 0);

  return (
    <CartContext.Provider
      value={{
        items,
        addItem,
        removeItem,
        updateQuantity,
        updateMode,
        clearCart,
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
