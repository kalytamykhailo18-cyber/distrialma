"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

interface StockEntry {
  id: number;
  proveedorCod: string;
  proveedorName: string;
  usuario: string;
  estado: string;
  total: number;
  notas: string | null;
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

export default function ComprasPage() {
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pendiente");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/admin/stock-entries?estado=${tab}`)
      .then((r) => r.json())
      .then((data) => setEntries(data.entries || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [tab]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Compras / Ingresos</h1>
        <Link
          href="/admin/compras/nuevo"
          className="px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 transition-colors"
        >
          Nuevo ingreso
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
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

      {loading ? (
        <p className="text-gray-400">Cargando ingresos...</p>
      ) : entries.length === 0 ? (
        <p className="text-gray-400">No hay ingresos.</p>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => (
            <Link
              key={entry.id}
              href={`/admin/compras/${entry.id}`}
              className="block bg-white rounded-lg border hover:border-brand-400 transition-colors"
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
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        entry.estado === "costeado"
                          ? "bg-green-100 text-green-700"
                          : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {entry.estado === "costeado" ? "Costeado" : "Pendiente"}
                    </span>
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {formatDate(entry.createdAt)} — {entry.usuario} —{" "}
                    {entry.itemCount} producto{entry.itemCount !== 1 ? "s" : ""}
                    {entry.notas && (
                      <span className="ml-2 text-amber-600">
                        Nota: {entry.notas}
                      </span>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-sm font-semibold text-gray-900">
                  {entry.total > 0 ? formatPrice(entry.total) : "—"}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
