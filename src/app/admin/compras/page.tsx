"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";
import { HiOutlineDocumentDownload, HiOutlineTable, HiOutlineTrash } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface StockEntry {
  id: number;
  tipo: string;
  proveedorCod: string;
  proveedorName: string;
  usuario: string;
  estado: string;
  subtotal: number;
  iva: number;
  iibb: number;
  percepciones: number;
  total: number;
  notas: string | null;
  nroFactura: string | null;
  createdAt: string;
  itemCount: number;
}

type Tab = "pendiente" | "costeado" | "all";

const TAB_LABELS: Record<Tab, string> = {
  pendiente: "Pendientes",
  costeado: "Costeados",
  all: "Todos",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function ComprasPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pendiente");
  const [todaySummary, setTodaySummary] = useState<{ proveedorName: string; items: { productName: string; cantidad: number }[] }[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/stock-entries?estado=${tab}&limit=200`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));

    // Load today's costed with items for summary
    if (tab === "costeado") {
      fetch("/api/admin/stock-entries?estado=costeado&today=true&withItems=true&limit=100")
        .then((r) => r.json())
        .then((data) => {
          const summary = (data.entries || []).filter((e: { tipo?: string }) => e.tipo !== "devolucion").map((e: { proveedorName: string; items?: { productName: string; cantidad: number }[] }) => ({
            proveedorName: e.proveedorName,
            items: (e.items || []).map((it: { productName: string; cantidad: number }) => ({ productName: it.productName, cantidad: it.cantidad })),
          }));
          setTodaySummary(summary);
        })
        .catch(() => setTodaySummary([]));
    }
  }, [tab]);

  function buildSummaryText(): string {
    if (todaySummary.length === 0) return "";
    const today = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
    let text = `📦 *Costeados ${today}*\n`;
    for (const entry of todaySummary) {
      text += `\n*${entry.proveedorName}*\n`;
      for (const item of entry.items) {
        const cant = item.cantidad % 1 === 0 ? item.cantidad.toFixed(0) : item.cantidad.toFixed(1);
        text += `• ${item.productName} — ${cant}\n`;
      }
    }
    return text.trim();
  }

  function copySummary() {
    const text = buildSummaryText();
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function deleteEntry(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("¿Eliminar este ingreso pendiente?")) return;
    try {
      const res = await fetch("/api/admin/stock-entries", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok) setEntries((prev) => prev.filter((entry) => entry.id !== id));
    } catch { /* silent */ }
  }

  async function exportPDF() {
    if (entries.length === 0) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    let y = 15;

    // Header bar
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — Compras / Ingresos", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const tabLabel = TAB_LABELS[tab];
    doc.text(`${tabLabel} — ${entries.length} registros — ${new Date().toLocaleDateString("es-AR")}`, w - 14, 14, { align: "right" });

    y = 28;

    // Table header
    doc.setFillColor(55, 65, 81);
    doc.rect(8, y, w - 16, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    const cols = [
      { label: "#", x: 12 },
      { label: "Fecha", x: 24 },
      { label: "Proveedor", x: 52 },
      { label: "Factura", x: 110 },
      { label: "Estado", x: 145 },
      { label: "Usuario", x: 170 },
      { label: "Items", x: 198 },
      { label: "Subtotal", x: 224, align: "right" as const },
      { label: "IVA", x: 244, align: "right" as const },
      { label: "Total", x: 275, align: "right" as const },
    ];
    cols.forEach((c) => doc.text(c.label, c.x, y + 5.5, c.align ? { align: c.align } : undefined));
    y += 10;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    let sumSubtotal = 0, sumIva = 0, sumTotal = 0;

    for (let i = 0; i < entries.length; i++) {
      const e = entries[i];
      if (y > 190) {
        doc.addPage();
        y = 15;
      }

      if (i % 2 === 0) {
        doc.setFillColor(245, 245, 245);
        doc.rect(8, y - 3, w - 16, 7, "F");
      }
      doc.setDrawColor(220, 220, 220);
      doc.line(8, y + 4, w - 8, y + 4);

      doc.setTextColor(50, 50, 50);
      doc.text(String(e.id), 12, y + 1.5);
      doc.text(formatDateShort(e.createdAt), 24, y + 1.5);
      const provName = e.proveedorName.length > 30 ? e.proveedorName.substring(0, 28) + "..." : e.proveedorName;
      doc.text(provName, 52, y + 1.5);
      doc.text(e.nroFactura || "—", 110, y + 1.5);

      // Estado badge
      if (e.estado === "costeado") {
        doc.setFillColor(220, 252, 231);
        doc.roundedRect(143, y - 2, 18, 5, 1, 1, "F");
        doc.setTextColor(21, 128, 61);
      } else {
        doc.setFillColor(254, 243, 199);
        doc.roundedRect(143, y - 2, 18, 5, 1, 1, "F");
        doc.setTextColor(180, 83, 9);
      }
      doc.text(e.estado === "costeado" ? "Costeado" : "Pendiente", 145, y + 1.5);

      doc.setTextColor(50, 50, 50);
      doc.text(e.usuario, 170, y + 1.5);
      doc.text(String(e.itemCount), 198, y + 1.5);

      doc.text(formatPrice(e.subtotal), 224, y + 1.5, { align: "right" });
      doc.text(formatPrice(e.iva), 244, y + 1.5, { align: "right" });
      doc.setFont("helvetica", "bold");
      doc.text(formatPrice(e.total), 275, y + 1.5, { align: "right" });
      doc.setFont("helvetica", "normal");

      sumSubtotal += e.subtotal;
      sumIva += e.iva;
      sumTotal += e.total;
      y += 7;
    }

    // Summary bar
    y += 3;
    doc.setFillColor(251, 154, 71);
    doc.rect(8, y, w - 16, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("TOTALES", 14, y + 7);
    doc.text(formatPrice(sumSubtotal), 224, y + 7, { align: "right" });
    doc.text(formatPrice(sumIva), 244, y + 7, { align: "right" });
    doc.text(formatPrice(sumTotal), 275, y + 7, { align: "right" });

    // Footer
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.text(`Página ${p}/${pageCount}`, w / 2, 205, { align: "center" });
    }

    doc.save(`Compras-${tabLabel}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  function exportCSV() {
    if (entries.length === 0) return;
    const header = ["#", "Fecha", "Proveedor", "Factura", "Estado", "Usuario", "Items", "Subtotal", "IVA", "IIBB", "Percepciones", "Total", "Notas"];
    const rows = entries.map((e) => [
      e.id,
      formatDateShort(e.createdAt),
      e.proveedorName,
      e.nroFactura || "",
      e.estado,
      e.usuario,
      e.itemCount,
      e.subtotal,
      e.iva,
      e.iibb,
      e.percepciones,
      e.total,
      e.notas || "",
    ]);

    const BOM = "\uFEFF";
    const csv = BOM + [header, ...rows].map((r) =>
      r.map((c) => {
        const s = String(c);
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(",")
    ).join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Compras-${TAB_LABELS[tab]}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <Stagger delay={0} y={-8}>
          <h1 className="text-2xl font-bold text-gray-900">Compras / Ingresos</h1>
        </Stagger>
        <Stagger delay={50} y={-6}>
          <div className="flex gap-2">
            <Link
              href="/admin/compras/nuevo?tipo=devolucion"
              className={`px-4 py-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors ${springBtn}`}
            >
              Pre-nota de crédito
            </Link>
            <Link
              href="/admin/compras/nuevo"
              className={`px-4 py-2 text-sm text-white bg-brand-400 rounded-xl hover:bg-brand-500 transition-colors ${springBtn}`}
            >
              Nuevo ingreso
            </Link>
          </div>
        </Stagger>
      </div>

      {/* Tabs */}
      <Stagger delay={100}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 shadow-sm">
            {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 sm:px-4 py-1.5 text-sm rounded-md transition-colors ${springBtn} ${
                  tab === t
                    ? "bg-white text-gray-900 shadow-sm font-medium"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {TAB_LABELS[t]}
              </button>
            ))}
          </div>

          {/* Export buttons */}
          {entries.length > 0 && (
            <div className="flex gap-2 ml-auto">
              <button
                onClick={exportPDF}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors ${springBtn}`}
              >
                <HiOutlineDocumentDownload className="w-4 h-4" />
                PDF
              </button>
              <button
                onClick={exportCSV}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-green-600 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors ${springBtn}`}
              >
                <HiOutlineTable className="w-4 h-4" />
                Excel
              </button>
            </div>
          )}
        </div>
      </Stagger>

      {/* Today's costed summary for WhatsApp */}
      {tab === "costeado" && todaySummary.length > 0 && (
        <Stagger delay={120}>
          <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-green-800">Costeados de hoy</h3>
              <button onClick={copySummary}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${springBtn} ${copied ? "bg-green-600 text-white" : "bg-white text-green-700 border border-green-300 hover:bg-green-100"}`}>
                {copied ? "Copiado ✓" : "Copiar para WhatsApp"}
              </button>
            </div>
            <pre className="text-xs text-green-900 whitespace-pre-wrap font-sans leading-relaxed">{buildSummaryText()}</pre>
          </div>
        </Stagger>
      )}

      {loading ? (
        <LoadingCenter text="Cargando ingresos..." />
      ) : entries.length === 0 ? (
        <Stagger delay={150}>
          <p className="text-gray-400">No hay ingresos.</p>
        </Stagger>
      ) : (
        <Stagger delay={150}>
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <Link
                key={entry.id}
                href={`/admin/compras/${entry.id}`}
                className={`block bg-white rounded-xl border shadow-sm hover:border-brand-400 ${hoverRow}`}
                style={staggerStyle(true, i)}
              >
                <div className="px-4 py-3 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-gray-900">
                        #{entry.id}
                      </span>
                      <span className="text-sm text-gray-700">
                        {entry.proveedorName}
                      </span>
                      {entry.tipo === "devolucion" && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-700">
                          Devolución
                        </span>
                      )}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          entry.estado === "costeado"
                            ? "bg-green-100 text-green-700"
                            : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {entry.estado === "costeado" ? (entry.tipo === "devolucion" ? "Aprobada" : "Costeado") : "Pendiente"}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {formatDate(entry.createdAt)} — {entry.usuario} —{" "}
                      {entry.itemCount} producto{entry.itemCount !== 1 ? "s" : ""}
                      {entry.nroFactura && (
                        <span className="ml-2 text-blue-600">
                          Fact: {entry.nroFactura}
                        </span>
                      )}
                      {entry.notas && (
                        <span className="ml-2 text-amber-600">
                          Nota: {entry.notas}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">
                      {entry.total > 0 ? formatPrice(entry.total) : "---"}
                    </span>
                    {isAdmin && entry.estado === "pendiente" && (
                      <button
                        onClick={(e) => deleteEntry(entry.id, e)}
                        className={`p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded ${springBtn}`}
                        title="Eliminar"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </Stagger>
      )}
    </PageTransition>
  );
}
