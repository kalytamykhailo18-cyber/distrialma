"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface OrderItem {
  sku: string;
  name: string;
  cant: number;
  precio: number;
  impo: number;
  listaPrecio: number;
}

interface Order {
  boleta: string;
  nroped: string;
  date: string;
  totalCant: number;
  total: number;
  clienteCod: string;
  clienteNombre: string;
  notas: string;
  telefono: string;
  deliveryDay: string;
  items: OrderItem[];
}

const LISTA_LABELS: Record<number, string> = {
  1: "Minorista",
  2: "Mayorista",
  3: "Especial",
  4: "Caja Cerrada",
};

function formatDate(fechora: string): string {
  if (!fechora || fechora.length < 8) return fechora;
  const y = fechora.slice(0, 4);
  const m = fechora.slice(4, 6);
  const d = fechora.slice(6, 8);
  const hh = fechora.slice(8, 10) || "00";
  const mm = fechora.slice(10, 12) || "00";
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch("/api/admin/orders")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  function toggleExpand(boleta: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(boleta)) next.delete(boleta);
      else next.add(boleta);
      return next;
    });
  }

  // Group by delivery day
  const grouped = new Map<string, Order[]>();
  for (const order of orders) {
    const day = order.deliveryDay;
    if (!grouped.has(day)) grouped.set(day, []);
    grouped.get(day)!.push(order);
  }

  // Sort: named days first, "Sin asignar" last
  const dayOrder = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];
  const sortedDays = Array.from(grouped.keys()).sort((a, b) => {
    const ai = dayOrder.indexOf(a.toUpperCase());
    const bi = dayOrder.indexOf(b.toUpperCase());
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Pedidos</h1>
        <Link
          href="/admin"
          className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-200"
        >
          Volver
        </Link>
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando pedidos...</p>
      ) : orders.length === 0 ? (
        <p className="text-gray-400">No hay pedidos.</p>
      ) : (
        <div className="space-y-8">
          {sortedDays.map((day) => {
            const dayOrders = grouped.get(day)!;
            const dayTotal = dayOrders.reduce((sum, o) => sum + o.total, 0);
            return (
              <div key={day}>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-lg font-semibold text-gray-800">
                    {day}
                    <span className="text-sm font-normal text-gray-400 ml-2">
                      ({dayOrders.length} pedido{dayOrders.length !== 1 ? "s" : ""})
                    </span>
                  </h2>
                  <span className="text-sm font-medium text-gray-600">
                    Total: {formatPrice(dayTotal)}
                  </span>
                </div>

                <div className="space-y-2">
                  {dayOrders.map((order) => (
                    <div key={order.boleta} className="bg-white rounded-lg border">
                      <button
                        onClick={() => toggleExpand(order.boleta)}
                        className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium text-gray-900">
                              #{order.nroped}
                            </span>
                            <span className="text-sm text-gray-700">
                              {order.clienteNombre}
                            </span>
                            {order.telefono && (
                              <span className="text-xs text-gray-400">
                                {order.telefono}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {formatDate(order.date)}
                            {order.notas && (
                              <span className="ml-2 text-amber-600">
                                Nota: {order.notas}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-sm font-semibold text-gray-900">
                            {formatPrice(order.total)}
                          </span>
                          <svg
                            className={`w-4 h-4 text-gray-400 transition-transform ${
                              expanded.has(order.boleta) ? "rotate-180" : ""
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {expanded.has(order.boleta) && (
                        <div className="border-t px-4 py-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-gray-500 text-xs">
                                <th className="text-left pb-2">Producto</th>
                                <th className="text-right pb-2">Cant</th>
                                <th className="text-right pb-2">Precio</th>
                                <th className="text-right pb-2">Lista</th>
                                <th className="text-right pb-2">Importe</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y">
                              {order.items.map((item, idx) => (
                                <tr key={idx}>
                                  <td className="py-1.5">
                                    <span className="text-gray-900">{item.name}</span>
                                    <span className="text-gray-400 text-xs ml-1">({item.sku})</span>
                                  </td>
                                  <td className="text-right py-1.5 text-gray-700">{item.cant}</td>
                                  <td className="text-right py-1.5 text-gray-700">{formatPrice(item.precio)}</td>
                                  <td className="text-right py-1.5 text-gray-400 text-xs">
                                    {LISTA_LABELS[item.listaPrecio] || `L${item.listaPrecio}`}
                                  </td>
                                  <td className="text-right py-1.5 font-medium text-gray-900">{formatPrice(item.impo)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
