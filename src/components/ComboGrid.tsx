"use client";

import { useEffect, useState } from "react";
import { useCart } from "./CartProvider";
import { formatPrice } from "@/lib/utils";

interface ComboItemDetail {
  sku: string;
  quantity: number;
  name: string;
  unitPrice: number;
  unit: string;
}

interface ComboData {
  id: number;
  name: string;
  description: string | null;
  price: number;
  items: ComboItemDetail[];
  originalPrice: number;
}

export default function ComboGrid() {
  const [combos, setCombos] = useState<ComboData[]>([]);
  const [loading, setLoading] = useState(true);
  const { addItem, items: cartItems } = useCart();
  const [addedId, setAddedId] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/combos")
      .then((r) => r.json())
      .then((data) => setCombos(data.combos || []))
      .catch(() => setCombos([]))
      .finally(() => setLoading(false));
  }, []);

  function handleAddCombo(combo: ComboData) {
    addItem(
      {
        sku: `combo-${combo.id}`,
        name: combo.name,
        unit: "UN",
        pesoMayorista: 0,
        precioMayorista: combo.price,
        precioCajaCerrada: 0,
        cantidadPorCaja: 0,
        isCombo: true,
        comboId: combo.id,
        comboItems: combo.items.map((i) => ({
          sku: i.sku,
          name: i.name,
          quantity: i.quantity,
        })),
      },
      "unit"
    );
    setAddedId(combo.id);
    setTimeout(() => setAddedId(null), 2000);
  }

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="bg-white rounded-lg border p-6 animate-pulse">
            <div className="h-6 bg-gray-200 rounded w-3/4 mb-3" />
            <div className="h-4 bg-gray-200 rounded w-1/2 mb-4" />
            <div className="h-10 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (combos.length === 0) {
    return (
      <p className="text-gray-400 text-center py-8">No hay combos disponibles.</p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {combos.map((combo) => {
        const inCart = cartItems.find((i) => i.sku === `combo-${combo.id}`);
        const discount = combo.originalPrice > 0
          ? Math.round((1 - combo.price / combo.originalPrice) * 100)
          : 0;

        return (
          <div key={combo.id} className="bg-white rounded-lg border p-5">
            <div className="flex items-start justify-between mb-2">
              <h3 className="font-semibold text-gray-900 text-lg">{combo.name}</h3>
              {discount > 0 && (
                <span className="bg-red-100 text-red-700 text-xs font-medium px-2 py-0.5 rounded-full">
                  -{discount}%
                </span>
              )}
            </div>

            {combo.description && (
              <p className="text-sm text-gray-500 mb-3">{combo.description}</p>
            )}

            {/* Items in combo */}
            <div className="bg-gray-50 rounded-lg p-3 mb-4 space-y-1.5">
              {combo.items.map((item) => (
                <div key={item.sku} className="flex justify-between text-sm">
                  <span className="text-gray-700">
                    {item.quantity > 1 && <span className="font-medium">{item.quantity}x </span>}
                    {item.name}
                  </span>
                  <span className="text-gray-400 line-through text-xs">
                    {formatPrice(item.unitPrice * item.quantity)}
                  </span>
                </div>
              ))}
            </div>

            {/* Prices */}
            <div className="flex items-end gap-3 mb-4">
              {combo.originalPrice > combo.price && (
                <span className="text-gray-400 line-through text-sm">
                  {formatPrice(combo.originalPrice)}
                </span>
              )}
              <span className="text-2xl font-bold text-green-700">
                {formatPrice(combo.price)}
              </span>
            </div>

            {/* Add to cart */}
            <button
              onClick={() => handleAddCombo(combo)}
              className="w-full py-2.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
            >
              {addedId === combo.id
                ? "Agregado!"
                : inCart
                ? `En carrito (${inCart.quantity})`
                : "Agregar al carrito"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
