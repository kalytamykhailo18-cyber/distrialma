"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { hasPermission } from "@/lib/permissions";
import { FaWhatsapp } from "react-icons/fa";
import { HiOutlineDocumentDownload, HiOutlineCheck, HiOutlineRefresh, HiOutlineX, HiOutlineTruck } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface Client {
  cod: string;
  nombre: string;
  address: string;
  localidad: string;
  zona: string;
  telefono: string;
  hasOrder: boolean;
  status: "facturado" | "pendiente" | "none";
  orderCount: number;
  totalPlata: number;
  totalMercaderia: number;
  facturadoPlata: number;
  facturadoMercaderia: number;
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
  const [deliveryStatuses, setDeliveryStatuses] = useState<Record<string, { estado: string; observaciones: string | null; deliveredBy: string | null }>>({});
  const [showDeliveryOnly, setShowDeliveryOnly] = useState<"all" | "pending" | "done">("all");
  const [sortBy, setSortBy] = useState<"nombre" | "zona" | "estado">("nombre");

  // Today's date for delivery tracking
  const todayDate = new Date().toISOString().slice(0, 10);

  async function loadDeliveryStatuses() {
    try {
      const res = await fetch(`/api/reparto/status?fecha=${todayDate}`);
      const d = await res.json();
      const map: Record<string, { estado: string; observaciones: string | null; deliveredBy: string | null }> = {};
      for (const s of (d.statuses || [])) {
        map[s.clientId] = { estado: s.estado, observaciones: s.observaciones, deliveredBy: s.deliveredBy };
      }
      setDeliveryStatuses(map);
    } catch {}
  }

  async function setDeliveryStatus(clientId: string, estado: string) {
    const existing = deliveryStatuses[clientId];
    // If clicking the same status again, undo
    if (existing?.estado === estado) {
      await fetch(`/api/reparto/status?clientId=${clientId}&fecha=${todayDate}`, { method: "DELETE" });
    } else {
      await fetch("/api/reparto/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, fecha: todayDate, estado }),
      });

      // Send WhatsApp notification to client
      const client = data?.clients.find((c) => c.cod === clientId);
      if (client?.telefono) {
        const nombre = client.nombre.split(" ")[0]; // first name
        let msg = "";
        if (estado === "entregado") {
          msg = `Hola ${nombre}! Tu pedido de Distrialma fue entregado. Gracias por tu compra! Cualquier consulta estamos a disposicion.\n\n_Este es un mensaje automatico_`;
        } else if (estado === "reintentar") {
          const hora = new Date().toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });
          msg = `Hola ${nombre}, pasamos por tu domicilio a las ${hora} y no pudimos entregar tu pedido de Distrialma. Vamos a reintentar la entrega. Si necesitas coordinar un horario, avisanos.\n\n_Este es un mensaje automatico_`;
        }
        if (msg) {
          try {
            await fetch("/api/admin/notificaciones/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                recipients: [{ cod: clientId, nombre: client.nombre, telefono: client.telefono, saldo: 0 }],
                message: msg,
                tipo: "reparto",
              }),
            });
          } catch { /* silent */ }
        }
      }
    }
    loadDeliveryStatuses();
  }

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
      loadDeliveryStatuses();
    }
  }, [status, allowed, selectedDay]); // eslint-disable-line react-hooks/exhaustive-deps

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
    return <LoadingCenter />;
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

  const isTodaySelected = selectedDay === data?.today;
  const filteredRaw = data?.clients.filter((c) => {
    if (filter.trim()) {
      const term = filter.toLowerCase();
      if (!(c.nombre.toLowerCase().includes(term) || c.cod.includes(term) || (c.zona || "").toLowerCase().includes(term) || (c.localidad || "").toLowerCase().includes(term))) return false;
    }
    if (isTodaySelected && showDeliveryOnly !== "all") {
      const status = deliveryStatuses[c.cod];
      if (showDeliveryOnly === "pending" && status) return false;
      if (showDeliveryOnly === "done" && !status) return false;
    }
    return true;
  }) || [];

  const filtered = [...filteredRaw].sort((a, b) => {
    if (sortBy === "zona") {
      const za = a.zona || "zzz";
      const zb = b.zona || "zzz";
      if (za !== zb) return za.localeCompare(zb);
      return a.nombre.localeCompare(b.nombre);
    }
    if (sortBy === "estado") {
      const order = { pendiente: 0, facturado: 1, none: 2 };
      if (a.status !== b.status) return order[a.status] - order[b.status];
      return a.nombre.localeCompare(b.nombre);
    }
    return a.nombre.localeCompare(b.nombre);
  });

  // Group by zone when sortBy === "zona"
  const zoneGroups = sortBy === "zona"
    ? filtered.reduce((acc: { zona: string; clients: Client[] }[], c) => {
        const key = c.zona || "Sin zona";
        const existing = acc.find((g) => g.zona === key);
        if (existing) existing.clients.push(c);
        else acc.push({ zona: key, clients: [c] });
        return acc;
      }, [])
    : null;

  // Delivery progress stats (only for today)
  // Base the progress on clients that actually have something to deliver
  // (status facturado or pendiente), not on the total clients of the day.
  const clientsToDeliver = data?.clients.filter((c) => c.status === "facturado" || c.status === "pendiente") || [];
  const toDeliverIds = new Set(clientsToDeliver.map((c) => c.cod));
  const deliveryProgress = isTodaySelected ? {
    totalClientes: data?.clients.length || 0,
    total: clientsToDeliver.length,
    entregados: Object.entries(deliveryStatuses).filter(([cod, s]) => s.estado === "entregado" && toDeliverIds.has(cod)).length,
    reintentar: Object.entries(deliveryStatuses).filter(([cod, s]) => s.estado === "reintentar" && toDeliverIds.has(cod)).length,
    rechazados: Object.entries(deliveryStatuses).filter(([cod, s]) => s.estado === "rechazado" && toDeliverIds.has(cod)).length,
  } : null;

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Stagger delay={0} y={-8}>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Panel de Reparto</h1>
          <p className="text-sm text-gray-500 mb-4">Seguimiento de pedidos por día de entrega</p>
        </Stagger>

        {/* Day selector */}
        <Stagger delay={50}>
          <div className="flex flex-wrap gap-2 mb-4">
            {data?.availableDays.map((d) => (
              <button
                key={d}
                onClick={() => setSelectedDay(d)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${springBtn} ${
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
        </Stagger>

        {/* Stats */}
        {data?.stats && (
          <Stagger delay={80}>
            <div className="grid grid-cols-4 gap-3 mb-4">
              <div className="bg-gray-50 rounded-xl p-3 text-center border shadow-sm">
                <p className="text-2xl font-bold text-gray-900">{data.stats.total}</p>
                <p className="text-xs text-gray-500">Clientes</p>
              </div>
              <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200 shadow-sm">
                <p className="text-2xl font-bold text-green-600">{data.stats.facturado}</p>
                <p className="text-xs text-green-600">Facturado</p>
              </div>
              <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-200 shadow-sm">
                <p className="text-2xl font-bold text-yellow-600">{data.stats.pendiente}</p>
                <p className="text-xs text-yellow-600">Pedido web</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200 shadow-sm">
                <p className="text-2xl font-bold text-red-600">{data.stats.sinPedido}</p>
                <p className="text-xs text-red-600">Sin pedido</p>
              </div>
            </div>
          </Stagger>
        )}

        {/* Money & merchandise summary */}
        {data && (() => {
          const totalPlataFacturado = data.clients.reduce((s, c) => s + (c.facturadoPlata || 0), 0);
          const totalMercaderiaFacturado = data.clients.reduce((s, c) => s + (c.facturadoMercaderia || 0), 0);
          const totalPlataPedidosWeb = data.clients
            .filter((c) => c.status === "pendiente")
            .reduce((s, c) => s + (c.totalPlata || 0), 0);
          const totalMercaderiaPedidosWeb = data.clients
            .filter((c) => c.status === "pendiente")
            .reduce((s, c) => s + (c.totalMercaderia || 0), 0);
          if (totalPlataFacturado === 0 && totalPlataPedidosWeb === 0) return null;
          return (
            <Stagger delay={85}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                <div className="bg-white border-2 border-green-300 rounded-xl p-3 shadow-sm">
                  <div className="text-xs text-green-700 font-semibold mb-1">Facturado (a repartir)</div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xl font-bold text-green-700">{formatPrice(totalPlataFacturado)}</span>
                    <span className="text-sm text-gray-600">{totalMercaderiaFacturado.toLocaleString("es-AR", { maximumFractionDigits: 1 })} unid/kg</span>
                  </div>
                </div>
                <div className="bg-white border-2 border-yellow-300 rounded-xl p-3 shadow-sm">
                  <div className="text-xs text-yellow-700 font-semibold mb-1">Pedidos web (sin facturar)</div>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xl font-bold text-yellow-700">{formatPrice(totalPlataPedidosWeb)}</span>
                    <span className="text-sm text-gray-600">{totalMercaderiaPedidosWeb.toLocaleString("es-AR", { maximumFractionDigits: 1 })} unid/kg</span>
                  </div>
                </div>
              </div>
            </Stagger>
          );
        })()}

        {/* Delivery progress bar (only when today is selected) */}
        {isTodaySelected && deliveryProgress && deliveryProgress.total > 0 && (
          <Stagger delay={90}>
            <div className="bg-white border rounded-xl p-3 mb-4 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <HiOutlineTruck className="w-4 h-4 text-brand-500" />
                <span className="text-sm font-semibold text-gray-700">Entregas de hoy</span>
                <span className="ml-auto text-xs text-gray-500">
                  <strong className="text-gray-900">{deliveryProgress.entregados + deliveryProgress.reintentar + deliveryProgress.rechazados} / {deliveryProgress.total}</strong>
                  <span className="ml-2 text-gray-400">a entregar</span>
                  <span className="ml-2 text-gray-400">({deliveryProgress.totalClientes} clientes del dia)</span>
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
                {deliveryProgress.entregados > 0 && (
                  <div className="bg-green-500 transition-all duration-300" style={{ width: `${(deliveryProgress.entregados / deliveryProgress.total) * 100}%` }} />
                )}
                {deliveryProgress.reintentar > 0 && (
                  <div className="bg-amber-400 transition-all duration-300" style={{ width: `${(deliveryProgress.reintentar / deliveryProgress.total) * 100}%` }} />
                )}
                {deliveryProgress.rechazados > 0 && (
                  <div className="bg-red-500 transition-all duration-300" style={{ width: `${(deliveryProgress.rechazados / deliveryProgress.total) * 100}%` }} />
                )}
              </div>
              <div className="flex flex-wrap gap-3 mt-2 text-xs">
                <span className="text-green-700"><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Entregados: <strong>{deliveryProgress.entregados}</strong></span>
                <span className="text-amber-700"><span className="inline-block w-2 h-2 rounded-full bg-amber-400 mr-1" />Reintentar: <strong>{deliveryProgress.reintentar}</strong></span>
                <span className="text-red-700"><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Rechazados: <strong>{deliveryProgress.rechazados}</strong></span>
                <span className="text-gray-500 ml-auto">Pendientes: <strong>{deliveryProgress.total - deliveryProgress.entregados - deliveryProgress.reintentar - deliveryProgress.rechazados}</strong></span>
              </div>
            </div>
          </Stagger>
        )}

        {/* Search + Export + delivery filter */}
        <Stagger delay={100}>
          <div className="flex flex-wrap gap-2 mb-4">
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar cliente..."
              className="flex-1 min-w-[150px] px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
            />
            {isTodaySelected && (
              <div className="flex gap-1">
                {[{k: "all", l: "Todos"}, {k: "pending", l: "Pendientes"}, {k: "done", l: "Entregados"}].map((o) => (
                  <button key={o.k} onClick={() => setShowDeliveryOnly(o.k as "all" | "pending" | "done")}
                    className={`px-3 py-2 rounded-lg text-xs font-medium ${springBtn} ${showDeliveryOnly === o.k ? "bg-brand-500 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
                    {o.l}
                  </button>
                ))}
              </div>
            )}
            <div className="flex items-center gap-1 bg-white border rounded-lg px-2">
              <span className="text-xs text-gray-500 hidden sm:inline">Orden:</span>
              {[{k: "nombre", l: "Nombre"}, {k: "zona", l: "Zona"}, {k: "estado", l: "Estado"}].map((o) => (
                <button key={o.k} onClick={() => setSortBy(o.k as "nombre" | "zona" | "estado")}
                  className={`px-2 py-1.5 rounded text-xs font-medium ${springBtn} ${sortBy === o.k ? "bg-brand-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}>
                  {o.l}
                </button>
              ))}
            </div>
            {filtered.length > 0 && (
              <button
                onClick={exportPDF}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 shrink-0 ${springBtn}`}
              >
                <HiOutlineDocumentDownload className="w-4 h-4" />
                PDF
              </button>
            )}
          </div>
        </Stagger>

        {/* Client list */}
        <Stagger delay={150}>
          {loading ? (
            <LoadingCenter />
          ) : filtered.length === 0 ? (
            <p className="text-gray-400">No hay clientes para {selectedDay}.</p>
          ) : sortBy === "zona" && zoneGroups ? (
            <div className="space-y-4">
              {zoneGroups.map((group, gi) => (
                <div key={group.zona} className="space-y-2">
                  <div className="flex items-center gap-2 px-2 py-1 bg-brand-100 rounded-lg">
                    <span className="text-sm font-semibold text-brand-700">📍 {group.zona}</span>
                    <span className="text-xs text-gray-500">({group.clients.length})</span>
                  </div>
                  {group.clients.map((client, i) => renderClient(client, gi * 100 + i))}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((client, i) => renderClient(client, i))}
            </div>
          )}
        </Stagger>
      </div>
    </PageTransition>
  );

  function renderClient(client: Client, i: number) {
    const delivery = deliveryStatuses[client.cod];
    const isEntregado = delivery?.estado === "entregado";
    const isReintentar = delivery?.estado === "reintentar";
    const isRechazado = delivery?.estado === "rechazado";
    return (
      <div
        key={client.cod}
        style={staggerStyle(true, i)}
        className={`rounded-xl border-2 p-3 shadow-sm transition-all duration-200 ${hoverRow} ${
          isEntregado ? "bg-green-100 border-green-400 opacity-75"
          : isReintentar ? "bg-amber-50 border-amber-300"
          : isRechazado ? "bg-red-100 border-red-400"
          : client.status === "facturado" ? "bg-green-50 border-green-200"
          : client.status === "pendiente" ? "bg-yellow-50 border-yellow-200"
          : "bg-red-50 border-red-200"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className={`w-4 h-4 rounded-full shrink-0 ${
            client.status === "facturado" ? "bg-green-500"
            : client.status === "pendiente" ? "bg-yellow-400"
            : "bg-red-500"
          }`} />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 text-sm">{client.nombre}</p>
            <div className="flex flex-wrap gap-x-3 text-xs text-gray-500">
              {client.address && <span>{client.address}</span>}
              {client.localidad && <span className="text-gray-400">{client.localidad}</span>}
              {client.telefono && (() => {
                let num = client.telefono.replace(/\D/g, "");
                if (num.startsWith("549")) num = num.slice(3);
                else if (num.startsWith("54")) num = num.slice(2);
                const waLink = `https://api.whatsapp.com/send?phone=549${num}`;
                return (
                  <a href={waLink} target="_blank" rel="noopener noreferrer"
                     className="text-green-600 hover:underline flex items-center gap-1">
                    <FaWhatsapp className="w-3 h-3" />
                    {client.telefono}
                  </a>
                );
              })()}
            </div>
          </div>
          <div className="text-right shrink-0">
            {client.status === "facturado" ? (
              <>
                <p className="text-sm font-bold text-green-700">{formatPrice(client.facturadoPlata || client.totalPlata)}</p>
                <p className="text-xs text-green-600">{(client.facturadoMercaderia || client.totalMercaderia).toLocaleString("es-AR", { maximumFractionDigits: 1 })} unid/kg {client.orderCount > 1 ? `· ${client.orderCount} boletas` : ""}</p>
                <p className="text-xs text-green-500 font-medium">Facturado</p>
              </>
            ) : client.status === "pendiente" ? (
              <>
                <p className="text-sm font-bold text-yellow-700">{formatPrice(client.totalPlata)}</p>
                <p className="text-xs text-yellow-600">{client.totalMercaderia.toLocaleString("es-AR", { maximumFractionDigits: 1 })} unid/kg {client.orderCount > 1 ? `· ${client.orderCount} pedidos` : ""}</p>
                <p className="text-xs text-yellow-500 font-medium">Pedido web</p>
              </>
            ) : (
              <p className="text-xs font-medium text-red-600">Sin pedido</p>
            )}
          </div>
        </div>

        {isTodaySelected && (
          <div className="mt-2 pt-2 border-t border-black/5 flex gap-2">
            <button onClick={() => setDeliveryStatus(client.cod, "entregado")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${springBtn} ${
                isEntregado ? "bg-green-600 text-white shadow-md" : "bg-white border-2 border-green-300 text-green-700 hover:bg-green-50"
              }`}>
              <HiOutlineCheck className="w-4 h-4" />
              Entregado
            </button>
            <button onClick={() => setDeliveryStatus(client.cod, "reintentar")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${springBtn} ${
                isReintentar ? "bg-amber-500 text-white shadow-md" : "bg-white border-2 border-amber-300 text-amber-700 hover:bg-amber-50"
              }`}>
              <HiOutlineRefresh className="w-4 h-4" />
              Reintentar
            </button>
            <button onClick={() => setDeliveryStatus(client.cod, "rechazado")}
              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold transition-all ${springBtn} ${
                isRechazado ? "bg-red-600 text-white shadow-md" : "bg-white border-2 border-red-300 text-red-700 hover:bg-red-50"
              }`}>
              <HiOutlineX className="w-4 h-4" />
              Rechazado
            </button>
          </div>
        )}
        {delivery?.deliveredBy && (
          <div className="mt-1 text-xs text-gray-400 text-right">Por {delivery.deliveredBy}</div>
        )}
      </div>
    );
  }
}
