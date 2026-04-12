"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiChevronDown } from "react-icons/hi";

interface OrderItem {
  sku: string;
  name: string;
  cant: number;
  precio: number;
  impo: number;
  listaPrecio: number;
}

interface FacturaItem {
  sku: string;
  name: string;
  cant: number;
  precio: number;
  impo: number;
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
  facturado: { total: number; items: FacturaItem[] } | null;
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
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Pedidos</h1>

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
                    <div key={order.boleta} className={`rounded-lg border ${expanded.has(order.boleta) ? "bg-white border-brand-400 shadow-md" : "bg-white"}`}>
                      <button
                        onClick={() => toggleExpand(order.boleta)}
                        className="w-full px-3 sm:px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-1 sm:gap-3">
                            <span className="text-sm font-medium text-gray-900">
                              #{order.nroped}
                            </span>
                            <span className="text-sm text-gray-700 truncate">
                              {order.clienteNombre}
                            </span>
                            {order.telefono && (
                              <span className="text-xs text-gray-400 hidden sm:inline">
                                {order.telefono}
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-0.5">
                            {formatDate(order.date)}
                            {order.facturado ? (
                              <span className="ml-2 px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">Facturado</span>
                            ) : (
                              <span className="ml-2 px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs font-medium">Pendiente</span>
                            )}
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
                          <HiChevronDown
                            className={`w-4 h-4 text-gray-400 transition-transform ${
                              expanded.has(order.boleta) ? "rotate-180" : ""
                            }`}
                          />
                        </div>
                      </button>

                      {expanded.has(order.boleta) && (
                        <div className="border-t bg-gray-50 px-2 sm:px-4 py-3">
                          {order.facturado && (
                            <div className="flex flex-wrap gap-1 mb-3">
                              <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full font-medium">Precarga: {formatPrice(order.total)}</span>
                              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">Facturado: {formatPrice(order.facturado.total)}</span>
                              {order.facturado.total !== order.total && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${order.facturado.total > order.total ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600"}`}>
                                  Dif: {formatPrice(order.facturado.total - order.total)}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Simple table for orders without factura */}
                          {!order.facturado && (
                            <div className="overflow-x-auto -mx-2 sm:-mx-4">
                            <table className="min-w-[420px] w-full text-sm">
                              <thead>
                                <tr className="text-white text-xs bg-brand-600">
                                  <th className="text-left pb-2 pt-2 pl-2">Producto</th>
                                  <th className="text-right pb-2 pt-2 px-2">Cant</th>
                                  <th className="text-right pb-2 pt-2 px-2">Precio</th>
                                  <th className="text-right pb-2 pt-2 px-2">Lista</th>
                                  <th className="text-right pb-2 pt-2 px-2 pr-2">Importe</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {order.items.map((item, idx) => (
                                  <tr key={idx}>
                                    <td className="py-1.5 pl-2">
                                      <span className="text-gray-900 text-xs sm:text-sm">{item.name}</span>
                                      <span className="text-gray-400 text-xs ml-1">({item.sku})</span>
                                    </td>
                                    <td className="text-right py-1.5 px-2 text-gray-700">{item.cant}</td>
                                    <td className="text-right py-1.5 px-2 text-gray-700">{formatPrice(item.precio)}</td>
                                    <td className="text-right py-1.5 px-2 text-gray-400 text-xs">{LISTA_LABELS[item.listaPrecio] || `L${item.listaPrecio}`}</td>
                                    <td className="text-right py-1.5 px-2 pr-2 font-medium text-gray-900">{formatPrice(item.impo)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            </div>
                          )}

                          {/* Facturado-only: no precarga, just show what was invoiced */}
                          {order.facturado && order.items.length === 0 && (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-white text-xs bg-green-600">
                                  <th className="text-left pb-2 pt-2 pl-2">Producto</th>
                                  <th className="text-right pb-2 pt-2 px-2">Cant</th>
                                  <th className="text-right pb-2 pt-2 px-2">Precio</th>
                                  <th className="text-right pb-2 pt-2 px-2 pr-2">Importe</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {order.facturado.items.map((f, idx) => (
                                  <tr key={idx}>
                                    <td className="py-1.5 pl-2 text-xs sm:text-sm text-gray-900">{f.name} <span className="text-gray-400 text-xs">({f.sku})</span></td>
                                    <td className="text-right py-1.5 px-2 text-gray-700">{f.cant}</td>
                                    <td className="text-right py-1.5 px-2 text-gray-700">{formatPrice(f.precio)}</td>
                                    <td className="text-right py-1.5 px-2 pr-2 font-medium text-gray-900">{formatPrice(f.impo)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}

                          {/* Card-based comparison for facturado orders with precarga */}
                          {order.facturado && order.items.length > 0 && (() => {
                            const allSkus = new Set([
                              ...order.items.map((i) => i.sku),
                              ...order.facturado.items.map((f) => f.sku),
                            ]);
                            return (
                              <div className="space-y-2">
                                {Array.from(allSkus).map((sku) => {
                                  const precarga = order.items.find((i) => i.sku === sku);
                                  const factura = order.facturado!.items.find((f) => f.sku === sku);
                                  const isAdded = !precarga && factura;
                                  const isRemoved = precarga && !factura;
                                  const cantChanged = precarga && factura && precarga.cant !== factura.cant;
                                  const precioChanged = precarga && factura && precarga.precio !== factura.precio;
                                  const isPesaje = cantChanged && !precioChanged;

                                  return (
                                    <div key={sku} className={`rounded-lg border px-3 py-2 ${
                                      isAdded ? "bg-green-50 border-green-300" :
                                      isRemoved ? "bg-red-50 border-red-300" :
                                      isPesaje ? "bg-blue-50 border-blue-300" :
                                      precioChanged ? "bg-amber-50 border-amber-300" :
                                      "bg-white border-gray-200"
                                    }`}>
                                      <div className="flex items-center justify-between">
                                        <span className="text-xs sm:text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
                                          {precarga?.name || factura?.name}
                                        </span>
                                        {isAdded && <span className="text-xs px-1.5 py-0.5 bg-green-200 text-green-800 rounded font-medium ml-1 shrink-0">AGREGADO</span>}
                                        {isRemoved && <span className="text-xs px-1.5 py-0.5 bg-red-200 text-red-800 rounded font-medium ml-1 shrink-0">NO ENTREGADO</span>}
                                        {isPesaje && <span className="text-xs px-1.5 py-0.5 bg-blue-200 text-blue-800 rounded font-medium ml-1 shrink-0">PESAJE</span>}
                                        {precioChanged && <span className="text-xs px-1.5 py-0.5 bg-amber-200 text-amber-800 rounded font-medium ml-1 shrink-0">MODIFICADO</span>}
                                      </div>
                                      <div className="flex gap-4 mt-1 text-xs">
                                        {precarga && (
                                          <div className="text-gray-500">
                                            Pedido: {precarga.cant} x {formatPrice(precarga.precio)} = {formatPrice(precarga.impo)}
                                          </div>
                                        )}
                                        {factura && (
                                          <div className={isAdded ? "text-green-700 font-medium" : isPesaje ? "text-blue-700 font-medium" : precioChanged ? "text-amber-700 font-medium" : "text-green-700"}>
                                            Factura: {factura.cant} x {formatPrice(factura.precio)} = {formatPrice(factura.impo)}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })()}
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
