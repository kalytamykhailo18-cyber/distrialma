"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { PageTransition, Stagger, LoadingCenter, springBtn, hoverRow } from "@/components/AnimateIn";
import Pagination from "@/components/Pagination";

const PAGE_SIZE = 30;

interface Row {
  sku: string;
  productName: string;
  ingresos: number;
  ventas: number;
  anulacionesPendientes: number;
  boletasAnul: number;
  movimientos: number;
  stockActual: number;
}

type SortKey = "anulacionesPendientes" | "movimientos" | "ventas" | "ingresos" | "stockActual";

function fmt(n: number): string {
  if (!n) return "0";
  return n.toLocaleString("es-AR", { maximumFractionDigits: 3 });
}

export default function StockAuditoriaPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(60);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("anulacionesPendientes");
  const [page, setPage] = useState(1);

  const [adjustSku, setAdjustSku] = useState<Row | null>(null);
  const [adjustCant, setAdjustCant] = useState("");
  const [adjustMotivo, setAdjustMotivo] = useState("");
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/stock-auditoria?days=${days}&search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setRows(data.rows || []);
    } catch {
      setRows([]);
    }
    setLoading(false);
  }, [days, search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, days, sortKey]);

  function openAdjust(r: Row) {
    setAdjustSku(r);
    setAdjustCant(String(r.anulacionesPendientes || ""));
    setAdjustMotivo("Bug anulacion pendientes PunTouch");
    setAdjustError("");
  }

  async function applyAdjust() {
    if (!adjustSku) return;
    const cant = parseFloat(adjustCant);
    if (isNaN(cant) || cant === 0) {
      setAdjustError("Cantidad inválida");
      return;
    }
    setAdjusting(true);
    setAdjustError("");
    try {
      const res = await fetch("/api/admin/stock-auditoria", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku: adjustSku.sku, cantidad: cant, motivo: adjustMotivo }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAdjustError(data.error || "Error");
      } else {
        setAdjustSku(null);
        await load();
      }
    } catch {
      setAdjustError("Error de red");
    }
    setAdjusting(false);
  }

  const sorted = [...rows].sort((a, b) => b[sortKey] - a[sortKey]);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!isAdmin) {
    return (
      <PageTransition className="max-w-7xl mx-auto px-4 py-6">
        <p className="text-gray-400">Solo admin puede acceder a esta pantalla.</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="max-w-7xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Auditoría de stock</h1>
        <p className="text-sm text-gray-500 mb-4">
          Por SKU: movimientos que afectan el stock en los últimos {days} días. La columna anaranjada es la cantidad que PunTouch sumó al stock por el bug de anulación de pendientes.
        </p>
      </Stagger>

      <Stagger delay={50}>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-sm font-medium text-gray-600">Período:</span>
          {[7, 30, 60, 90, 180].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-sm font-medium border transition-colors ${springBtn} ${
                days === d ? "bg-brand-500 text-white border-brand-500" : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {d} días
            </button>
          ))}
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar SKU o nombre..."
            className="ml-auto text-sm border border-gray-300 rounded-lg px-3 py-1.5 w-56 focus:outline-none focus:border-brand-500"
          />
        </div>
      </Stagger>

      {loading ? (
        <LoadingCenter text="Cargando..." />
      ) : sorted.length === 0 ? (
        <p className="text-gray-400">Sin datos para el período seleccionado.</p>
      ) : (
        <Stagger delay={100}>
          <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-orange-500 text-white">
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Producto</th>
                  <th onClick={() => setSortKey("ingresos")} className="text-right px-3 py-2 cursor-pointer hover:bg-orange-600">+ Ingresos</th>
                  <th onClick={() => setSortKey("ventas")} className="text-right px-3 py-2 cursor-pointer hover:bg-orange-600">- Ventas</th>
                  <th onClick={() => setSortKey("anulacionesPendientes")} className="text-right px-3 py-2 cursor-pointer hover:bg-orange-600 bg-orange-700">
                    Anul. Pend. (bug)
                  </th>
                  <th onClick={() => setSortKey("movimientos")} className="text-right px-3 py-2 cursor-pointer hover:bg-orange-600">- Movs aprobados</th>
                  <th onClick={() => setSortKey("stockActual")} className="text-right px-3 py-2 cursor-pointer hover:bg-orange-600">Stock actual</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((r) => (
                  <tr key={r.sku} className={`${hoverRow} ${r.anulacionesPendientes > 0 ? "bg-amber-50" : ""}`}>
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{r.sku}</td>
                    <td className="px-3 py-1.5 text-gray-900">{r.productName || "(sin nombre)"}</td>
                    <td className="px-3 py-1.5 text-right text-green-700">{fmt(r.ingresos)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(r.ventas)}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-orange-700">
                      {fmt(r.anulacionesPendientes)}
                      {r.boletasAnul > 0 && <span className="ml-1 text-xs text-orange-500">({r.boletasAnul}b)</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{fmt(r.movimientos)}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-gray-900">{fmt(r.stockActual)}</td>
                    <td className="px-3 py-1.5">
                      <button
                        onClick={() => openAdjust(r)}
                        className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700"
                      >
                        Descontar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={sorted.length}
              loading={loading}
              onPageChange={setPage}
            />
          </div>
        </Stagger>
      )}

      {adjustSku && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => !adjusting && setAdjustSku(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-lg shadow-xl p-6 w-96 max-w-[90vw]">
            <h3 className="font-semibold text-gray-900 mb-2">Descontar stock</h3>
            <p className="text-sm text-gray-600 mb-3">
              <span className="font-mono">{adjustSku.sku}</span> — {adjustSku.productName}
            </p>
            <p className="text-xs text-gray-500 mb-3">Stock actual: {fmt(adjustSku.stockActual)} → Stock después: {fmt(adjustSku.stockActual - (parseFloat(adjustCant) || 0))}</p>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cantidad a descontar</label>
            <input
              type="number"
              step="0.001"
              value={adjustCant}
              onChange={(e) => setAdjustCant(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-3 focus:outline-none focus:border-brand-500"
              autoFocus
            />
            <label className="block text-xs font-medium text-gray-700 mb-1">Motivo</label>
            <input
              type="text"
              value={adjustMotivo}
              onChange={(e) => setAdjustMotivo(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm mb-3 focus:outline-none focus:border-brand-500"
            />
            {adjustError && <p className="text-sm text-red-600 mb-2">{adjustError}</p>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setAdjustSku(null)} disabled={adjusting} className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={applyAdjust} disabled={adjusting} className="px-3 py-1.5 text-sm text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50">
                {adjusting ? "Aplicando..." : "Aplicar"}
              </button>
            </div>
          </div>
        </>
      )}

    </PageTransition>
  );
}
