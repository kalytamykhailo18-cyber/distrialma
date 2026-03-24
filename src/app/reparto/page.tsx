"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

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

  const role = (session?.user as { role?: string } | undefined)?.role;
  const allowed = role === "admin" || role === "reparto";

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

  const filtered = data?.clients.filter((c) => {
    if (!filter.trim()) return true;
    const term = filter.toLowerCase();
    return c.nombre.toLowerCase().includes(term) || c.cod.includes(term);
  }) || [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Panel de Reparto</h1>
        <Link
          href={role === "admin" ? "/admin" : "/"}
          className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          Volver
        </Link>
      </div>
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

      {/* Search */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Buscar cliente..."
        className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm mb-4 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
      />

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
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" />
                        </svg>
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
