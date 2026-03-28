"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { HiOutlineDocumentDownload } from "react-icons/hi";

interface MovCaja {
  tipo: string;
  concepto: string;
  monto: number;
  fechora: string;
}

interface CierreData {
  sucursal: string;
  desde: string;
  inicioCaja: number;
  ventas: {
    cantidad: number;
    efectivo: number;
    tarjeta: number;
    deuda: number;
    total: number;
    nroDesde: string;
    nroHasta: string;
  };
  movimientos: MovCaja[];
  retiros: number;
  ingresos: number;
  pagos: number;
  anuladas: { cantidad: number; total: number };
  totalEfectivoCaja: number;
  totalTarjeta: number;
  totalDeuda: number;
}

const fmt = (n: number) =>
  n.toLocaleString("es-AR", { style: "currency", currency: "ARS", minimumFractionDigits: 2 });

function formatFechora(f: string): string {
  if (!f || f.length < 12) return f;
  return `${f.slice(6, 8)}/${f.slice(4, 6)} ${f.slice(8, 10)}:${f.slice(10, 12)}`;
}

export default function CierreCajaPage() {
  const { data: session } = useSession();
  const [data, setData] = useState<CierreData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const user = session?.user as { role?: string } | undefined;
  const isAdmin = user?.role === "admin";

  async function loadCierre() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/cierre-caja?sucursal=1");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function downloadPDF() {
    if (!data) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    let y = 15;

    // Header
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — Cierre de Caja", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Sucursal ${data.sucursal} — Desde: ${data.desde}`, w - 14, 14, { align: "right" });
    doc.text(new Date().toLocaleString("es-AR"), w - 14, 20, { align: "right" });
    y = 30;

    // Summary cards
    const drawCard = (label: string, value: string, x: number, cardW: number, color: [number, number, number]) => {
      doc.setFillColor(...color);
      doc.roundedRect(x, y, cardW, 18, 2, 2, "F");
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(label, x + cardW / 2, y + 6, { align: "center" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(value, x + cardW / 2, y + 14, { align: "center" });
    };

    const cardW = (w - 30) / 4;
    drawCard("Ventas", String(data.ventas.cantidad), 10, cardW, [220, 252, 231]);
    drawCard("Efectivo", fmt(data.ventas.efectivo), 10 + cardW + 3, cardW, [219, 234, 254]);
    drawCard("Tarjeta", fmt(data.ventas.tarjeta), 10 + (cardW + 3) * 2, cardW, [254, 243, 199]);
    drawCard("Deuda", fmt(data.ventas.deuda), 10 + (cardW + 3) * 3, cardW, [254, 226, 226]);
    y += 24;

    // Total ventas bar
    doc.setFillColor(55, 65, 81);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL VENTAS", 14, y + 7);
    doc.text(fmt(data.ventas.total), w - 14, y + 7, { align: "right" });
    y += 18;

    // Page overflow handler
    const pageH = doc.internal.pageSize.getHeight();
    const checkPage = (needed = 10) => {
      if (y + needed > pageH - 15) {
        doc.addPage();
        y = 15;
      }
    };

    // Caja detail
    doc.setTextColor(50, 50, 50);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    const drawRow = (label: string, value: string, bold = false) => {
      checkPage(10);
      if (bold) doc.setFont("helvetica", "bold");
      doc.text(label, 14, y);
      doc.text(value, w - 14, y, { align: "right" });
      if (bold) doc.setFont("helvetica", "normal");
      doc.setDrawColor(230, 230, 230);
      doc.line(10, y + 2, w - 10, y + 2);
      y += 7;
    };

    drawRow("Inicio de caja:", fmt(data.inicioCaja));
    drawRow("Ventas en efectivo:", fmt(data.ventas.efectivo));
    drawRow("Retiros:", fmt(data.retiros));
    drawRow("Ingresos:", fmt(data.ingresos));
    drawRow("Pagos proveedores:", fmt(data.pagos));
    drawRow("TOTAL EFECTIVO EN CAJA:", fmt(data.totalEfectivoCaja), true);
    y += 3;
    drawRow("Total tarjeta/otros:", fmt(data.totalTarjeta));
    drawRow("Total deuda:", fmt(data.totalDeuda));
    y += 3;

    if (data.anuladas.cantidad > 0) {
      drawRow(`Anuladas (${data.anuladas.cantidad}):`, fmt(data.anuladas.total));
    }

    drawRow("Transacciones:", `${data.ventas.nroDesde} — ${data.ventas.nroHasta}`);
    y += 5;

    // Movimientos table
    if (data.movimientos.length > 0) {
      const drawMovHeader = () => {
        doc.setFillColor(55, 65, 81);
        doc.rect(10, y, w - 20, 8, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.text("Tipo", 14, y + 5.5);
        doc.text("Concepto", 50, y + 5.5);
        doc.text("Hora", 140, y + 5.5);
        doc.text("Monto", w - 14, y + 5.5, { align: "right" });
        y += 12;
        doc.setTextColor(50, 50, 50);
      };

      checkPage(20);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(50, 50, 50);
      doc.text("Movimientos de Caja", 14, y);
      y += 6;
      drawMovHeader();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      for (const m of data.movimientos) {
        if (y + 8 > pageH - 15) {
          doc.addPage();
          y = 15;
          drawMovHeader();
          doc.setFont("helvetica", "normal");
          doc.setFontSize(8);
        }
        doc.setTextColor(50, 50, 50);
        doc.text(m.tipo, 14, y);
        doc.text(m.concepto.substring(0, 40), 50, y);
        doc.text(formatFechora(m.fechora), 140, y);
        doc.setFont("helvetica", "bold");
        doc.text(fmt(m.monto), w - 14, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setDrawColor(235, 235, 235);
        doc.line(10, y + 2, w - 10, y + 2);
        y += 6;
      }
    }

    // Footer on all pages
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(7);
      doc.text(`Página ${p}/${pageCount} — distrialma.com.ar`, w / 2, pageH - 8, { align: "center" });
    }

    doc.save(`CierreCaja-Suc${data.sucursal}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Cierre de Caja</h1>
      <p className="text-sm text-gray-500 mb-6">Genera el cierre de caja y descarga el PDF.</p>

      <div className="flex gap-3">
        <button
          onClick={loadCierre}
          disabled={loading}
          className={`px-5 py-2.5 rounded-xl font-semibold disabled:opacity-50 transition-colors ${
            data ? "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200" : "bg-brand-600 text-white hover:bg-brand-700"
          }`}
        >
          {loading ? "Cargando..." : data ? "Actualizar" : "Cargar Cierre"}
        </button>
        {data && (
          <button
            onClick={downloadPDF}
            className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
          >
            <HiOutlineDocumentDownload className="w-5 h-5" />
            Descargar PDF
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
      )}

      {data && (
        <div className="mt-6">
          {/* Info */}
          <p className="text-sm text-gray-500 mb-4">Desde: {data.desde} — Sucursal {data.sucursal}</p>

          {/* Stats — only visible to admin */}
          {isAdmin && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                  <div className="text-2xl font-bold text-green-700">{data.ventas.cantidad}</div>
                  <div className="text-xs text-green-600">Ventas</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                  <div className="text-lg font-bold text-blue-700">{fmt(data.ventas.efectivo)}</div>
                  <div className="text-xs text-blue-600">Efectivo</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-center">
                  <div className="text-lg font-bold text-yellow-700">{fmt(data.ventas.tarjeta)}</div>
                  <div className="text-xs text-yellow-600">Tarjeta</div>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                  <div className="text-lg font-bold text-red-600">{fmt(data.ventas.deuda)}</div>
                  <div className="text-xs text-red-600">Deuda</div>
                </div>
              </div>

              {/* Detail */}
              <div className="bg-white border rounded-xl divide-y mb-4">
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Inicio de caja</span>
                  <span className="text-sm font-medium">{fmt(data.inicioCaja)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Ventas efectivo</span>
                  <span className="text-sm font-medium text-green-600">{fmt(data.ventas.efectivo)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Retiros</span>
                  <span className="text-sm font-medium text-red-500">-{fmt(data.retiros)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Ingresos</span>
                  <span className="text-sm font-medium text-green-600">+{fmt(data.ingresos)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Pagos proveedores</span>
                  <span className="text-sm font-medium text-red-500">-{fmt(data.pagos)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between bg-gray-50">
                  <span className="text-sm font-bold text-gray-900">TOTAL EFECTIVO EN CAJA</span>
                  <span className="text-sm font-bold text-gray-900">{fmt(data.totalEfectivoCaja)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Total tarjeta</span>
                  <span className="text-sm font-medium">{fmt(data.totalTarjeta)}</span>
                </div>
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Total deuda</span>
                  <span className="text-sm font-medium">{fmt(data.totalDeuda)}</span>
                </div>
                {data.anuladas.cantidad > 0 && (
                  <div className="px-4 py-3 flex justify-between">
                    <span className="text-sm text-gray-600">Anuladas ({data.anuladas.cantidad})</span>
                    <span className="text-sm font-medium text-red-500">{fmt(data.anuladas.total)}</span>
                  </div>
                )}
                <div className="px-4 py-3 flex justify-between">
                  <span className="text-sm text-gray-600">Transacciones</span>
                  <span className="text-sm font-mono text-gray-500">{data.ventas.nroDesde} — {data.ventas.nroHasta}</span>
                </div>
              </div>

              {/* Movimientos */}
              {data.movimientos.length > 0 && (
                <div className="bg-white border rounded-xl mb-4 overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b sticky top-0 z-10">
                    <p className="text-sm font-bold text-gray-700">Movimientos de Caja ({data.movimientos.length})</p>
                  </div>
                  <div className="divide-y max-h-80 overflow-y-auto">
                    {data.movimientos.map((m, i) => (
                      <div key={i} className="px-4 py-2 flex items-center justify-between">
                        <div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 ${
                            m.tipo === "Retiro" ? "bg-red-100 text-red-700" :
                            m.tipo === "Ingreso" ? "bg-green-100 text-green-700" :
                            "bg-blue-100 text-blue-700"
                          }`}>{m.tipo}</span>
                          <span className="text-sm text-gray-600">{m.concepto || "—"}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-bold">{fmt(m.monto)}</span>
                          <span className="text-xs text-gray-400 ml-2">{formatFechora(m.fechora)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* For non-admin (cajero): just show "Cierre generado" */}
          {!isAdmin && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-4 rounded-xl text-center font-semibold mb-4">
              Cierre de caja cargado — {data.ventas.cantidad} ventas
            </div>
          )}

        </div>
      )}
    </div>
  );
}
