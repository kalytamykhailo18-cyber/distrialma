"use client";

import { useEffect, useState, useRef } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePhone, HiOutlineLocationMarker } from "react-icons/hi";

interface OrderItem {
  sku: string;
  productName: string;
  cant: number;
  precio: number;
  impo: number;
  unit: string;
  stock: number;
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
  const [dismissed, setDismissed] = useState<Map<string, { item: OrderItem; orderBoleta: string; orderNroped: string }>>(new Map());
  const [showDismissed, setShowDismissed] = useState(false);
  const [filterNegStock, setFilterNegStock] = useState(false);

  // Swipe state
  const touchStart = useRef<{ x: number; y: number; key: string } | null>(null);

  function loadOrders() {
    setLoading(true);
    fetch("/api/admin/picking")
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadOrders(); }, []);

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

  function dismissItem(order: Order, idx: number) {
    const key = `${order.boleta}-${idx}`;
    const item = order.items[idx];
    setDismissed((prev) => {
      const next = new Map(prev);
      next.set(key, { item, orderBoleta: order.boleta, orderNroped: order.nroped });
      return next;
    });
  }

  function restoreItem(key: string) {
    setDismissed((prev) => {
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }

  function isOrderComplete(order: Order): boolean {
    return order.items.every((_, idx) => {
      const key = `${order.boleta}-${idx}`;
      return checkedItems.has(key) || dismissed.has(key);
    });
  }

  function handleTouchStart(e: React.TouchEvent, key: string) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, key };
  }

  function handleTouchEnd(e: React.TouchEvent, order: Order, idx: number) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = Math.abs(e.changedTouches[0].clientY - touchStart.current.y);
    // Require horizontal swipe > 80px, not too much vertical movement
    if (Math.abs(dx) > 80 && dy < 50) {
      dismissItem(order, idx);
    }
    touchStart.current = null;
  }

  // Items with negative stock across all orders
  const negativeStockItems: Array<{ item: OrderItem; orderNroped: string }> = [];
  if (filterNegStock) {
    for (const order of orders) {
      for (const item of order.items) {
        if (item.stock < 0) {
          negativeStockItems.push({ item, orderNroped: order.nroped });
        }
      }
    }
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
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Picking</h1>
          <p className="text-sm text-gray-500">{orders.length} pedidos pendientes</p>
        </div>
        <button
          onClick={loadOrders}
          className="px-4 py-2 text-sm font-medium text-brand-600 bg-brand-50 border border-brand-200 rounded-lg hover:bg-brand-100"
        >
          Actualizar
        </button>
      </div>

      {/* Filter: negative stock */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => setFilterNegStock((p) => !p)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
            filterNegStock
              ? "bg-red-50 border-red-300 text-red-700"
              : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
          }`}
        >
          Stock negativo {filterNegStock && negativeStockItems.length > 0 ? `(${negativeStockItems.length})` : ""}
        </button>
        {dismissed.size > 0 && (
          <button
            onClick={() => setShowDismissed((p) => !p)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
              showDismissed
                ? "bg-amber-50 border-amber-300 text-amber-700"
                : "bg-white border-gray-200 text-gray-500 hover:border-gray-300"
            }`}
          >
            Descartados ({dismissed.size})
          </button>
        )}
      </div>

      {/* Negative stock filter results */}
      {filterNegStock && negativeStockItems.length > 0 && (
        <div className="mb-6 bg-red-50 border-2 border-red-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-red-100 border-b border-red-200">
            <p className="text-sm font-bold text-red-700">Productos con stock negativo</p>
          </div>
          <div className="px-3 py-2 divide-y divide-red-100">
            {negativeStockItems.map((entry, i) => (
              <div key={i} className="py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{entry.item.productName}</p>
                  <p className="text-xs text-gray-500">SKU: {entry.item.sku} — Pedido #{entry.orderNroped}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-red-600">{entry.item.stock}</p>
                  <p className="text-xs text-gray-400">stock</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dismissed items section */}
      {showDismissed && dismissed.size > 0 && (
        <div className="mb-6 bg-amber-50 border-2 border-amber-200 rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-amber-100 border-b border-amber-200">
            <p className="text-sm font-bold text-amber-700">Descartados — revisar</p>
          </div>
          <div className="px-3 py-2 divide-y divide-amber-100">
            {Array.from(dismissed.entries()).map(([key, { item, orderNroped }]) => (
              <div key={key} className="py-2 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">{item.productName}</p>
                  <p className="text-xs text-gray-500">
                    SKU: {item.sku} — {item.cant} {item.unit || "UN"} — Pedido #{orderNroped}
                    {item.stock < 0 && <span className="ml-1 text-red-500 font-medium">(Stock: {item.stock})</span>}
                  </p>
                </div>
                <button
                  onClick={() => restoreItem(key)}
                  className="text-xs text-brand-600 font-medium px-2 py-1 rounded hover:bg-brand-50"
                >
                  Restaurar
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
                {/* Order header */}
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

                {/* Items */}
                {expandedOrder === order.boleta && (
                  <div className="border-t-2 px-3 py-2">
                    {order.items.map((item, idx) => {
                      const key = `${order.boleta}-${idx}`;
                      const checked = checkedItems.has(key);
                      const isDismissed = dismissed.has(key);

                      if (isDismissed) return null;

                      return (
                        <div
                          key={idx}
                          onTouchStart={(e) => handleTouchStart(e, key)}
                          onTouchEnd={(e) => handleTouchEnd(e, order, idx)}
                          className="flex items-center"
                        >
                          <button
                            onClick={() => toggleCheck(key)}
                            className={`flex-1 text-left flex items-center gap-3 py-2 px-2 rounded-lg transition-colors ${
                              checked ? "bg-green-50" : "hover:bg-gray-50"
                            }`}
                          >
                            <div className={`w-6 h-6 rounded border-2 flex items-center justify-center shrink-0 ${
                              checked ? "bg-green-500 border-green-500 text-white" : "border-gray-300"
                            }`}>
                              {checked && <span className="text-sm font-bold">✓</span>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className={`text-base font-medium ${checked ? "text-gray-400 line-through" : "text-gray-900"}`}>
                                {item.productName || `SKU ${item.sku}`}
                              </p>
                              <p className="text-xs text-gray-400">
                                SKU: {item.sku}
                                {item.stock < 0 && (
                                  <span className="ml-2 text-red-500 font-semibold">Stock: {item.stock}</span>
                                )}
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className={`text-lg font-bold ${checked ? "text-gray-400" : "text-brand-600"}`}>
                                {item.cant} {item.unit || "UN"}
                              </p>
                            </div>
                          </button>
                          {/* X button to dismiss as faltante */}
                          {!checked && (
                            <button
                              onClick={(e) => { e.stopPropagation(); dismissItem(order, idx); }}
                              className="shrink-0 ml-1 w-8 h-8 flex items-center justify-center rounded-full text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                              title="Marcar como faltante"
                            >
                              <span className="text-lg font-bold">×</span>
                            </button>
                          )}
                        </div>
                      );
                    })}

                    {/* Faltantes WhatsApp button */}
                    {(() => {
                      const orderDismissed = order.items
                        .map((item, idx) => ({ item, key: `${order.boleta}-${idx}` }))
                        .filter(({ key }) => dismissed.has(key));
                      if (orderDismissed.length === 0) return null;

                      // Try phone from field, then extract from client name
                      let phone = order.telefono?.replace(/[^0-9]/g, "") || "";
                      if (!phone) {
                        // Extract phone from name like "MARTIN PUENTE (+54 9 11 2400-6246)" or "(11 2184-4004)"
                        const nameMatch = order.clienteNombre.match(/\(?\+?54?\s*9?\s*(11[\s-]?\d{4}[\s-]?\d{4})\)?/);
                        if (nameMatch) phone = nameMatch[1].replace(/[\s-]/g, "");
                      }
                      if (!phone) return null;

                      const phoneNum = phone.startsWith("54") ? phone : phone.startsWith("9") ? `54${phone}` : `549${phone}`;
                      const faltantes = orderDismissed
                        .map(({ item }) => `- ${item.productName} (${item.cant} ${item.unit || "UN"})`)
                        .join("\n");
                      const msg = `Hola ${order.clienteNombre.split(" ")[0]}, te informamos que los siguientes productos de tu pedido #${order.nroped} no están disponibles en este momento:\n\n${faltantes}\n\nDisculpá las molestias. Cualquier consulta no dudes en escribirnos.\n\nDistrialma`;
                      const waUrl = `https://wa.me/${phoneNum}?text=${encodeURIComponent(msg)}`;

                      return (
                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-2 mt-3 mb-1 mx-2 py-2.5 bg-green-500 text-white rounded-lg font-medium text-sm hover:bg-green-600 transition-colors"
                        >
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          Notificar faltantes al cliente ({orderDismissed.length})
                        </a>
                      );
                    })()}
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
