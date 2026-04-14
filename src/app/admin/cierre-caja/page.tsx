"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { HiOutlineDocumentDownload, HiOutlineMail, HiOutlineCheck, HiOutlineCamera } from "react-icons/hi";

interface MovCaja {
  tipo: string;
  concepto: string;
  monto: number;
  fechora: string;
}

interface CierreData {
  sucursal: string;
  desde: string;
  nroCaja: number;
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
  retirosDetalle: Array<{ concepto: string; total: number }>;
  ingresos: number;
  pagos: number;
  anuladas: { cantidad: number; total: number; detalle?: Array<{ boleta: string; cliente: string; total: number; fechora: string; usuario: string; empleado: string }> };
  totalEfectivoCaja: number;
  totalTarjeta: number;
  totalDeuda: number;
  tarjetasDetalle: Array<{ cod: string; nombre: string; total: number; cantidad: number }>;
}

interface CierreRecord {
  id: number;
  usuario: string;
  desde: string;
  cantVentas: number;
  totalVentas: string;
  efectivo: string;
  tarjeta: string;
  nuevoInicio: string;
  emailSent: boolean;
  createdAt: string;
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
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [history, setHistory] = useState<CierreRecord[]>([]);
  const [nuevoInicio, setNuevoInicio] = useState("");
  const [efectivoContado, setEfectivoContado] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [empleados, setEmpleados] = useState<Array<{ cod: string; nombre: string }>>([]);
  const [selectedEmpleado, setSelectedEmpleado] = useState("");
  const [sucursal, setSucursal] = useState(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return params.get("suc") || "1";
    }
    return "1";
  });
  // If the URL has ?suc=N, lock the sucursal selector to that value
  const sucursalLocked = (() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return !!params.get("suc");
    }
    return false;
  })();

  const user = session?.user as { role?: string; name?: string } | undefined;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (isAdmin) loadHistory();
  }, [isAdmin]);

  // Reload employees when sucursal changes
  useEffect(() => {
    setSelectedEmpleado("");
    fetch(`/api/admin/cierre-caja/empleados?sucursal=${sucursal}`)
      .then((r) => r.json())
      .then((d) => setEmpleados(d.empleados || []))
      .catch(() => {});
  }, [sucursal]);

  async function loadHistory() {
    try {
      const res = await fetch("/api/admin/cierre-caja/history");
      const d = await res.json();
      if (res.ok) setHistory(d.cierres || []);
    } catch { /* silent */ }
  }

  async function loadCierre() {
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/admin/cierre-caja?sucursal=${sucursal}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  async function generatePDFBase64(): Promise<string> {
    if (!data) return "";
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 15;

    const checkPage = (needed = 10) => {
      if (y + needed > pageH - 15) { doc.addPage(); y = 15; }
    };

    // Header
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — Cierre de Caja", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Sucursal ${data.sucursal} — Caja ${data.nroCaja} — Desde: ${data.desde}`, w - 14, 14, { align: "right" });
    doc.text(`Responsable: ${selectedEmpleado || user?.name || "—"} — ${new Date().toLocaleString("es-AR")}`, w - 14, 20, { align: "right" });
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
    const cw = (w - 30) / 4;
    drawCard("Ventas", String(data.ventas.cantidad), 10, cw, [220, 252, 231]);
    drawCard("Efectivo", fmt(data.ventas.efectivo), 10 + cw + 3, cw, [219, 234, 254]);
    drawCard("Tarjeta", fmt(data.ventas.tarjeta), 10 + (cw + 3) * 2, cw, [254, 243, 199]);
    drawCard("Deuda", fmt(data.ventas.deuda), 10 + (cw + 3) * 3, cw, [254, 226, 226]);
    y += 24;

    // Total bar
    doc.setFillColor(55, 65, 81);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL VENTAS", 14, y + 7);
    doc.text(fmt(data.ventas.total), w - 14, y + 7, { align: "right" });
    y += 14;

    // TWO-COLUMN LAYOUT: Left = cash detail, Right = card detail
    const colW = (w - 30) / 2;
    const leftX = 10;
    const rightX = 10 + colW + 10;
    let leftY = y;
    let rightY = y;

    doc.setFontSize(9);
    doc.setTextColor(50, 50, 50);

    const drawRowAt = (x: number, rw: number, yPos: number, label: string, value: string, bold = false) => {
      if (bold) doc.setFont("helvetica", "bold");
      else doc.setFont("helvetica", "normal");
      doc.text(label, x + 4, yPos);
      doc.text(value, x + rw - 4, yPos, { align: "right" });
      doc.setDrawColor(230, 230, 230);
      doc.line(x, yPos + 2, x + rw, yPos + 2);
    };

    // LEFT COLUMN: Cash
    drawRowAt(leftX, colW, leftY, "Inicio de caja:", fmt(data.inicioCaja)); leftY += 7;
    drawRowAt(leftX, colW, leftY, "Ventas en efectivo:", fmt(data.ventas.efectivo)); leftY += 7;
    drawRowAt(leftX, colW, leftY, "Retiros:", fmt(data.retiros)); leftY += 7;
    if (data.retirosDetalle && data.retirosDetalle.length > 1) {
      doc.setFontSize(8);
      for (const r of data.retirosDetalle) {
        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "normal");
        doc.text(`  ${r.concepto || "Sin concepto"}`, leftX + 4, leftY);
        doc.text(fmt(r.total), leftX + colW - 4, leftY, { align: "right" });
        leftY += 5;
      }
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
    }
    drawRowAt(leftX, colW, leftY, "Ingresos:", fmt(data.ingresos)); leftY += 7;
    drawRowAt(leftX, colW, leftY, "Pagos proveedores:", fmt(data.pagos)); leftY += 7;
    doc.setFont("helvetica", "bold");
    drawRowAt(leftX, colW, leftY, "TOTAL EFECTIVO EN CAJA:", fmt(data.totalEfectivoCaja), true); leftY += 7;

    // RIGHT COLUMN: Cards + deuda
    drawRowAt(rightX, colW, rightY, "Total tarjeta/otros:", fmt(data.totalTarjeta)); rightY += 7;
    if (data.tarjetasDetalle && data.tarjetasDetalle.length > 0) {
      doc.setFontSize(8);
      for (const t of data.tarjetasDetalle) {
        doc.setTextColor(120, 120, 120);
        doc.setFont("helvetica", "normal");
        doc.text(`  ${t.nombre} (${t.cantidad})`, rightX + 4, rightY);
        doc.text(fmt(t.total), rightX + colW - 4, rightY, { align: "right" });
        rightY += 5;
      }
      doc.setFontSize(9);
      doc.setTextColor(50, 50, 50);
    }
    drawRowAt(rightX, colW, rightY, "Total deuda:", fmt(data.totalDeuda)); rightY += 7;
    if (data.anuladas.cantidad > 0) {
      drawRowAt(rightX, colW, rightY, `Anuladas (${data.anuladas.cantidad}):`, fmt(data.anuladas.total)); rightY += 7;
    }
    drawRowAt(rightX, colW, rightY, "Transacciones:", `${data.ventas.nroDesde} — ${data.ventas.nroHasta}`); rightY += 7;

    y = Math.max(leftY, rightY) + 4;

    // TOTAL GENERAL bar
    checkPage(15);
    doc.setFillColor(251, 154, 71);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL GENERAL", 14, y + 7);
    doc.text(fmt(data.totalEfectivoCaja + data.totalTarjeta + data.totalDeuda), w - 14, y + 7, { align: "right" });
    y += 14;

    doc.setTextColor(50, 50, 50);
    doc.setFontSize(9);

    if (nuevoInicio) {
      const inicioSig = parseFloat(nuevoInicio) || 0;
      const diferencia = inicioSig - data.totalEfectivoCaja;
      checkPage(12);
      const diffLabel = diferencia >= 0 ? "SOBRANTE" : "FALTANTE";
      doc.setFillColor(diferencia >= 0 ? 220 : 254, diferencia >= 0 ? 252 : 226, diferencia >= 0 ? 231 : 226);
      doc.rect(10, y - 2, w - 20, 10, "F");
      doc.setTextColor(diferencia >= 0 ? 22 : 185, diferencia >= 0 ? 101 : 28, diferencia >= 0 ? 52 : 28);
      doc.setFont("helvetica", "bold");
      doc.text(diffLabel, 14, y + 5);
      doc.text(`${diferencia >= 0 ? "+" : "-"}${fmt(Math.abs(diferencia))}`, w - 14, y + 5, { align: "right" });
      y += 12;
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
    }
    y += 3;
    if (nuevoInicio) {
      checkPage(15);
      doc.setFillColor(251, 154, 71);
      doc.rect(10, y, w - 20, 10, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text("INICIO DE CAJA SIGUIENTE", 14, y + 7);
      doc.text(fmt(parseFloat(nuevoInicio)), w - 14, y + 7, { align: "right" });
      y += 15;
    }
    doc.setTextColor(50, 50, 50);

    // Movimientos
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
        if (y + 8 > pageH - 15) { doc.addPage(); y = 15; drawMovHeader(); doc.setFont("helvetica", "normal"); doc.setFontSize(8); }
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

    // Footer
    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(7);
      doc.text(`Página ${p}/${pc} — distrialma.com.ar`, w / 2, pageH - 8, { align: "center" });
    }

    return doc.output("datauristring").split(",")[1]; // base64
  }

  async function downloadPDF() {
    if (!data) return;
    const base64 = await generatePDFBase64();
    const blob = new Blob([Buffer.from(base64, "base64")], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `CierreCaja-Suc${data.sucursal}-${new Date().toISOString().slice(0, 10)}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function cerrarCaja() {
    if (!data) return;
    setClosing(true);
    setError("");
    setSuccess("");
    try {
      const pdfBase64 = await generatePDFBase64();
      const res = await fetch("/api/admin/cierre-caja", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sucursal: data.sucursal,
          pdfBase64,
          nuevoInicio: nuevoInicio ? parseFloat(nuevoInicio) : 0,
          fotos: fotos.length > 0 ? fotos : undefined,
          empleado: selectedEmpleado || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);

      let msg = `Cierre registrado por ${d.usuario}`;
      if (d.emailSent) msg += ` — PDF enviado a ${d.emailTo}`;
      else if (d.emailTo) msg += ` — Error al enviar email`;
      else msg += ` — Email no configurado`;
      setSuccess(msg);
      if (isAdmin) loadHistory();

    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setClosing(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Cierre de Caja</h1>
      <p className="text-sm text-gray-500 mb-6">Genera el cierre, registra el responsable y envía el PDF por email.</p>

      {/* Sucursal selector */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm text-gray-600">Sucursal:</span>
        {sucursalLocked ? (
          <span className="px-3 py-2 border border-brand-400 bg-brand-50 rounded-lg text-sm font-semibold text-brand-700">
            Sucursal {sucursal}
          </span>
        ) : (
          <select
            value={sucursal}
            onChange={(e) => { setSucursal(e.target.value); setData(null); }}
            className="px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600"
          >
            <option value="1">Minorista 435</option>
            <option value="2">Mayorista 387</option>
            <option value="6">Mayorista Pontevedra</option>
            <option value="7">Distribuidora 387</option>
            <option value="10">Reventas</option>
          </select>
        )}
      </div>

      <div className="flex flex-wrap gap-3 mb-4">
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
          <>
            {isAdmin && (
            <button
              onClick={downloadPDF}
              className="flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 transition-colors"
            >
              <HiOutlineDocumentDownload className="w-5 h-5" />
              PDF
            </button>
            )}
            <button
              onClick={cerrarCaja}
              disabled={closing || !nuevoInicio}
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {closing ? (
                "Cerrando..."
              ) : (
                <>
                  <HiOutlineMail className="w-5 h-5" />
                  Cerrar Caja y Enviar
                </>
              )}
            </button>
          </>
        )}
      </div>

      {error && <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>}
      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <HiOutlineCheck className="w-5 h-5 shrink-0" />
          {success}
        </div>
      )}

      {data && (
        <div>
          <p className="text-sm text-gray-500 mb-4">Desde: {data.desde} — Sucursal {data.sucursal} — Caja {data.nroCaja}</p>

          {/* Admin view: full details */}
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

              <div className="bg-white border rounded-xl divide-y mb-4">
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Inicio de caja</span><span className="text-sm font-medium">{fmt(data.inicioCaja)}</span></div>
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Ventas efectivo</span><span className="text-sm font-medium text-green-600">{fmt(data.ventas.efectivo)}</span></div>
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Retiros</span><span className="text-sm font-medium text-red-500">-{fmt(data.retiros)}</span></div>
                {data.retirosDetalle && data.retirosDetalle.length > 1 && data.retirosDetalle.map((r) => (
                  <div key={r.concepto} className="px-4 py-2 flex justify-between bg-red-50/50">
                    <span className="text-xs text-gray-500 pl-4">{r.concepto || "Sin concepto"}</span>
                    <span className="text-xs font-medium text-red-400">-{fmt(r.total)}</span>
                  </div>
                ))}
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Ingresos</span><span className="text-sm font-medium text-green-600">+{fmt(data.ingresos)}</span></div>
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Pagos proveedores</span><span className="text-sm font-medium text-red-500">-{fmt(data.pagos)}</span></div>
                <div className="px-4 py-3 flex justify-between bg-gray-50"><span className="text-sm font-bold">TOTAL EFECTIVO EN CAJA</span><span className="text-sm font-bold">{fmt(data.totalEfectivoCaja)}</span></div>
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Total tarjeta</span><span className="text-sm font-medium">{fmt(data.totalTarjeta)}</span></div>
                {data.tarjetasDetalle && data.tarjetasDetalle.length > 0 && data.tarjetasDetalle.map((t) => (
                  <div key={t.cod} className="px-4 py-2 flex justify-between bg-blue-50/50">
                    <span className="text-xs text-gray-500 pl-4">{t.nombre} ({t.cantidad})</span>
                    <span className="text-xs font-medium text-gray-600">{fmt(t.total)}</span>
                  </div>
                ))}
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Total deuda</span><span className="text-sm font-medium">{fmt(data.totalDeuda)}</span></div>
                <div className="px-4 py-3 flex justify-between bg-brand-50 border-t-2 border-brand-400">
                  <span className="text-sm font-bold text-brand-700">TOTAL GENERAL</span>
                  <span className="text-sm font-bold text-brand-700">{fmt(data.totalEfectivoCaja + data.totalTarjeta + data.totalDeuda)}</span>
                </div>
                {data.anuladas.cantidad > 0 && (
                  <>
                  <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Anuladas ({data.anuladas.cantidad})</span><span className="text-sm font-medium text-red-500">{fmt(data.anuladas.total)}</span></div>
                  {data.anuladas.detalle && data.anuladas.detalle.map((a) => (
                    <div key={a.boleta} className="px-4 py-2 flex justify-between bg-red-50/50">
                      <span className="text-xs text-gray-500 pl-4">
                        #{a.boleta} {a.cliente || "Sin nombre"} — {a.usuario} / {a.empleado} — {formatFechora(a.fechora)}
                      </span>
                      <span className="text-xs font-medium text-red-400">{fmt(a.total)}</span>
                    </div>
                  ))}
                  </>
                )}
                <div className="px-4 py-3 flex justify-between"><span className="text-sm text-gray-600">Transacciones</span><span className="text-sm font-mono text-gray-500">{data.ventas.nroDesde} — {data.ventas.nroHasta}</span></div>
              </div>

              {/* Efectivo contado y diferencia */}
              <div className="bg-white border rounded-xl divide-y mb-4">
                <div className="px-4 py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-700">Efectivo contado</span>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={efectivoContado}
                      onChange={(e) => setEfectivoContado(e.target.value)}
                      placeholder="0.00"
                      className="w-40 px-3 py-2 border border-brand-400 rounded-lg text-sm font-bold text-right focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                  </div>
                </div>
                {efectivoContado !== "" && (() => {
                  const contado = parseFloat(efectivoContado) || 0;
                  const esperado = data.totalEfectivoCaja;
                  const diferencia = contado - esperado;
                  const isPositive = diferencia >= 0;
                  return (
                    <div className={`px-4 py-3 flex justify-between ${isPositive ? "bg-green-50" : "bg-red-50"}`}>
                      <span className={`text-sm font-bold ${isPositive ? "text-green-700" : "text-red-700"}`}>
                        {isPositive ? "SOBRANTE" : "FALTANTE"}
                      </span>
                      <span className={`text-sm font-bold ${isPositive ? "text-green-700" : "text-red-700"}`}>
                        {isPositive ? "+" : "-"}{fmt(Math.abs(diferencia))}
                      </span>
                    </div>
                  );
                })()}
              </div>

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

          {/* Employee selector — both admin and staff */}
          <div className="bg-white border rounded-xl p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Responsable del cierre</label>
            <select
              value={selectedEmpleado}
              onChange={(e) => setSelectedEmpleado(e.target.value)}
              className="w-full px-4 py-3 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            >
              <option value="">Seleccionar empleado...</option>
              {empleados.map((e) => (
                <option key={e.cod} value={e.nombre}>{e.nombre}</option>
              ))}
            </select>
          </div>

          {/* Staff view: no financial details, but must enter nuevo inicio */}
          {!isAdmin && (
            <div className="mb-4">
              <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-4 rounded-xl text-center font-semibold mb-4">
                Cierre de caja — {data.ventas.cantidad} ventas realizadas
              </div>
              <div className="bg-white border rounded-xl p-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Próximo inicio de caja
                </label>
                <p className="text-xs text-gray-400 mb-3">Ingresá el monto en efectivo que queda en la caja para el próximo turno.</p>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 font-medium">$</span>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={nuevoInicio}
                    onChange={(e) => setNuevoInicio(e.target.value)}
                    placeholder="0"
                    className="flex-1 px-4 py-3 border border-brand-400 rounded-xl text-lg font-bold text-center focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Admin: also show nuevo inicio input */}
          {isAdmin && (
            <div className="bg-white border rounded-xl p-4 mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Próximo inicio de caja
              </label>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium">$</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={nuevoInicio}
                  onChange={(e) => setNuevoInicio(e.target.value)}
                  placeholder="0"
                  className="w-48 px-4 py-2 border border-brand-400 rounded-xl text-lg font-bold text-center focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                />
              </div>
            </div>
          )}

          {/* Photo capture: ticket posnet (multiple) */}
          <div className="bg-white border rounded-xl p-4 mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Fotos de tickets de cierre posnet
            </label>
            {fotos.length > 0 && (
              <div className="flex flex-wrap gap-3 mb-3">
                {fotos.map((foto, i) => (
                  <div key={i} className="relative">
                    <img src={`data:image/jpeg;base64,${foto}`} alt={`Ticket ${i + 1}`} className="w-20 h-28 object-cover rounded border" />
                    <button
                      onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <label className="flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 transition-colors">
              <HiOutlineCamera className="w-6 h-6 text-gray-400" />
              <span className="text-sm text-gray-500">{fotos.length > 0 ? "Agregar otra foto" : "Tomar foto o seleccionar imagen"}</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => {
                      const base64 = (reader.result as string).split(",")[1];
                      setFotos((prev) => [...prev, base64]);
                    };
                    reader.readAsDataURL(file);
                  }
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        </div>
      )}

      {/* Cierre history — admin only */}
      {isAdmin && history.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Historial de Cierres</h2>
          <div className="bg-white border rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left">
                    <th className="p-3">Fecha</th>
                    <th className="p-3">Responsable</th>
                    <th className="p-3 text-right">Ventas</th>
                    <th className="p-3 text-right">Total</th>
                    <th className="p-3 text-right">Inicio sig.</th>
                    <th className="p-3 text-center">Email</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((c) => (
                    <tr key={c.id} className="border-b hover:bg-gray-50">
                      <td className="p-3 text-gray-500 text-xs">{new Date(c.createdAt).toLocaleString("es-AR")}</td>
                      <td className="p-3 font-medium">{c.usuario}</td>
                      <td className="p-3 text-right">{c.cantVentas}</td>
                      <td className="p-3 text-right font-bold">${Number(c.totalVentas).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                      <td className="p-3 text-right">${Number(c.nuevoInicio || 0).toLocaleString("es-AR", { minimumFractionDigits: 0 })}</td>
                      <td className="p-3 text-center">
                        {c.emailSent ? (
                          <span className="text-green-600 text-xs font-medium">Enviado</span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
