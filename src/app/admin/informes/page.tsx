"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/utils";

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
  const [tab, setTab] = useState<"summary" | "daily" | "archive">("summary");

  async function archiveLocal1() {
    setArchiving(true);
    setArchiveResult("");
    try {
      const res = await fetch("/api/admin/archive-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clienteCod: "9411", clienteName: "LOCAL1" }),
      });
      const data = await res.json();
      setArchiveResult(data.message || data.error || "Error");
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
  }, [days]);

  function formatDate(fechora: string): string {
    if (!fechora || fechora.length < 8) return fechora;
    return `${fechora.slice(6, 8)}/${fechora.slice(4, 6)}/${fechora.slice(0, 4)} ${fechora.slice(8, 10) || ""}:${fechora.slice(10, 12) || ""}`;
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Informes — Local 1</h1>
        <Link
          href="/admin"
          className="bg-white text-gray-700 px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          Volver
        </Link>
      </div>

      {/* Archive action */}
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-medium text-gray-700">Archivar pedidos de Local 1</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Lee los pendientes de PunTouch, los guarda en el VPS y los elimina de PunTouch.
            </p>
          </div>
          <button
            onClick={archiveLocal1}
            disabled={archiving}
            className="px-4 py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
          >
            {archiving ? "Archivando..." : "Archivar y limpiar"}
          </button>
        </div>
        {archiveResult && (
          <p className="text-sm text-green-600 mt-2">{archiveResult}</p>
        )}
      </div>

      {/* Period selector */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-sm font-medium text-gray-600">Período:</span>
        {["7", "14", "30", "60"].map((d) => (
          <button
            key={d}
            onClick={() => setDays(d)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              days === d
                ? "bg-brand-400 text-white border-brand-400"
                : "bg-white text-gray-600 border-gray-200 hover:border-brand-400 hover:text-brand-600"
            }`}
          >
            {d} días
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b mb-4">
        <button
          onClick={() => setTab("summary")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 ${
            tab === "summary" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500"
          }`}
        >
          Resumen período
        </button>
        <button
          onClick={() => setTab("daily")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 ${
            tab === "daily" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500"
          }`}
        >
          Detalle diario
        </button>
        <button
          onClick={() => setTab("archive")}
          className={`flex-1 py-2 text-sm font-medium border-b-2 ${
            tab === "archive" ? "border-brand-500 text-brand-600" : "border-transparent text-gray-500"
          }`}
        >
          Pedidos ({orders.length})
        </button>
      </div>

      {/* Summary tab — totals per product for the period */}
      {tab === "summary" && (
        <div>
          {loading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : periodSummary.length === 0 ? (
            <p className="text-gray-400">No hay datos. Archivá los pedidos de PunTouch primero.</p>
          ) : (
            <>
              <input
                type="text"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Buscar por nombre o SKU..."
                className="w-full px-4 py-2 border border-brand-400 rounded-xl text-sm mb-3 focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
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
                    }).map((p) => (
                      <tr key={p.sku} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-500">{p.sku}</td>
                        <td className="px-3 py-2">{p.name}</td>
                        <td className="px-3 py-2 text-right font-medium">{p.totalCant} <span className="text-gray-400 font-normal">{p.unit || "UN"}</span></td>
                        <td className="px-3 py-2 text-right font-semibold">{formatPrice(p.totalImpo)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg font-semibold mt-4">
                <span>{periodSummary.length} productos</span>
                <span className="text-lg">{formatPrice(grandTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Daily detail tab */}
      {tab === "daily" && (
        <div>
          {loading ? (
            <p className="text-gray-400">Cargando...</p>
          ) : report.length === 0 ? (
            <p className="text-gray-400">No hay datos. Archivá los pedidos de PunTouch primero.</p>
          ) : (
            <>
              {report.map((day) => (
                <div key={day.date} className="mb-6">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-gray-800">{day.date}</h3>
                    <span className="text-sm font-medium text-gray-600">{formatPrice(day.dayTotal)}</span>
                  </div>
                  <div className="bg-white rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium text-gray-600">Producto</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Cantidad</th>
                          <th className="text-right px-3 py-2 font-medium text-gray-600">Importe</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {day.products.map((p) => (
                          <tr key={p.sku}>
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
              <div className="flex justify-between items-center p-4 bg-gray-50 rounded-lg font-semibold">
                <span>Total período</span>
                <span className="text-lg">{formatPrice(grandTotal)}</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Archive tab */}
      {tab === "archive" && (
        <div>
          {orders.length === 0 ? (
            <p className="text-gray-400">No hay pedidos archivados.</p>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => (
                <div key={order.id} className="bg-white rounded-lg border p-3">
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
      )}
    </div>
  );
}
