"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { HiChevronDown, HiOutlineDocumentDownload } from "react-icons/hi";

interface OrderItem {
  sku: string;
  name: string;
  cant: number;
  precio: number;
  impo: number;
  unit: string;
  pesoHorma: string;
  listaPrecio: number;
}

interface Order {
  boleta: string;
  nroped: string;
  date: string;
  totalCant: number;
  total: number;
  notas: string;
  estado: string;
  items: OrderItem[];
}

function formatDate(fechora: string): string {
  if (!fechora || fechora.length < 8) return fechora;
  const d = fechora.slice(6, 8);
  const m = fechora.slice(4, 6);
  const y = fechora.slice(0, 4);
  const hh = fechora.slice(8, 10) || "00";
  const mm = fechora.slice(10, 12) || "00";
  return `${d}/${m}/${y} ${hh}:${mm}`;
}

export default function MisPedidosPage() {
  const { status } = useSession();
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saldo, setSaldo] = useState(0);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/mis-pedidos");
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/client/orders")
        .then((r) => r.json())
        .then((data) => { setOrders(data.orders || []); setSaldo(data.saldo || 0); })
        .catch(() => setOrders([]))
        .finally(() => setLoading(false));
    }
  }, [status]);

  function toggleExpand(boleta: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(boleta)) next.delete(boleta);
      else next.add(boleta);
      return next;
    });
  }

  async function downloadPDF(order: Order) {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 10;

    // Load logo
    try {
      const logoRes = await fetch("/logo-pdf.txt");
      const logoB64 = await logoRes.text();
      if (logoB64 && logoB64.length > 100) {
        doc.addImage(`data:image/png;base64,${logoB64}`, "PNG", 12, 8, 35, 25);
      }
    } catch { /* no logo */ }

    // Header - brand bar
    doc.setFillColor(251, 154, 71);
    doc.rect(50, 8, w - 60, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma", 54, 15);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Siempre con vos", 54, 19);

    // Boleta info box
    doc.setFillColor(55, 65, 81);
    doc.roundedRect(50, 22, w - 60, 14, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Boleta #${order.nroped}`, 54, 30);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(formatDate(order.date), w - 14, 30, { align: "right" });
    if (order.estado) {
      doc.setFontSize(8);
      doc.text(order.estado, w - 14, 25, { align: "right" });
    }
    doc.setFontSize(7);
    doc.setTextColor(200, 200, 200);
    doc.text("Documento no válido como factura", 54, 34);

    y = 42;

    // Thin brand line
    doc.setDrawColor(251, 154, 71);
    doc.setLineWidth(0.5);
    doc.line(10, y, w - 10, y);
    y += 4;

    // Order info
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(9);
    if (order.notas) {
      doc.text(`Observaciones: ${order.notas}`, 14, y);
      y += 6;
    }

    // Table header
    y += 2;
    doc.setFillColor(55, 65, 81);
    doc.rect(10, y, w - 20, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("SKU", 14, y + 5.5);
    doc.text("Producto", 30, y + 5.5);
    doc.text("Aprox", w - 90, y + 5.5, { align: "right" });
    doc.text("Cant", w - 78, y + 5.5, { align: "right" });
    doc.text("LP", w - 65, y + 5.5, { align: "center" });
    doc.text("Precio", w - 40, y + 5.5, { align: "right" });
    doc.text("Importe", w - 14, y + 5.5, { align: "right" });
    y += 10;

    // Table rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      if (y > 270) {
        doc.addPage();
        y = 15;
      }

      if (i % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(10, y - 3.5, w - 20, 7, "F");
      }

      doc.setDrawColor(220, 220, 220);
      doc.line(10, y + 3.5, w - 10, y + 3.5);

      doc.setTextColor(150, 150, 150);
      doc.text(item.sku, 14, y + 1);
      doc.setTextColor(50, 50, 50);
      const name = item.name.length > 42 ? item.name.substring(0, 40) + "..." : item.name;
      doc.text(name, 30, y + 1);

      const pesoH = parseFloat(item.pesoHorma || "0");
      const isKg = item.unit?.toUpperCase() === "KG";
      if (isKg && pesoH > 0) {
        doc.setTextColor(59, 130, 246);
        doc.text(`~${Math.round(item.cant / pesoH)}u`, w - 90, y + 1, { align: "right" });
      }

      doc.setTextColor(50, 50, 50);
      doc.text(String(item.cant), w - 78, y + 1, { align: "right" });
      doc.setTextColor(150, 150, 150);
      doc.text(item.listaPrecio ? String(item.listaPrecio) : "", w - 65, y + 1, { align: "center" });
      doc.setTextColor(50, 50, 50);
      doc.text(formatPrice(item.precio), w - 40, y + 1, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(formatPrice(item.impo), w - 14, y + 1, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 7;
    }

    // Total bar
    y += 3;
    doc.setFillColor(251, 154, 71);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL", 14, y + 7);
    doc.text(formatPrice(order.total), w - 14, y + 7, { align: "right" });

    // Estado de cuenta
    y += 14;
    const saldoAnterior = saldo - order.total;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(80, 80, 80);
    doc.text("Saldo anterior:", 14, y);
    doc.text(formatPrice(saldoAnterior), w - 14, y, { align: "right" });
    y += 6;
    doc.text("Actual:", 14, y);
    doc.text(formatPrice(order.total), w - 14, y, { align: "right" });
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setTextColor(saldo > 0 ? 220 : 34, saldo > 0 ? 38 : 197, saldo > 0 ? 38 : 94);
    doc.text("Nuevo estado de cuenta:", 14, y);
    doc.text(formatPrice(saldo), w - 14, y, { align: "right" });

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      // Brand line
      doc.setDrawColor(251, 154, 71);
      doc.setLineWidth(0.5);
      doc.line(10, pageH - 18, w - 10, pageH - 18);
      // Contact info
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text("Distrialma — Av. Calle Real 435, Merlo, Buenos Aires", 14, pageH - 14);
      doc.text("WhatsApp: +54 9 11 3949-1861 — distrialma.com.ar", 14, pageH - 10);
      if (pageCount > 1) {
        doc.text(`Página ${p}/${pageCount}`, w - 14, pageH - 10, { align: "right" });
      }
    }

    doc.save(`Boleta-${order.nroped}.pdf`);
  }

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Cargando pedidos...</p>
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Mis Pedidos</h1>

      {orders.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-500 mb-4">No tenés pedidos realizados.</p>
          <Link
            href="/productos"
            className="inline-block bg-brand-400 text-white px-6 py-2 rounded-lg text-sm font-medium hover:bg-brand-500"
          >
            Ver productos
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div key={order.boleta} className="bg-white rounded-lg border">
              <button
                onClick={() => toggleExpand(order.boleta)}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-gray-50"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      Pedido #{order.nroped}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      order.estado === "WEB"
                        ? "bg-brand-100 text-brand-700"
                        : order.estado === "Enviado"
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}>
                      {order.estado}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(order.date)} — {order.totalCant} producto{order.totalCant !== 1 ? "s" : ""}
                    {order.notas && <span className="ml-2 text-amber-600">Nota: {order.notas}</span>}
                  </p>
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
                <div className="border-t px-4 py-3">
                  <div className="flex justify-end mb-2">
                    <button
                      onClick={(e) => { e.stopPropagation(); downloadPDF(order); }}
                      className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium"
                    >
                      <HiOutlineDocumentDownload className="w-4 h-4" />
                      Descargar PDF
                    </button>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-gray-500 text-xs">
                        <th className="text-left pb-2">SKU</th>
                        <th className="text-left pb-2">Producto</th>
                        <th className="text-right pb-2">Aprox</th>
                        <th className="text-right pb-2">Cant</th>
                        <th className="text-center pb-2">LP</th>
                        <th className="text-right pb-2">Precio</th>
                        <th className="text-right pb-2">Importe</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {order.items.map((item, idx) => {
                        const pesoH = parseFloat(item.pesoHorma) || 0;
                        const isKg = item.unit?.toUpperCase() === "KG";
                        const aproxUnidades = isKg && pesoH > 0 ? Math.round(item.cant / pesoH) : null;
                        return (
                        <tr key={idx}>
                          <td className="py-1.5 text-gray-400 text-xs font-mono">{item.sku}</td>
                          <td className="py-1.5 text-gray-900">{item.name}</td>
                          <td className="text-right py-1.5 text-blue-600 text-xs">{aproxUnidades !== null ? `~${aproxUnidades}u` : ""}</td>
                          <td className="text-right py-1.5 text-gray-700">{item.cant}</td>
                          <td className="text-center py-1.5 text-gray-400 text-xs">{item.listaPrecio || ""}</td>
                          <td className="text-right py-1.5 text-gray-700">{formatPrice(item.precio)}</td>
                          <td className="text-right py-1.5 font-medium text-gray-900">{formatPrice(item.impo)}</td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Estado de cuenta */}
      {orders.length > 0 && (
        <div className="mt-6 rounded-lg border bg-gray-50 p-4">
          <p className="text-sm font-bold text-gray-700 mb-2">Estado de cuenta</p>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Saldo anterior</span>
              <span className="text-gray-700">{formatPrice(saldo - (orders[0]?.total || 0))}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Último pedido</span>
              <span className="text-gray-700">{formatPrice(orders[0]?.total || 0)}</span>
            </div>
            <div className={`flex justify-between text-sm font-bold pt-1 border-t ${saldo > 0 ? "text-red-600" : "text-green-600"}`}>
              <span>Nuevo estado de cuenta</span>
              <span>{formatPrice(saldo)}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
