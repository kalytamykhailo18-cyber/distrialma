"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePhone, HiOutlineLocationMarker } from "react-icons/hi";

interface OrderItem {
  sku: string;
  productName: string;
  cant: number;
  precio: number;
  impo: number;
  unit: string;
}

interface Order {
  boleta: string;
  nroped: string;
  fechora: string;
  clienteCod: string;
  clienteNombre: string;
  telefono: string;
  direccion: string;
  notas: string;
  total: number;
  totalCant: number;
  items: OrderItem[];
}

function formatDate(fechora: string): string {
  if (!fechora || fechora.length < 12) return fechora;
  return `${fechora.slice(6, 8)}/${fechora.slice(4, 6)} ${fechora.slice(8, 10)}:${fechora.slice(10, 12)}`;
}

export default function PickingPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/picking")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  function toggleOrder(boleta: string) {
    setExpandedOrder((prev) => (prev === boleta ? null : boleta));
  }

  function toggleCheck(key: string) {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function isOrderComplete(order: Order): boolean {
    return order.items.every((_, idx) => checkedItems.has(`${order.boleta}-${idx}`));
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 text-center">
        <p className="text-gray-500 text-lg">Cargando pedidos...</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Picking</h1>
          <p className="text-sm text-gray-500">{orders.length} pedidos pendientes</p>
        </div>
        <button
          onClick={() => {
            setLoading(true);
            fetch("/api/admin/picking")
              .then((r) => r.json())
              .then((data) => setOrders(data.orders || []))
              .catch(() => setOrders([]))
              .finally(() => setLoading(false));
          }}
          className="px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100"
        >
          Actualizar
        </button>
      </div>

      {orders.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border">
          <p className="text-gray-400 text-lg">No hay pedidos pendientes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => {
            const complete = isOrderComplete(order);
            return (
              <div key={order.boleta} className={`rounded-lg border-2 overflow-hidden ${complete ? "border-green-300 bg-green-50" : "border-gray-200 bg-white"}`}>
                {/* Order header — tap to expand */}
                <button
                  onClick={() => toggleOrder(order.boleta)}
                  className="w-full text-left px-4 py-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-base font-bold text-gray-900">
                        {order.clienteNombre}
                        {complete && <span className="ml-2 text-green-600 text-sm">✓ Listo</span>}
                      </p>
                      <p className="text-sm text-gray-500">
                        #{order.nroped} — {formatDate(order.fechora)} — {order.items.length} productos
                      </p>
                    </div>
                    <span className="text-base font-bold text-gray-900 shrink-0">{formatPrice(order.total)}</span>
                  </div>

                  {/* Quick info */}
                  <div className="flex flex-wrap gap-3 mt-1">
                    {order.direccion && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <HiOutlineLocationMarker className="w-3 h-3" />
                        {order.direccion}
                      </span>
                    )}
                    {order.telefono && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <HiOutlinePhone className="w-3 h-3" />
                        {order.telefono}
                      </span>
                    )}
                  </div>

                  {order.notas && (
                    <p className="text-sm text-amber-600 mt-1 font-medium">📝 {order.notas}</p>
                  )}
                </button>

                {/* Items — expanded */}
                {expandedOrder === order.boleta && (
                  <div className="border-t-2 px-3 py-2">
                    {order.items.map((item, idx) => {
                      const key = `${order.boleta}-${idx}`;
                      const checked = checkedItems.has(key);
                      return (
                        <button
                          key={idx}
                          onClick={() => toggleCheck(key)}
                          className={`w-full text-left flex items-center gap-3 py-2 px-2 rounded-lg transition-colors ${
                            checked ? "bg-green-50" : "hover:bg-gray-50"
                          }`}
                        >
                          {/* Checkbox */}
                          <div className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 ${
                            checked ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                          }`}>
                            {checked && <span className="text-sm font-bold">✓</span>}
                          </div>

                          {/* Product info */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-base font-medium ${checked ? "text-gray-400 line-through" : "text-gray-900"}`}>
                              {item.productName || `SKU ${item.sku}`}
                            </p>
                          </div>

                          {/* Quantity */}
                          <div className="shrink-0 text-right">
                            <p className={`text-lg font-bold ${checked ? "text-gray-400" : "text-brand-600"}`}>
                              {item.cant} {item.unit || "UN"}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
