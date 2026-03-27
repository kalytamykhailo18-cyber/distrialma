"use client";

import Link from "next/link";
import { useCart } from "@/components/CartProvider";
import { formatPrice } from "@/lib/utils";
import { HiOutlineShoppingCart, HiX } from "react-icons/hi";

export default function CarritoPage() {
  const { items, removeItem, updateQuantity, clearCart, totalPrice } = useCart();

  if (items.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <HiOutlineShoppingCart className="w-16 h-16 mx-auto text-gray-300 mb-4" />
        <p className="text-gray-500 mb-4">Tu carrito está vacío</p>
        <Link
          href="/productos"
          className="inline-block bg-brand-400 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-500"
        >
          Ver productos
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Carrito</h1>
        <button
          onClick={clearCart}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Vaciar carrito
        </button>
      </div>

      <div className="space-y-3 mb-6">
        {items.map((item) => {
          const isKg = item.unit === "KG";
          const unitLabel = isKg ? "KG" : "un.";
          const minQty = item.mode === "unit" && item.pesoMayorista > 0 ? item.pesoMayorista : 1;
          const step = 1;
          // Auto-switch to caja cerrada price when: qty >= cantidadPorCaja OR same SKU has a box in cart
          const hasBoxInCart = items.some((other) => other.sku === item.sku && other.mode === "box" && other.precioCajaCerrada > 0);
          const unitAutoBox = item.mode === "unit" && item.precioCajaCerrada > 0 && (hasBoxInCart || (item.cantidadPorCaja > 0 && item.quantity >= item.cantidadPorCaja));
          const unitPrice = item.mode === "box" && item.precioCajaCerrada > 0
            ? item.precioCajaCerrada
            : unitAutoBox
            ? item.precioCajaCerrada
            : item.precioMayorista;
          const lineTotal = item.mode === "box" && item.precioCajaCerrada > 0
            ? item.precioCajaCerrada * item.cantidadPorCaja * item.quantity
            : unitAutoBox
            ? item.precioCajaCerrada * item.quantity
            : item.precioMayorista * item.quantity;

          return (
            <div key={item.sku} className="bg-white rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <Link href={`/productos/${item.sku}`} className="text-sm font-medium text-gray-900 hover:text-brand-600">
                    {item.name}
                  </Link>
                  <p className="text-xs text-gray-400 mt-0.5">SKU: {item.sku}</p>
                </div>
                <button
                  onClick={() => removeItem(item.sku, item.mode)}
                  className="text-gray-400 hover:text-red-500 shrink-0"
                >
                  <HiX className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-4 mt-3">
                {/* Mode label */}
                {item.isCombo ? (
                  <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full font-medium">
                    Combo
                  </span>
                ) : (
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                    item.mode === "box"
                      ? "bg-brand-100 text-brand-700"
                      : unitAutoBox
                      ? "bg-brand-100 text-brand-700"
                      : "bg-green-100 text-green-700"
                  }`}>
                    {item.mode === "box"
                      ? `Caja x${item.cantidadPorCaja} ${unitLabel}`
                      : unitAutoBox
                      ? `Precio caja cerrada`
                      : (isKg ? "Por KG" : "Por unidad")}
                  </span>
                )}

                {/* Quantity */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => updateQuantity(item.sku, item.mode, item.quantity - step)}
                    disabled={item.quantity <= minQty}
                    className="w-7 h-7 flex items-center justify-center rounded border text-gray-600 hover:bg-gray-100 disabled:opacity-30"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    value={item.quantity}
                    onChange={(e) => updateQuantity(item.sku, item.mode, parseInt(e.target.value) || minQty)}
                    className="w-12 text-center text-sm border rounded py-1"
                    min={minQty}
                    step={step}
                  />
                  <button
                    onClick={() => updateQuantity(item.sku, item.mode, item.quantity + step)}
                    className="w-7 h-7 flex items-center justify-center rounded border text-gray-600 hover:bg-gray-100"
                  >
                    +
                  </button>
                </div>

                {/* Price */}
                <div className="ml-auto text-right shrink-0">
                  <p className="text-sm font-semibold text-gray-900">{formatPrice(lineTotal)}</p>
                  <p className="text-xs text-gray-400">
                    {formatPrice(unitPrice)}/{item.mode === "box" ? "caja" : unitLabel}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Total + checkout */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex justify-between items-center mb-4">
          <span className="text-lg font-medium text-gray-900">Total</span>
          <span className="text-2xl font-bold text-gray-900">{formatPrice(totalPrice)}</span>
        </div>
        <Link
          href="/checkout"
          className="block w-full py-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors text-center"
        >
          Finalizar pedido
        </Link>
        <Link
          href="/productos"
          className="block w-full py-3 mt-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors text-center"
        >
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}
