"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { HiOutlineDocumentDownload, HiOutlineTrash } from "react-icons/hi";

interface Movement {
  id: number;
  destino: string;
  subtipo: string | null;
  usuario: string;
  estado: string;
  notas: string | null;
  aprobadoPor: string | null;
  aprobadoAt: string | null;
  createdAt: string;
  itemCount: number;
  items: Array<{ sku: string; productName: string; cantidad: number }>;
}

type Tab = "pendiente" | "aprobado" | "all";

const TAB_LABELS: Record<Tab, string> = {
  pendiente: "Pendientes",
  aprobado: "Aprobados",
  all: "Todos",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MovimientosPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pendiente");
  const [mesFilter, setMesFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("estado", tab);
    if (mesFilter) params.set("mes", mesFilter);

    fetch(`/api/admin/movimientos?${params}`)
      .then((r) => r.json())
      .then((data) => setMovements(data.movements || []))
      .catch(() => setMovements([]))
      .finally(() => setLoading(false));
  }, [tab, mesFilter]);

  async function deleteMovement(id: number, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm("¿Eliminar este movimiento pendiente?")) return;
    try {
      const res = await fetch("/api/admin/movimientos", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (res.ok)
        setMovements((prev) => prev.filter((m) => m.id !== id));
    } catch {
      /* silent */
    }
  }

  async function exportPDF() {
    if (movements.length === 0) return;
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
    doc.text("Distrialma — Movimientos Internos", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const label = mesFilter || "Todos";
    doc.text(
      `${TAB_LABELS[tab]} — ${movements.length} registros — ${label}`,
      w - 14,
      14,
      { align: "right" }
    );
    y = 28;

    // Group by destino
    const grouped = new Map<string, Movement[]>();
    for (const m of movements) {
      const key = m.destino;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(m);
    }

    for (const [destino, items] of Array.from(grouped.entries())) {
      if (y > 175) {
        doc.addPage();
        y = 15;
      }

      // Destino header
      doc.setFillColor(55, 65, 81);
      doc.rect(8, y, w - 16, 8, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(destino, 12, y + 5.5);
      doc.text(`${items.length} movimiento(s)`, w - 14, y + 5.5, {
        align: "right",
      });
      y += 10;

      // Column headers
      doc.setFillColor(240, 240, 240);
      doc.rect(8, y, w - 16, 6, "F");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(7);
      doc.text("#", 12, y + 4);
      doc.text("Fecha", 28, y + 4);
      doc.text("Usuario", 58, y + 4);
      doc.text("Productos", 95, y + 4);
      doc.text("Estado", 220, y + 4);
      doc.text("Aprobado por", 248, y + 4);
      y += 8;

      doc.setFont("helvetica", "normal");
      for (const m of items) {
        if (y > 190) {
          doc.addPage();
          y = 15;
        }

        doc.setTextColor(50, 50, 50);
        doc.setFontSize(7);
        doc.text(String(m.id), 12, y + 2);
        doc.text(
          new Date(m.createdAt).toLocaleDateString("es-AR", {
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
          }),
          28,
          y + 2
        );
        doc.text(m.usuario, 58, y + 2);

        // Products list
        const prodLines = m.items.map(
          (i) => `${i.productName.substring(0, 35)} x${i.cantidad}`
        );
        let py = y;
        for (const line of prodLines) {
          if (py > 190) {
            doc.addPage();
            py = 15;
          }
          doc.text(line, 95, py + 2);
          py += 4;
        }

        doc.text(m.estado === "aprobado" ? "Aprobado" : "Pendiente", 220, y + 2);
        doc.text(m.aprobadoPor || "—", 248, y + 2);

        y = Math.max(y + 6, py + 2);
        doc.setDrawColor(220, 220, 220);
        doc.line(8, y, w - 8, y);
        y += 2;
      }

      y += 4;
    }

    // Footer
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7);
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.text(`Página ${p}/${pageCount}`, w / 2, 205, { align: "center" });
    }

    doc.save(
      `Movimientos-${mesFilter || "todos"}-${new Date().toISOString().slice(0, 10)}.pdf`
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">
          Movimientos Internos
        </h1>
        <Link
          href="/admin/movimientos/nuevo"
          className="px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 transition-colors"
        >
          Nuevo movimiento
        </Link>
      </div>

      {/* Tabs + filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
          {(Object.keys(TAB_LABELS) as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-1.5 text-sm rounded-md transition-colors ${
                tab === t
                  ? "bg-white text-gray-900 shadow-sm font-medium"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <input
            type="month"
            value={mesFilter}
            onChange={(e) => setMesFilter(e.target.value)}
            className="text-sm border rounded-lg px-3 py-1.5"
            placeholder="Filtrar mes"
          />
          {mesFilter && (
            <button
              onClick={() => setMesFilter("")}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Limpiar
            </button>
          )}
          {movements.length > 0 && (
            <button
              onClick={exportPDF}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              <HiOutlineDocumentDownload className="w-4 h-4" />
              PDF
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando movimientos...</p>
      ) : movements.length === 0 ? (
        <p className="text-gray-400">No hay movimientos.</p>
      ) : (
        <div className="space-y-2">
          {movements.map((m) => (
            <Link
              key={m.id}
              href={`/admin/movimientos/${m.id}`}
              className="block bg-white rounded-lg border hover:border-brand-400 transition-colors"
            >
              <div className="px-4 py-3 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-900">
                      #{m.id}
                    </span>
                    <span className="text-sm text-gray-700">{m.destino}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.estado === "aprobado"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {m.estado === "aprobado" ? "Aprobado" : "Pendiente"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatDate(m.createdAt)} — {m.usuario} —{" "}
                    {m.itemCount} producto{m.itemCount !== 1 ? "s" : ""}
                    {m.aprobadoPor && (
                      <span className="ml-2 text-green-600">
                        Aprobado por: {m.aprobadoPor}
                      </span>
                    )}
                    {m.notas && (
                      <span className="ml-2 text-amber-600">
                        Nota: {m.notas}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <span className="text-xs text-gray-400">
                    {m.itemCount} items
                  </span>
                  {isAdmin && m.estado === "pendiente" && (
                    <button
                      onClick={(e) => deleteMovement(m.id, e)}
                      className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded"
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
      )}
    </div>
  );
}
