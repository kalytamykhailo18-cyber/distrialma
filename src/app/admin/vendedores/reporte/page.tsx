"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HiOutlineArrowLeft, HiOutlineDocumentDownload } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface Order {
  id: number;
  vendedorCod: string;
  vendedorName: string;
  clienteCod: string;
  clienteName: string;
  total: number;
  comisionTotal: number;
  estado: string;
  createdAt: string;
  itemCount: number;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function fifteenDaysAgo() {
  const d = new Date();
  d.setDate(d.getDate() - 15);
  return d.toISOString().slice(0, 10);
}

export default function ReporteVendedoresPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [desde, setDesde] = useState(fifteenDaysAgo());
  const [hasta, setHasta] = useState(todayISO());

  const loadOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("desde", `${desde}T00:00:00.000Z`);
    params.set("hasta", `${hasta}T23:59:59.999Z`);
    fetch(`/api/vendedor/orders?${params}`)
      .then((r) => r.json())
      .then((data) => setOrders(data.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [desde, hasta]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Group by vendedor
  const grouped = orders.reduce((acc, o) => {
    const key = o.vendedorCod;
    if (!acc[key]) acc[key] = { vendedorName: o.vendedorName, orders: [], totalVentas: 0, totalComision: 0 };
    acc[key].orders.push(o);
    acc[key].totalVentas += o.total;
    acc[key].totalComision += o.comisionTotal;
    return acc;
  }, {} as Record<string, { vendedorName: string; orders: Order[]; totalVentas: number; totalComision: number }>);

  const totalGeneral = Object.values(grouped).reduce((sum, g) => sum + g.totalComision, 0);

  async function exportPDF() {
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();

    let firstPage = true;
    for (const [vendedorCod, data] of Object.entries(grouped)) {
      if (!firstPage) doc.addPage();
      firstPage = false;
      let y = 15;

      // Header
      doc.setFillColor(251, 154, 71);
      doc.rect(0, 0, w, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Distrialma — Liquidación de Comisiones", 14, 10);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`Período: ${desde} a ${hasta}`, 14, 17);

      y = 30;

      doc.setTextColor(30, 30, 30);
      doc.setFontSize(13);
      doc.setFont("helvetica", "bold");
      doc.text(`Vendedor: ${data.vendedorName}`, 14, y);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120, 120, 120);
      doc.text(`Código: ${vendedorCod}`, 14, y + 5);
      y += 14;

      // Orders table header
      doc.setFillColor(55, 65, 81);
      doc.rect(10, y, w - 20, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("#", 12, y + 5);
      doc.text("Fecha", 22, y + 5);
      doc.text("Cliente", 50, y + 5);
      doc.text("Items", 130, y + 5, { align: "right" });
      doc.text("Total", 160, y + 5, { align: "right" });
      doc.text("Comisión", w - 14, y + 5, { align: "right" });
      y += 9;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);

      for (const o of data.orders) {
        if (y > 270) { doc.addPage(); y = 15; }
        const fecha = new Date(o.createdAt).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
        doc.text(String(o.id), 12, y);
        doc.text(fecha, 22, y);
        const cliente = o.clienteName.length > 35 ? o.clienteName.substring(0, 33) + "..." : o.clienteName;
        doc.text(cliente, 50, y);
        doc.text(String(o.itemCount), 130, y, { align: "right" });
        doc.text(formatPrice(o.total), 160, y, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.text(formatPrice(o.comisionTotal), w - 14, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += 6;
      }

      // Summary
      y += 4;
      doc.setDrawColor(200, 200, 200);
      doc.line(10, y, w - 10, y);
      y += 8;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("Total de ventas:", 14, y);
      doc.text(formatPrice(data.totalVentas), w - 14, y, { align: "right" });
      y += 7;
      doc.setTextColor(21, 128, 61);
      doc.text("Total a pagar (comisión):", 14, y);
      doc.text(formatPrice(data.totalComision), w - 14, y, { align: "right" });
    }

    // Page numbers
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.text(`Página ${p}/${pageCount}`, w / 2, 290, { align: "center" });
    }

    doc.save(`Comisiones-Vendedores-${desde}-${hasta}.pdf`);
  }

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/vendedores" className="p-2 hover:bg-gray-100 rounded-lg">
            <HiOutlineArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Reporte de Comisiones</h1>
        </div>
      </Stagger>

      {/* Filters */}
      <Stagger delay={50} y={10}>
      <div className="bg-white border rounded-xl shadow-sm p-4 mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Desde</label>
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="border border-brand-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Hasta</label>
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="border border-brand-400 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
        </div>
        <button onClick={() => { setDesde(fifteenDaysAgo()); setHasta(todayISO()); }} className={`px-3 py-2 text-xs text-gray-600 border rounded-lg hover:bg-gray-50 ${springBtn}`}>
          Ultima quincena
        </button>
        {orders.length > 0 && (
          <button onClick={exportPDF} className={`ml-auto flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 ${springBtn}`}>
            <HiOutlineDocumentDownload className="w-4 h-4" />
            PDF
          </button>
        )}
      </div>
      </Stagger>

      {/* Total general */}
      <Stagger delay={100} y={10}>
      <div className="bg-green-50 border border-green-200 rounded-xl shadow-sm p-4 mb-4">
        <p className="text-xs text-green-700 font-medium">TOTAL A PAGAR (TODOS LOS VENDEDORES)</p>
        <p className="text-3xl font-bold text-green-700 mt-1">{formatPrice(totalGeneral)}</p>
      </div>
      </Stagger>

      {loading ? (
        <LoadingCenter />
      ) : Object.keys(grouped).length === 0 ? (
        <p className="text-gray-400 text-center py-8">No hay pedidos en este periodo.</p>
      ) : (
        <Stagger delay={150} y={10}>
        <div className="space-y-4">
          {Object.entries(grouped).map(([cod, data], gi) => (
            <div key={cod} className="bg-white border rounded-xl shadow-sm overflow-hidden" style={staggerStyle(true, gi)}>
              <div className="bg-gray-50 px-4 py-3 border-b flex items-center justify-between">
                <div>
                  <p className="font-bold text-gray-800">{data.vendedorName}</p>
                  <p className="text-xs text-gray-400">Cod: {cod} — {data.orders.length} pedido(s)</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Comisión a pagar</p>
                  <p className="text-xl font-bold text-green-600">{formatPrice(data.totalComision)}</p>
                </div>
              </div>
              <div className="divide-y">
                {data.orders.map((o, oi) => (
                  <div key={o.id} className={`px-4 py-2 flex items-center justify-between text-sm ${hoverRow}`} style={staggerStyle(true, oi)}>
                    <div>
                      <span className="font-medium">#{o.id}</span>
                      <span className="text-gray-400 ml-2">{new Date(o.createdAt).toLocaleDateString("es-AR")}</span>
                      <span className="ml-2">{o.clienteName}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-gray-700">{formatPrice(o.total)}</span>
                      <span className="text-green-600 font-medium ml-3">{formatPrice(o.comisionTotal)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </Stagger>
      )}
    </PageTransition>
  );
}
