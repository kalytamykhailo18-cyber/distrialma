"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { HiOutlineDocumentDownload, HiOutlineTrash, HiOutlineUsers } from "react-icons/hi";

interface Movement {
  id: number;
  sucursal: string;
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

type Tab = "pendiente" | "aprobado" | "rechazado" | "all";

const TAB_LABELS: Record<Tab, string> = {
  pendiente: "Pendientes",
  aprobado: "Aprobados",
  rechazado: "Rechazados",
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

    // Group by sucursal then motivo
    const grouped = new Map<string, Movement[]>();
    for (const m of movements) {
      const key = `${m.sucursal} — ${m.destino}`;
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

  async function exportEmployeeReport() {
    if (!mesFilter) {
      alert("Seleccioná un mes para generar el reporte por empleado");
      return;
    }

    const res = await fetch(`/api/admin/movimientos/reporte?mes=${mesFilter}`);
    if (!res.ok) { alert("Error al generar reporte"); return; }
    const data = await res.json();

    if (!data.empleados || data.empleados.length === 0) {
      alert("No hay descuentos/roturas para este mes");
      return;
    }

    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const mesLabel = new Date(`${mesFilter}-01`).toLocaleDateString("es-AR", { month: "long", year: "numeric" });

    for (let ei = 0; ei < data.empleados.length; ei++) {
      const emp = data.empleados[ei];
      if (ei > 0) doc.addPage();

      let y = 15;

      // Header
      doc.setFillColor(251, 154, 71);
      doc.rect(0, 0, w, 22, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Distrialma — Descuentos del Mes", 14, 10);
      doc.setFontSize(10);
      doc.text(mesLabel.charAt(0).toUpperCase() + mesLabel.slice(1), 14, 17);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(new Date().toLocaleDateString("es-AR"), w - 14, 14, { align: "right" });

      y = 30;

      // Employee name
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text(`Empleado: ${emp.nombre}`, 14, y);
      y += 10;

      // Roturas individuales
      if (emp.roturas.length > 0) {
        doc.setFillColor(254, 226, 226);
        doc.rect(10, y - 1, w - 20, 7, "F");
        doc.setTextColor(153, 27, 27);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`Roturas individuales (${emp.roturas.length})`, 14, y + 4);
        y += 10;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);

        for (const r of emp.roturas) {
          if (y > 270) { doc.addPage(); y = 15; }
          const fecha = new Date(r.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
          doc.text(`#${r.movId}  ${fecha}`, 14, y);
          const prod = r.productos.length > 65 ? r.productos.substring(0, 63) + "..." : r.productos;
          doc.text(prod, 40, y);
          if (r.monto > 0) {
            doc.setFont("helvetica", "bold");
            doc.text(`$${r.monto.toLocaleString("es-AR")}`, w - 14, y, { align: "right" });
            doc.setFont("helvetica", "normal");
          }
          if (r.compartidoCon > 1) {
            doc.setTextColor(150, 150, 150);
            doc.text(`(compartido entre ${r.compartidoCon} empleados)`, 14, y + 4);
            doc.setTextColor(50, 50, 50);
            y += 4;
          }
          y += 6;
        }
        y += 4;
      }

      // Descuentos globales
      if (emp.globales.length > 0) {
        if (y > 255) { doc.addPage(); y = 15; }
        doc.setFillColor(219, 234, 254);
        doc.rect(10, y - 1, w - 20, 7, "F");
        doc.setTextColor(30, 64, 175);
        doc.setFontSize(9);
        doc.setFont("helvetica", "bold");
        doc.text(`Descuentos globales (${emp.globales.length}) — dividido entre ${data.totalEmpleados} empleados`, 14, y + 4);
        y += 10;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(50, 50, 50);

        for (const g of emp.globales) {
          if (y > 270) { doc.addPage(); y = 15; }
          const fecha = new Date(g.fecha).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit" });
          doc.text(`#${g.movId}  ${fecha}`, 14, y);
          const prod = g.productos.length > 65 ? g.productos.substring(0, 63) + "..." : g.productos;
          doc.text(prod, 40, y);
          if (g.parte > 0) {
            doc.setFont("helvetica", "bold");
            doc.text(`$${g.parte.toLocaleString("es-AR")}`, w - 14, y, { align: "right" });
            doc.setFont("helvetica", "normal");
          }
          y += 6;
        }
        y += 4;
      }

      // Summary
      if (y > 260) { doc.addPage(); y = 15; }
      doc.setDrawColor(200, 200, 200);
      doc.line(10, y, w - 10, y);
      y += 6;
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      const totalDescuento = emp.totalRotura + emp.totalGlobal;
      doc.text("Total a descontar:", 14, y);
      doc.setTextColor(185, 28, 28);
      doc.text(`$${totalDescuento.toLocaleString("es-AR")}`, w - 14, y, { align: "right" });
      y += 6;
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text(`Roturas: $${emp.totalRotura.toLocaleString("es-AR")} + Global: $${emp.totalGlobal.toLocaleString("es-AR")}`, 14, y);
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

    doc.save(`Descuentos-Empleados-${mesFilter}.pdf`);
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
            className="text-sm border border-brand-400 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
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
          <div className="flex gap-2">
            {mesFilter && (
              <button
                onClick={exportEmployeeReport}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-purple-600 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <HiOutlineUsers className="w-4 h-4" />
                PDF x Empleado
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
                    <span className="text-sm text-gray-500">{m.sucursal}</span>
                    <span className="text-xs text-gray-400">→</span>
                    <span className="text-sm text-gray-700">{m.destino}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        m.estado === "aprobado"
                          ? "bg-green-100 text-green-700"
                          : m.estado === "rechazado"
                          ? "bg-red-100 text-red-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {m.estado === "aprobado" ? "Aprobado" : m.estado === "rechazado" ? "Rechazado" : "Pendiente"}
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
