"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { HiOutlineDocumentDownload, HiOutlineMail, HiOutlineCheck, HiOutlineCamera, HiOutlineRefresh } from "react-icons/hi";
import { CollapsiblePanel, Stagger } from "@/components/AnimateIn";

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
  const [resending, setResending] = useState<number | null>(null);
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
  const sucursalLocked = (() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      return !!params.get("suc");
    }
    return false;
  })();

  const [pageReady, setPageReady] = useState(false);
  const [dataReady, setDataReady] = useState(false);
  const [movOpen, setMovOpen] = useState(false);

  useEffect(() => { requestAnimationFrame(() => setPageReady(true)); }, []);

  // When data loads, trigger entrance
  useEffect(() => {
    if (data) {
      setDataReady(false);
      requestAnimationFrame(() => requestAnimationFrame(() => setDataReady(true)));
    } else {
      setDataReady(false);
    }
  }, [data]);

  const user = session?.user as { role?: string; name?: string } | undefined;
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (isAdmin) loadHistory();
  }, [isAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function resendEmail(cierreId: number) {
    setResending(cierreId);
    try {
      const res = await fetch("/api/admin/cierre-caja/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cierreId }),
      });
      if (res.ok) {
        setHistory((prev) => prev.map((c) => c.id === cierreId ? { ...c, emailSent: true } : c));
      }
    } catch { /* silent */ }
    setResending(null);
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
    drawCard("Cta. Cte.", fmt(data.ventas.deuda), 10 + (cw + 3) * 3, cw, [254, 226, 226]);
    y += 24;

    doc.setFillColor(55, 65, 81);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL VENTAS", 14, y + 7);
    doc.text(fmt(data.ventas.total), w - 14, y + 7, { align: "right" });
    y += 14;

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
    drawRowAt(rightX, colW, rightY, "Total Cta. Cte.:", fmt(data.totalDeuda)); rightY += 7;
    if (data.anuladas.cantidad > 0) {
      drawRowAt(rightX, colW, rightY, `Anuladas (${data.anuladas.cantidad}):`, fmt(data.anuladas.total)); rightY += 7;
    }
    drawRowAt(rightX, colW, rightY, "Transacciones:", `${data.ventas.nroDesde} — ${data.ventas.nroHasta}`); rightY += 7;

    y = Math.max(leftY, rightY) + 4;

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

    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(7);
      doc.text(`Página ${p}/${pc} — distrialma.com.ar`, w / 2, pageH - 8, { align: "center" });
    }

    return doc.output("datauristring").split(",")[1];
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

  const springBtn = "transition-all duration-200 ease-[cubic-bezier(0.25,1,0.5,1)] active:scale-[0.96]";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <Stagger show={pageReady} delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Cierre de Caja</h1>
      </Stagger>
      <Stagger show={pageReady} delay={50} y={-6}>
        <p className="text-sm text-gray-500 mb-6">Genera el cierre, registra el responsable y envía el PDF por email.</p>
      </Stagger>

      {/* Sucursal selector */}
      <Stagger show={pageReady} delay={100}>
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
              className="px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 transition-colors duration-200"
            >
              <option value="1">Minorista 435</option>
              <option value="2">Mayorista 387</option>
              <option value="6">Mayorista Pontevedra</option>
              <option value="7">Distribuidora 387</option>
              <option value="10">Reventas</option>
            </select>
          )}
        </div>
      </Stagger>

      {/* Action buttons */}
      <Stagger show={pageReady} delay={150}>
        <div className="flex flex-wrap gap-3 mb-4">
          <button
            onClick={loadCierre}
            disabled={loading}
            className={`px-5 py-2.5 rounded-xl font-semibold disabled:opacity-50 ${springBtn} ${
              data ? "bg-gray-100 text-gray-700 border border-gray-300 hover:bg-gray-200" : "bg-brand-600 text-white hover:bg-brand-700"
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {loading && <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              {loading ? "Cargando..." : data ? "Actualizar" : "Cargar Cierre"}
            </span>
          </button>
          {data && (
            <>
              {isAdmin && (
                <button
                  onClick={downloadPDF}
                  className={`flex items-center gap-2 px-5 py-2.5 bg-red-500 text-white rounded-xl font-semibold hover:bg-red-600 ${springBtn}`}
                >
                  <HiOutlineDocumentDownload className="w-5 h-5" />
                  PDF
                </button>
              )}
              <button
                onClick={cerrarCaja}
                disabled={closing || !nuevoInicio}
                className={`flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold hover:bg-green-700 disabled:opacity-50 ${springBtn}`}
              >
                {closing ? (
                  <span className="inline-flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Cerrando...
                  </span>
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
      </Stagger>

      {/* Error alert */}
      <div
        className="overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        style={{ maxHeight: error ? 80 : 0, opacity: error ? 1 : 0, marginBottom: error ? 16 : 0 }}
      >
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">{error}</div>
      </div>

      {/* Success alert */}
      <div
        className="overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)]"
        style={{ maxHeight: success ? 80 : 0, opacity: success ? 1 : 0, marginBottom: success ? 16 : 0 }}
      >
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-xl flex items-center gap-2">
          <HiOutlineCheck className="w-5 h-5 shrink-0" />
          {success}
        </div>
      </div>

      {/* Data section */}
      {data && (
        <div>
          <Stagger show={dataReady} delay={0} y={6}>
            <p className="text-sm text-gray-500 mb-4">Desde: {data.desde} — Sucursal {data.sucursal} — Caja {data.nroCaja}</p>
          </Stagger>

          {/* Admin view: full details */}
          {isAdmin && (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                {[
                  { label: "Ventas", value: String(data.ventas.cantidad), bg: "bg-green-50", border: "border-green-200", text: "text-green-700", sub: "text-green-600" },
                  { label: "Efectivo", value: fmt(data.ventas.efectivo), bg: "bg-blue-50", border: "border-blue-200", text: "text-blue-700", sub: "text-blue-600", small: true },
                  { label: "Tarjeta", value: fmt(data.ventas.tarjeta), bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-700", sub: "text-yellow-600", small: true },
                  { label: "Cta. Cte.", value: fmt(data.ventas.deuda), bg: "bg-red-50", border: "border-red-200", text: "text-red-600", sub: "text-red-600", small: true },
                ].map((card, i) => (
                  <div
                    key={card.label}
                    className={`${card.bg} border ${card.border} rounded-xl p-4 text-center transition-all duration-200 hover:shadow-md hover:-translate-y-0.5`}
                    style={{
                      opacity: dataReady ? 1 : 0,
                      transform: dataReady ? "translateY(0) scale(1)" : "translateY(16px) scale(0.95)",
                      transition: `opacity 400ms cubic-bezier(0.25,1,0.5,1) ${80 + i * 60}ms, transform 400ms cubic-bezier(0.25,1,0.5,1) ${80 + i * 60}ms, box-shadow 200ms ease, translate 200ms ease`,
                    }}
                  >
                    <div className={`${card.small ? "text-lg" : "text-2xl"} font-bold ${card.text}`}>{card.value}</div>
                    <div className={`text-xs ${card.sub}`}>{card.label}</div>
                  </div>
                ))}
              </div>

              {/* Detail rows */}
              <Stagger show={dataReady} delay={350}>
                <div className="bg-white border rounded-xl divide-y mb-4 overflow-hidden shadow-sm">
                  {[
                    { label: "Inicio de caja", value: fmt(data.inicioCaja) },
                    { label: "Ventas efectivo", value: fmt(data.ventas.efectivo), color: "text-green-600" },
                    { label: "Retiros", value: `-${fmt(data.retiros)}`, color: "text-red-500" },
                  ].map((row, i) => (
                    <div
                      key={row.label}
                      className="px-4 py-3 flex justify-between transition-colors duration-150 hover:bg-gray-50/60"
                      style={{
                        opacity: dataReady ? 1 : 0,
                        transform: dataReady ? "translateX(0)" : "translateX(-8px)",
                        transition: `opacity 300ms ease ${400 + i * 40}ms, transform 300ms ease ${400 + i * 40}ms`,
                      }}
                    >
                      <span className="text-sm text-gray-600">{row.label}</span>
                      <span className={`text-sm font-medium ${row.color || ""}`}>{row.value}</span>
                    </div>
                  ))}
                  {data.retirosDetalle && data.retirosDetalle.length > 1 && data.retirosDetalle.map((r) => (
                    <div key={r.concepto} className="px-4 py-2 flex justify-between bg-red-50/50 transition-colors duration-150 hover:bg-red-50">
                      <span className="text-xs text-gray-500 pl-4">{r.concepto || "Sin concepto"}</span>
                      <span className="text-xs font-medium text-red-400">-{fmt(r.total)}</span>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex justify-between transition-colors duration-150 hover:bg-gray-50/60">
                    <span className="text-sm text-gray-600">Ingresos</span>
                    <span className="text-sm font-medium text-green-600">+{fmt(data.ingresos)}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between transition-colors duration-150 hover:bg-gray-50/60">
                    <span className="text-sm text-gray-600">Pagos proveedores</span>
                    <span className="text-sm font-medium text-red-500">-{fmt(data.pagos)}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between bg-gray-50">
                    <span className="text-sm font-bold">TOTAL EFECTIVO EN CAJA</span>
                    <span className="text-sm font-bold">{fmt(data.totalEfectivoCaja)}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between transition-colors duration-150 hover:bg-gray-50/60">
                    <span className="text-sm text-gray-600">Total tarjeta</span>
                    <span className="text-sm font-medium">{fmt(data.totalTarjeta)}</span>
                  </div>
                  {data.tarjetasDetalle && data.tarjetasDetalle.length > 0 && data.tarjetasDetalle.map((t) => (
                    <div key={t.cod} className="px-4 py-2 flex justify-between bg-blue-50/50 transition-colors duration-150 hover:bg-blue-50">
                      <span className="text-xs text-gray-500 pl-4">{t.nombre} ({t.cantidad})</span>
                      <span className="text-xs font-medium text-gray-600">{fmt(t.total)}</span>
                    </div>
                  ))}
                  <div className="px-4 py-3 flex justify-between transition-colors duration-150 hover:bg-gray-50/60">
                    <span className="text-sm text-gray-600">Total Cta. Cte.</span>
                    <span className="text-sm font-medium">{fmt(data.totalDeuda)}</span>
                  </div>
                  <div className="px-4 py-3 flex justify-between bg-brand-50 border-t-2 border-brand-400">
                    <span className="text-sm font-bold text-brand-700">TOTAL GENERAL</span>
                    <span className="text-sm font-bold text-brand-700">{fmt(data.totalEfectivoCaja + data.totalTarjeta + data.totalDeuda)}</span>
                  </div>
                  {data.anuladas.cantidad > 0 && (
                    <>
                      <div className="px-4 py-3 flex justify-between">
                        <span className="text-sm text-gray-600">Anuladas ({data.anuladas.cantidad})</span>
                        <span className="text-sm font-medium text-red-500">{fmt(data.anuladas.total)}</span>
                      </div>
                      {data.anuladas.detalle && data.anuladas.detalle.map((a) => (
                        <div key={a.boleta} className="px-4 py-2 flex justify-between bg-red-50/50 transition-colors duration-150 hover:bg-red-50">
                          <span className="text-xs text-gray-500 pl-4">
                            #{a.boleta} {a.cliente || "Sin nombre"} — {a.usuario} / {a.empleado} — {formatFechora(a.fechora)}
                          </span>
                          <span className="text-xs font-medium text-red-400">{fmt(a.total)}</span>
                        </div>
                      ))}
                    </>
                  )}
                  <div className="px-4 py-3 flex justify-between transition-colors duration-150 hover:bg-gray-50/60">
                    <span className="text-sm text-gray-600">Transacciones</span>
                    <span className="text-sm font-mono text-gray-500">{data.ventas.nroDesde} — {data.ventas.nroHasta}</span>
                  </div>
                </div>
              </Stagger>

              {/* Efectivo contado */}
              <Stagger show={dataReady} delay={500}>
                <div className="bg-white border rounded-xl divide-y mb-4 overflow-hidden shadow-sm">
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
                        className="w-40 px-3 py-2 border border-brand-400 rounded-lg text-sm font-bold text-right focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-all duration-200"
                      />
                    </div>
                  </div>
                  {efectivoContado !== "" && (() => {
                    const contado = parseFloat(efectivoContado) || 0;
                    const esperado = data.totalEfectivoCaja;
                    const diferencia = contado - esperado;
                    const isPositive = diferencia >= 0;
                    return (
                      <div
                        className={`px-4 py-3 flex justify-between transition-all duration-300 ${isPositive ? "bg-green-50" : "bg-red-50"}`}
                      >
                        <span className={`text-sm font-bold transition-colors duration-300 ${isPositive ? "text-green-700" : "text-red-700"}`}>
                          {isPositive ? "SOBRANTE" : "FALTANTE"}
                        </span>
                        <span className={`text-sm font-bold transition-colors duration-300 ${isPositive ? "text-green-700" : "text-red-700"}`}>
                          {isPositive ? "+" : "-"}{fmt(Math.abs(diferencia))}
                        </span>
                      </div>
                    );
                  })()}
                </div>
              </Stagger>

              {/* Movimientos — collapsible */}
              {data.movimientos.length > 0 && (
                <Stagger show={dataReady} delay={580}>
                  <div className="bg-white border rounded-xl mb-4 overflow-hidden shadow-sm">
                    <button
                      onClick={() => setMovOpen(!movOpen)}
                      className="w-full px-4 py-2.5 bg-gray-50 border-b flex items-center justify-between hover:bg-gray-100 transition-colors duration-150"
                    >
                      <p className="text-sm font-bold text-gray-700">Movimientos de Caja ({data.movimientos.length})</p>
                      <svg
                        className="w-4 h-4 text-gray-500 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                        style={{ transform: movOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                        viewBox="0 0 20 20" fill="currentColor"
                      >
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <CollapsiblePanel open={movOpen}>
                      <div className="divide-y max-h-80 overflow-y-auto">
                        {data.movimientos.map((m, i) => (
                          <div
                            key={i}
                            className="px-4 py-2 flex items-center justify-between transition-colors duration-150 hover:bg-gray-50/60"
                            style={{
                              opacity: movOpen ? 1 : 0,
                              transform: movOpen ? "translateX(0)" : "translateX(-6px)",
                              transition: `opacity 250ms ease ${i * 20}ms, transform 250ms ease ${i * 20}ms`,
                            }}
                          >
                            <div>
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium mr-2 transition-colors duration-200 ${
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
                    </CollapsiblePanel>
                  </div>
                </Stagger>
              )}
            </>
          )}

          {/* Employee selector */}
          <Stagger show={dataReady} delay={650}>
            <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-2">Responsable del cierre</label>
              <select
                value={selectedEmpleado}
                onChange={(e) => setSelectedEmpleado(e.target.value)}
                className="w-full px-4 py-3 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-all duration-200"
              >
                <option value="">Seleccionar empleado...</option>
                {empleados.map((e) => (
                  <option key={e.cod} value={e.nombre}>{e.nombre}</option>
                ))}
              </select>
            </div>
          </Stagger>

          {/* Staff view */}
          {!isAdmin && (
            <Stagger show={dataReady} delay={300}>
              <div className="mb-4">
                <div className="bg-blue-50 border border-blue-200 text-blue-700 px-4 py-4 rounded-xl text-center font-semibold mb-4">
                  Cierre de caja — {data.ventas.cantidad} ventas realizadas
                </div>
                <div className="bg-white border rounded-xl p-4 shadow-sm">
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
                      className="flex-1 px-4 py-3 border border-brand-400 rounded-xl text-lg font-bold text-center focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-all duration-200"
                    />
                  </div>
                </div>
              </div>
            </Stagger>
          )}

          {/* Admin: nuevo inicio */}
          {isAdmin && (
            <Stagger show={dataReady} delay={720}>
              <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
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
                    className="w-48 px-4 py-2 border border-brand-400 rounded-xl text-lg font-bold text-center focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-all duration-200"
                  />
                </div>
              </div>
            </Stagger>
          )}

          {/* Photo capture */}
          <Stagger show={dataReady} delay={790}>
            <div className="bg-white border rounded-xl p-4 mb-4 shadow-sm">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Fotos de tickets de cierre posnet
              </label>
              {fotos.length > 0 && (
                <div className="flex flex-wrap gap-3 mb-3">
                  {fotos.map((foto, i) => (
                    <div
                      key={i}
                      className="relative group"
                      style={{
                        animation: "fadeScaleIn 300ms cubic-bezier(0.25,1,0.5,1) forwards",
                      }}
                    >
                      <img src={`data:image/jpeg;base64,${foto}`} alt={`Ticket ${i + 1}`} className="w-20 h-28 object-cover rounded-lg border transition-transform duration-200 group-hover:scale-105" />
                      <button
                        onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                        className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs flex items-center justify-center transition-all duration-200 hover:scale-110 hover:bg-red-600 active:scale-90"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className={`flex items-center justify-center gap-2 px-4 py-3 bg-gray-50 border-2 border-dashed border-gray-300 rounded-xl cursor-pointer hover:bg-gray-100 hover:border-brand-400 transition-all duration-200 ${springBtn}`}>
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
          </Stagger>
        </div>
      )}

      {/* History — admin only */}
      {isAdmin && history.length > 0 && (
        <Stagger show={pageReady} delay={250}>
          <div className="mt-8">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Historial de Cierres</h2>
            <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50/80 border-b text-left">
                      <th className="p-3">Fecha</th>
                      <th className="p-3">Responsable</th>
                      <th className="p-3 text-right">Ventas</th>
                      <th className="p-3 text-right">Total</th>
                      <th className="p-3 text-right">Inicio sig.</th>
                      <th className="p-3 text-center">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c, i) => (
                      <tr
                        key={c.id}
                        className="border-b transition-colors duration-150 hover:bg-gray-50/60"
                        style={{
                          opacity: pageReady ? 1 : 0,
                          transform: pageReady ? "translateY(0)" : "translateY(6px)",
                          transition: `opacity 350ms cubic-bezier(0.25,1,0.5,1) ${300 + i * 30}ms, transform 350ms cubic-bezier(0.25,1,0.5,1) ${300 + i * 30}ms, background-color 150ms ease`,
                        }}
                      >
                        <td className="p-3 text-gray-500 text-xs">{new Date(c.createdAt).toLocaleString("es-AR")}</td>
                        <td className="p-3 font-medium">{c.usuario}</td>
                        <td className="p-3 text-right">{c.cantVentas}</td>
                        <td className="p-3 text-right font-bold">${Number(c.totalVentas).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</td>
                        <td className="p-3 text-right">${Number(c.nuevoInicio || 0).toLocaleString("es-AR", { minimumFractionDigits: 0 })}</td>
                        <td className="p-3 text-center">
                          {c.emailSent ? (
                            <span className="text-green-600 text-xs font-medium">Enviado</span>
                          ) : (
                            <button
                              onClick={() => resendEmail(c.id)}
                              disabled={resending === c.id}
                              className="flex items-center gap-1 text-xs text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50 mx-auto"
                            >
                              <HiOutlineRefresh className={`w-3.5 h-3.5 ${resending === c.id ? "animate-spin" : ""}`} />
                              {resending === c.id ? "Enviando..." : "Reenviar"}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Stagger>
      )}

      <style jsx>{`
        @keyframes fadeScaleIn {
          from { opacity: 0; transform: scale(0.85); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
