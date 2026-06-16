"use client";

import { useState, useEffect } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineDocumentDownload } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, useDataReady } from "@/components/AnimateIn";

interface SalesProduct {
  sku: string;
  name: string;
  totalCant: number;
  totalImpo: number;
  unit?: string;
}

interface DayReport {
  date: string;
  products: SalesProduct[];
  dayTotal: number;
}

interface ArchivedOrder {
  id: number;
  boleta: string;
  nroped: string;
  fechora: string;
  clienteCod: string;
  clienteName: string;
  totalCant: number;
  total: number;
  archivedAt: string;
  items: { sku: string; productName: string; cant: number; precio: number; impo: number }[];
}

export default function InformesPage() {
  const [days, setDays] = useState("7");
  const [report, setReport] = useState<DayReport[]>([]);
  const [periodSummary, setPeriodSummary] = useState<SalesProduct[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [orders, setOrders] = useState<ArchivedOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [archiveResult, setArchiveResult] = useState("");
  const [testBoleta, setTestBoleta] = useState("");
  const [stockChanges, setStockChanges] = useState<Array<{ sku: string; productName: string; cant: number; stkBefore: number | null; stkAfter: number | null; delta: number | null }>>([]);
  const [tab, setTab] = useState<"summary" | "daily" | "archive">("summary");

  const dataReady = useDataReady(tab === "summary" ? periodSummary.length : tab === "daily" ? report.length : orders.length);

  async function archiveLocal1(opts?: { boleta?: string }) {
    const boleta = opts?.boleta?.trim();
    setArchiving(true);
    setArchiveResult("");
    setStockChanges([]);
    try {
      const body: { clienteCod: string; clienteName: string; boleta?: string } = {
        clienteCod: "9411",
        clienteName: "LOCAL1",
      };
      if (boleta) body.boleta = boleta;
      const res = await fetch("/api/admin/archive-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      setArchiveResult(data.message || data.error || "Error");
      if (Array.isArray(data.stockChanges)) setStockChanges(data.stockChanges);
      loadOrders();
    } catch {
      setArchiveResult("Error al archivar");
    } finally {
      setArchiving(false);
    }
  }

  async function loadOrders() {
    const res = await fetch(`/api/admin/archive-orders?cliente=9411&days=${days}`);
    const data = await res.json();
    setOrders(data.orders || []);
  }

  async function loadReport() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/sales-report?cliente=9411&days=${days}`);
      const data = await res.json();
      setReport(data.report || []);
      setPeriodSummary(data.periodSummary || []);
      setGrandTotal(data.grandTotal || 0);
    } catch {
      setReport([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
    loadReport();
  }, [days]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPdf() {
    const jsPDFMod = await import("jspdf");
    return jsPDFMod.default;
  }

  async function loadLogo(): Promise<string | null> {
    try {
      const resp = await fetch("/logo.png");
      const blob = await resp.blob();
      return await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { return null; }
  }

  function pdfHeader(doc: InstanceType<Awaited<ReturnType<typeof loadPdf>>>, w: number, title: string, logoImg: string | null) {
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 24, "F");
    if (logoImg) {
      try { doc.addImage(logoImg, "PNG", 10, 4, 16, 16); } catch {}
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — " + title, logoImg ? 30 : 14, 12);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Local 1 — Periodo: ${days} dias — ${new Date().toLocaleString("es-AR")}`, w - 14, 14, { align: "right" });
  }

  async function exportSummaryPdf() {
    const jsPDF = await loadPdf();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const logoImg = await loadLogo();
    pdfHeader(doc, w, "Resumen por Producto", logoImg);
    let y = 32;

    // Column headers
    const drawTableHeader = () => {
      doc.setFillColor(55, 65, 81);
      doc.rect(10, y, w - 20, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("SKU", 14, y + 5.5);
      doc.text("Producto", 35, y + 5.5);
      doc.text("Cant.", 135, y + 5.5, { align: "right" });
      doc.text("Unid.", 150, y + 5.5, { align: "right" });
      doc.text("Importe", w - 14, y + 5.5, { align: "right" });
      y += 13;
      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
    };
    drawTableHeader();

    const filtered = periodSummary.filter((p) => {
      if (!searchFilter.trim()) return true;
      const term = searchFilter.toLowerCase();
      return p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term);
    });

    for (const p of filtered) {
      if (y + 6 > pageH - 15) { doc.addPage(); y = 15; drawTableHeader(); }
      doc.setTextColor(120, 120, 120);
      doc.text(p.sku, 14, y);
      doc.setTextColor(30, 30, 30);
      doc.text(p.name.substring(0, 55), 35, y);
      doc.text(String(p.totalCant), 135, y, { align: "right" });
      doc.text(p.unit || "UN", 150, y, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(formatPrice(p.totalImpo), w - 14, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      doc.setDrawColor(235, 235, 235);
      doc.line(10, y + 1.5, w - 10, y + 1.5);
      y += 5;
    }

    // Total
    y += 3;
    if (y + 12 > pageH - 15) { doc.addPage(); y = 15; }
    doc.setFillColor(251, 154, 71);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(`TOTAL (${filtered.length} productos)`, 14, y + 7);
    doc.text(formatPrice(grandTotal), w - 14, y + 7, { align: "right" });

    // Footer pages
    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(7);
      doc.text(`Pagina ${p}/${pc} — distrialma.com.ar`, w / 2, pageH - 8, { align: "center" });
    }

    doc.save(`Informes-Local1-Resumen-${days}dias-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  async function exportDailyPdf() {
    const jsPDF = await loadPdf();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const logoImg = await loadLogo();
    pdfHeader(doc, w, "Detalle Diario", logoImg);
    let y = 32;

    for (const day of report) {
      if (y + 20 > pageH - 15) { doc.addPage(); y = 15; }

      // Day header
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y, w - 20, 8, "F");
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(day.date, 14, y + 5.5);
      doc.text(formatPrice(day.dayTotal), w - 14, y + 5.5, { align: "right" });
      y += 10;

      // Column headers
      doc.setFillColor(55, 65, 81);
      doc.rect(10, y, w - 20, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(8);
      doc.text("Producto", 14, y + 5);
      doc.text("Cant.", 135, y + 5, { align: "right" });
      doc.text("Importe", w - 14, y + 5, { align: "right" });
      y += 12;

      doc.setTextColor(50, 50, 50);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);

      for (const p of day.products) {
        if (y + 5 > pageH - 15) { doc.addPage(); y = 15; }
        doc.text(p.name.substring(0, 50), 14, y);
        doc.setTextColor(150, 150, 150);
        doc.text(`(${p.sku})`, 100, y);
        doc.setTextColor(50, 50, 50);
        doc.text(String(p.totalCant), 135, y, { align: "right" });
        doc.setFont("helvetica", "bold");
        doc.text(formatPrice(p.totalImpo), w - 14, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        doc.setDrawColor(240, 240, 240);
        doc.line(10, y + 1.5, w - 10, y + 1.5);
        y += 5;
      }
      y += 3;
    }

    // Grand total
    y += 2;
    if (y + 12 > pageH - 15) { doc.addPage(); y = 15; }
    doc.setFillColor(251, 154, 71);
    doc.rect(10, y, w - 20, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL PERIODO", 14, y + 7);
    doc.text(formatPrice(grandTotal), w - 14, y + 7, { align: "right" });

    const pc = doc.getNumberOfPages();
    for (let p = 1; p <= pc; p++) {
      doc.setPage(p);
      doc.setTextColor(160, 160, 160);
      doc.setFontSize(7);
      doc.text(`Pagina ${p}/${pc} — distrialma.com.ar`, w / 2, pageH - 8, { align: "center" });
    }

    doc.save(`Informes-Local1-Diario-${days}dias-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function formatDate(fechora: string): string {
    if (!fechora || fechora.length < 8) return fechora;
    return `${fechora.slice(6, 8)}/${fechora.slice(4, 6)}/${fechora.slice(0, 4)} ${fechora.slice(8, 10) || ""}:${fechora.slice(10, 12) || ""}`;
  }

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto px-4 py-6">
        <Stagger delay={0} y={-8}>
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Informes — Local 1</h1>
        </Stagger>

        {/* Archive action */}
        <Stagger delay={50}>
          <div className="bg-white rounded-lg border shadow-sm p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="text-sm font-medium text-gray-700">Archivar pedidos de Local 1</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Lee los pendientes de PunTouch, restituye el stock que PunTouch reservaba y los elimina de PunTouch.
                </p>
              </div>
              <button
                onClick={() => archiveLocal1()}
                disabled={archiving}
                className={`px-4 py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50 ${springBtn}`}
              >
                {archiving ? "Archivando..." : "Archivar y limpiar"}
              </button>
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">
                Probar con una boleta especifica antes (recomendado la primera vez para verificar el stock):
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  type="text"
                  value={testBoleta}
                  onChange={(e) => setTestBoleta(e.target.value)}
                  placeholder="N° de boleta (ej: 000123456)"
                  className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-brand-500 min-w-[200px]"
                />
                <button
                  onClick={() => archiveLocal1({ boleta: testBoleta })}
                  disabled={archiving || !testBoleta.trim()}
                  className={`px-3 py-1.5 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:opacity-50 ${springBtn}`}
                >
                  Probar con esa boleta
                </button>
              </div>
            </div>

            {archiveResult && (
              <p className="text-sm text-green-700 mt-3 font-medium">{archiveResult}</p>
            )}

            {stockChanges.length > 0 && (
              <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                <div className="px-3 py-2 bg-gray-50 text-xs font-medium text-gray-700">
                  Verificacion de stock ({stockChanges.length} productos)
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 border-t">
                      <th className="px-3 py-1.5 text-left">SKU</th>
                      <th className="px-3 py-1.5 text-left">Producto</th>
                      <th className="px-3 py-1.5 text-right">Cant. restituida</th>
                      <th className="px-3 py-1.5 text-right">Stock antes</th>
                      <th className="px-3 py-1.5 text-right">Stock despues</th>
                      <th className="px-3 py-1.5 text-right">Delta real</th>
                      <th className="px-3 py-1.5 text-center">OK?</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockChanges.map((c) => {
                      const expectsDelta = c.cant;
                      const ok = c.delta !== null && Math.abs(c.delta - expectsDelta) < 0.001;
                      return (
                        <tr key={c.sku} className="border-t">
                          <td className="px-3 py-1.5 font-mono text-gray-700">{c.sku}</td>
                          <td className="px-3 py-1.5 text-gray-700 truncate max-w-[260px]">{c.productName || "—"}</td>
                          <td className="px-3 py-1.5 text-right font-medium">+{c.cant}</td>
                          <td className="px-3 py-1.5 text-right text-gray-500">{c.stkBefore ?? "—"}</td>
                          <td className="px-3 py-1.5 text-right font-medium text-gray-800">{c.stkAfter ?? "—"}</td>
                          <td className={`px-3 py-1.5 text-right font-medium ${c.delta !== null ? (c.delta > 0 ? "text-green-700" : "text-gray-400") : "text-gray-400"}`}>
                            {c.delta !== null ? (c.delta >= 0 ? `+${c.delta}` : c.delta) : "—"}
                          </td>
                          <td className="px-3 py-1.5 text-center">
                            {c.stkBefore === null ? (
                              <span title="No existe fila en Stock para este sku/Deposito='0'" className="text-amber-600">⚠</span>
                            ) : ok ? (
                              <span className="text-green-600">✓</span>
                            ) : (
                              <span className="text-red-600" title={`Esperado +${expectsDelta}, real ${c.delta ?? "?"}`}>✗</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </Stagger>

        {/* Period selector */}
        <Stagger delay={50}>
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-sm font-medium text-gray-600">Período:</span>
            {["7", "14", "30", "60"].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${springBtn} ${
                  days === d
                    ? "bg-brand-400 text-white border-brand-400"
                    : "bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-600"
                }`}
              >
                {d} días
              </button>
            ))}
          </div>
        </Stagger>

        {/* Tabs */}
        <Stagger delay={100}>
          <div className="flex border-b mb-4">
            <button
              onClick={() => setTab("summary")}
              className={`flex-1 py-2 text-sm font-medium border-b-2 ${springBtn} ${
                tab === "summary" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500"
              }`}
            >
              Resumen período
            </button>
            <button
              onClick={() => setTab("daily")}
              className={`flex-1 py-2 text-sm font-medium border-b-2 ${springBtn} ${
                tab === "daily" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500"
              }`}
            >
              Detalle diario
            </button>
            <button
              onClick={() => setTab("archive")}
              className={`flex-1 py-2 text-sm font-medium border-b-2 ${springBtn} ${
                tab === "archive" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500"
              }`}
            >
              Pedidos ({orders.length})
            </button>
          </div>
        </Stagger>

        {/* Summary tab — totals per product for the period */}
        {tab === "summary" && (
          <Stagger delay={150}>
            <div>
              {loading ? (
                <LoadingCenter />
              ) : periodSummary.length === 0 ? (
                <p className="text-gray-400">No hay datos. Archivá los pedidos de PunTouch primero.</p>
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      placeholder="Buscar por nombre o SKU..."
                      className="flex-1 min-w-[200px] px-4 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                    />
                    <button
                      onClick={exportSummaryPdf}
                      className={`flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 ${springBtn}`}
                    >
                      <HiOutlineDocumentDownload className="w-4 h-4" />
                      PDF
                    </button>
                  </div>
                  <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
                    <table className="w-full text-sm min-w-[500px]">
                      <thead className="bg-gray-50">
                        <tr className="whitespace-nowrap">
                          <th className="text-left px-3 py-2 font-medium text-gray-600">SKU</th>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Producto</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Cantidad total</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Importe total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {periodSummary.filter((p) => {
                          if (!searchFilter.trim()) return true;
                          const term = searchFilter.toLowerCase();
                          return p.sku.toLowerCase().includes(term) || p.name.toLowerCase().includes(term);
                        }).map((p, i) => (
                          <tr key={p.sku} className={hoverRow} style={staggerStyle(dataReady, i)}>
                            <td className="px-3 py-2 font-mono text-gray-500">{p.sku}</td>
                            <td className="px-3 py-2">{p.name}</td>
                            <td className="px-3 py-2 text-right font-medium">{p.totalCant} <span className="text-gray-400 font-normal">{p.unit || "UN"}</span></td>
                            <td className="px-3 py-2 text-right font-semibold">{formatPrice(p.totalImpo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg shadow-sm font-semibold mt-4">
                    <span>{periodSummary.length} productos</span>
                    <span className="text-lg">{formatPrice(grandTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </Stagger>
        )}

        {/* Daily detail tab */}
        {tab === "daily" && (
          <Stagger delay={150}>
            <div>
              {loading ? (
                <LoadingCenter />
              ) : report.length === 0 ? (
                <p className="text-gray-400">No hay datos. Archivá los pedidos de PunTouch primero.</p>
              ) : (
                <>
                  <div className="flex justify-end mb-3">
                    <button
                      onClick={exportDailyPdf}
                      className={`flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 ${springBtn}`}
                    >
                      <HiOutlineDocumentDownload className="w-4 h-4" />
                      PDF
                    </button>
                  </div>
                  {report.map((day, dayIdx) => (
                    <div key={day.date} className="mb-6" style={staggerStyle(dataReady, dayIdx, 100, 60)}>
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-semibold text-gray-800">{day.date}</h3>
                        <span className="text-sm font-medium text-gray-600">{formatPrice(day.dayTotal)}</span>
                      </div>
                      <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
                        <table className="w-full text-sm min-w-[400px]">
                          <thead className="bg-gray-50">
                            <tr className="whitespace-nowrap">
                              <th className="text-left px-3 py-2 font-medium text-gray-600">Producto</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Cantidad</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {day.products.map((p, i) => (
                              <tr key={p.sku} className={hoverRow} style={staggerStyle(dataReady, i)}>
                                <td className="px-3 py-1.5">
                                  {p.name} <span className="text-gray-400 text-xs">({p.sku})</span>
                                </td>
                                <td className="text-right px-3 py-1.5">{p.totalCant}</td>
                                <td className="text-right px-3 py-1.5 font-medium">{formatPrice(p.totalImpo)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg shadow-sm font-semibold">
                    <span>Total período</span>
                    <span className="text-lg">{formatPrice(grandTotal)}</span>
                  </div>
                </>
              )}
            </div>
          </Stagger>
        )}

        {/* Archive tab */}
        {tab === "archive" && (
          <Stagger delay={150}>
            <div>
              {orders.length === 0 ? (
                <p className="text-gray-400">No hay pedidos archivados.</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((order, i) => (
                    <div key={order.id} className="bg-white rounded-lg border shadow-sm p-3" style={staggerStyle(dataReady, i)}>
                      <div className="flex justify-between text-sm">
                        <span className="font-medium">#{order.nroped}</span>
                        <span className="text-gray-500">{formatDate(order.fechora)}</span>
                      </div>
                      <div className="flex justify-between text-sm mt-1">
                        <span className="text-gray-500">{order.items.length} productos</span>
                        <span className="font-semibold">{formatPrice(Number(order.total))}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Stagger>
        )}
      </div>
    </PageTransition>
  );
}
