"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface ComboItemDetail {
  sku: string;
  quantity: number;
  name: string;
  unitPrice: number;
  unit: string;
  images: string[];
}

interface ComboData {
  id: number;
  name: string;
  description: string | null;
  price: number;
  items: ComboItemDetail[];
  comboImages: string[];
  originalPrice: number;
}

export default function ComboGrid() {
  const [combos, setCombos] = useState<ComboData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/combos")
      .then((r) => r.json())
      .then((data) => setCombos(data.combos || []))
      .catch(() => setCombos([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-lg border p-4 animate-pulse">
            <div className="h-40 bg-gray-200 rounded mb-3" />
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
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
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {combos.map((combo) => {
        const hasComboImages = combo.comboImages.length > 0;
        const displayImages = hasComboImages ? combo.comboImages : combo.items.flatMap((i) => i.images);
        const discount = combo.originalPrice > 0 && combo.price < combo.originalPrice
          ? Math.round((1 - combo.price / combo.originalPrice) * 100)
          : 0;

        return (
          <Link
            key={combo.id}
            href={`/combos/${combo.id}`}
            className="bg-white rounded-lg border hover:shadow-md transition-shadow p-4 flex flex-col"
          >
            {/* Images — scrollable */}
            <div className="w-full h-40 bg-gray-100 rounded mb-3 flex items-center overflow-x-auto gap-2 px-2">
              {displayImages.length > 0 ? (
                hasComboImages ? (
                  combo.comboImages.map((url, i) => (
                    <img
                      key={i}
                      src={url}
                      alt={combo.name}
                      className="h-32 w-auto object-contain shrink-0"
                    />
                  ))
                ) : (
                  combo.items.map((item) =>
                    item.images[0] ? (
                      <img
                        key={item.sku}
                        src={item.images[0]}
                        alt={item.name}
                        className="h-32 w-auto object-contain shrink-0"
                      />
                    ) : null
                  )
                )
              ) : (
                <span className="text-gray-400 text-sm mx-auto">Sin imagen</span>
              )}
            </div>

            {/* Badge */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                COMBO
              </span>
              {discount > 0 && (
                <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">
                  -{discount}%
                </span>
              )}
            </div>

            {/* Name */}
            <h3 className="text-sm font-medium text-gray-900 mb-1">
              {combo.name}
            </h3>

            {/* Items list */}
            <p className="text-xs text-gray-500 mb-2">
              {combo.items.map((item, i) => (
                <span key={item.sku}>
                  {i > 0 && " + "}
                  {item.quantity > 1 ? `${item.quantity}x ` : ""}
                  {item.name}
                </span>
              ))}
            </p>

            {/* Price */}
            <div className="mt-auto">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Combo</span>
                <div className="flex items-center gap-2">
                  {discount > 0 && (
                    <span className="text-xs text-gray-400 line-through">
                      {formatPrice(combo.originalPrice)}
                    </span>
                  )}
                  <span className="font-semibold text-green-700">
                    {formatPrice(combo.price)}
                  </span>
                </div>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
