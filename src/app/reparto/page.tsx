"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { FaWhatsapp } from "react-icons/fa";
import { HiOutlineDocumentDownload } from "react-icons/hi";

interface Client {
  cod: string;
  nombre: string;
  address: string;
  telefono: string;
  hasOrder: boolean;
  status: "facturado" | "pendiente" | "none";
  orderCount: number;
  lastOrderTotal: number;
  lastOrderDate: string | null;
}

interface RepartoData {
  clients: Client[];
  day: string;
  today: string;
  availableDays: string[];
  stats: { total: number; facturado: number; pendiente: number; sinPedido: number };
}

export default function RepartoPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<RepartoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [filter, setFilter] = useState("");

  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const allowed = hasPermission(user?.role, user?.permissions, "reparto");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/reparto");
    }
    if (status === "authenticated" && !allowed) {
      router.push("/");
    }
  }, [status, allowed, router]);

  useEffect(() => {
    if (status === "authenticated" && allowed) {
      loadData(selectedDay);
    }
  }, [status, allowed, selectedDay]);

  async function loadData(day: string) {
    setLoading(true);
    try {
      const url = day ? `/api/reparto?day=${day}` : "/api/reparto";
      const res = await fetch(url);
      const d = await res.json();
      setData(d);
      if (!selectedDay && d.today) setSelectedDay(d.today);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  if (status === "loading" || (status === "authenticated" && loading && !data)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <p className="text-gray-500">Cargando...</p>
      </div>
    );
  }

  if (!allowed) return null;

  async function exportPDF() {
    if (!data || !filtered.length) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    let y = 15;

    // Header
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — Hoja de Reparto", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`${selectedDay} — ${filtered.length} clientes — ${new Date().toLocaleDateString("es-AR")}`, w - 14, 14, { align: "right" });
    y = 28;

    // Stats bar
    if (data.stats) {
      doc.setFillColor(240, 240, 240);
      doc.rect(10, y, w - 20, 8, "F");
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8);
      doc.text(`Total: ${data.stats.total}  |  Facturado: ${data.stats.facturado}  |  Pedido web: ${data.stats.pendiente}  |  Sin pedido: ${data.stats.sinPedido}`, 14, y + 5.5);
      y += 12;
    }

    // Table header
    doc.setFillColor(55, 65, 81);
    doc.rect(10, y, w - 20, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7);
    doc.setFont("helvetica", "bold");
    doc.text("#", 14, y + 5.5);
    doc.text("Cliente", 22, y + 5.5);
    doc.text("Dirección", 90, y + 5.5);
    doc.text("Teléfono", 148, y + 5.5);
    doc.text("Estado", 178, y + 5.5);
    doc.text("Total", w - 14, y + 5.5, { align: "right" });
    y += 10;

    // Rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    for (let i = 0; i < filtered.length; i++) {
      const c = filtered[i];
      if (y > 275) {
        doc.addPage();
        y = 15;
      }

      // Zebra stripe
      if (i % 2 === 0) {
        doc.setFillColor(248, 248, 248);
        doc.rect(10, y - 3, w - 20, 7, "F");
      }

      // Status color dot
      if (c.status === "facturado") doc.setFillColor(34, 197, 94);
      else if (c.status === "pendiente") doc.setFillColor(234, 179, 8);
      else doc.setFillColor(239, 68, 68);
      doc.circle(16, y + 0.5, 1.5, "F");

      // Grid line
      doc.setDrawColor(220, 220, 220);
      doc.line(10, y + 4, w - 10, y + 4);

      doc.setTextColor(50, 50, 50);
      doc.text(String(i + 1), 14, y + 1);
      const nombre = c.nombre.length > 35 ? c.nombre.substring(0, 33) + "..." : c.nombre;
      doc.setFont("helvetica", "bold");
      doc.text(nombre, 22, y + 1);
      doc.setFont("helvetica", "normal");
      const addr = (c.address || "—").length > 30 ? (c.address || "").substring(0, 28) + "..." : (c.address || "—");
      doc.text(addr, 90, y + 1);
      doc.text(c.telefono || "—", 148, y + 1);

      // Status badge
      if (c.status === "facturado") {
        doc.setTextColor(21, 128, 61);
        doc.text("Facturado", 178, y + 1);
      } else if (c.status === "pendiente") {
        doc.setTextColor(161, 98, 7);
        doc.text("Pedido web", 178, y + 1);
      } else {
        doc.setTextColor(220, 38, 38);
        doc.text("Sin pedido", 178, y + 1);
      }

      doc.setTextColor(50, 50, 50);
      if (c.lastOrderTotal > 0) {
        doc.setFont("helvetica", "bold");
        doc.text(formatPrice(c.lastOrderTotal), w - 14, y + 1, { align: "right" });
        doc.setFont("helvetica", "normal");
      }

      y += 7;
    }

    // Footer
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7);
    const pageCount = doc.getNumberOfPages();
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.text(`Página ${p}/${pageCount} — distrialma.com.ar`, w / 2, 290, { align: "center" });
    }

    doc.save(`Reparto-${selectedDay}-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  const filtered = data?.clients.filter((c) => {
    if (!filter.trim()) return true;
    const term = filter.toLowerCase();
    return c.nombre.toLowerCase().includes(term) || c.cod.includes(term);
  }) || [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Panel de Reparto</h1>
      <p className="text-sm text-gray-500 mb-4">Seguimiento de pedidos por día de entrega</p>

      {/* Day selector */}
      <div className="flex flex-wrap gap-2 mb-4">
        {data?.availableDays.map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDay(d)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              selectedDay === d
                ? "bg-brand-400 text-white border-brand-400"
                : d === data?.today
                ? "bg-white text-brand-600 border-brand-400"
                : "bg-white text-gray-600 border-gray-200 hover:border-brand-400"
            }`}
          >
            {d}
            {d === data?.today && selectedDay !== d && " (hoy)"}
          </button>
        ))}
      </div>

      {/* Stats */}
      {data?.stats && (
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-50 rounded-xl p-3 text-center border">
            <p className="text-2xl font-bold text-gray-900">{data.stats.total}</p>
            <p className="text-xs text-gray-500">Clientes</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
            <p className="text-2xl font-bold text-green-600">{data.stats.facturado}</p>
            <p className="text-xs text-green-600">Facturado</p>
          </div>
          <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-200">
            <p className="text-2xl font-bold text-yellow-600">{data.stats.pendiente}</p>
            <p className="text-xs text-yellow-600">Pedido web</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
            <p className="text-2xl font-bold text-red-600">{data.stats.sinPedido}</p>
            <p className="text-xs text-red-600">Sin pedido</p>
          </div>
        </div>
      )}

      {/* Search + Export */}
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar cliente..."
          className="flex-1 px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        />
        {filtered.length > 0 && (
          <button
            onClick={exportPDF}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 shrink-0"
          >
            <HiOutlineDocumentDownload className="w-4 h-4" />
            PDF
          </button>
        )}
      </div>

      {/* Client list */}
      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400">No hay clientes para {selectedDay}.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((client) => (
            <div
              key={client.cod}
              className={`rounded-lg border p-3 flex items-center gap-3 ${
                client.status === "facturado"
                  ? "bg-green-50 border-green-200"
                  : client.status === "pendiente"
                  ? "bg-yellow-50 border-yellow-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              {/* Semáforo */}
              <div className={`w-4 h-4 rounded-full shrink-0 ${
                client.status === "facturado"
                  ? "bg-green-500"
                  : client.status === "pendiente"
                  ? "bg-yellow-400"
                  : "bg-red-500"
              }`} />

              {/* Client info */}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">{client.nombre}</p>
                <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
                  {client.address && <span>{client.address}</span>}
                  {client.telefono && (() => {
                    let num = client.telefono.replace(/\D/g, "");
                    // Remove leading 54 or 549 if already included
                    if (num.startsWith("549")) num = num.slice(3);
                    else if (num.startsWith("54")) num = num.slice(2);
                    const waLink = `https://api.whatsapp.com/send?phone=549${num}`;
                    return (
                      <a href={waLink}
                         target="_blank" rel="noopener noreferrer"
                         className="text-green-600 hover:underline flex items-center gap-1">
                        <FaWhatsapp className="w-3 h-3" />
                        {client.telefono}
                      </a>
                    );
                  })()}
                </div>
              </div>

              {/* Order status */}
              <div className="text-right shrink-0">
                {client.status === "facturado" ? (
                  <>
                    <p className="text-sm font-bold text-green-700">{formatPrice(client.lastOrderTotal)}</p>
                    <p className="text-xs text-green-600">{client.lastOrderDate}</p>
                    <p className="text-xs text-green-500 font-medium">Facturado</p>
                  </>
                ) : client.status === "pendiente" ? (
                  <>
                    <p className="text-sm font-bold text-yellow-700">{formatPrice(client.lastOrderTotal)}</p>
                    <p className="text-xs text-yellow-600">{client.lastOrderDate}</p>
                    <p className="text-xs text-yellow-500 font-medium">Pedido web</p>
                  </>
                ) : (
                  <p className="text-xs font-medium text-red-600">Sin pedido</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
