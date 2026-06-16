"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { PageTransition, Stagger, LoadingCenter, springBtn } from "@/components/AnimateIn";
import ConfirmModal from "@/components/ConfirmModal";
import Pagination from "@/components/Pagination";

const PAGE_SIZE = 30;

interface Row {
  sku: string;
  productName: string;
  cantidad: number;
  movimientos: number;
  currentStock?: number;
  newStock?: number;
}

export default function ReconcilePage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";

  const [rows, setRows] = useState<Row[]>([]);
  const [totalMovements, setTotalMovements] = useState(0);
  const [reconciledSince, setReconciledSince] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirmApply, setConfirmApply] = useState(false);
  const [confirmMark, setConfirmMark] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<string>("");
  const [page, setPage] = useState(1);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/movimientos/reconcile");
      const data = await res.json();
      setRows(data.rows || []);
      setTotalMovements(data.totalMovements || 0);
      setReconciledSince(data.reconciledSince || "");
    } catch {
      setRows([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function applyAll() {
    setApplying(true);
    setResult("");
    try {
      const res = await fetch("/api/admin/movimientos/reconcile", { method: "POST" });
      const data = await res.json();
      if (res.ok) {
        setResult(`Aplicado: ${data.appliedSkus} SKUs de ${data.totalMovements} movimientos`);
        setConfirmApply(false);
        await load();
      } else {
        setResult(`Error: ${data.error || "desconocido"}`);
      }
    } catch {
      setResult("Error de red");
    }
    setApplying(false);
  }

  async function markAsReconciled() {
    setApplying(true);
    setResult("");
    try {
      const res = await fetch("/api/admin/movimientos/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markOnly: true }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult("Marcado como ya conciliado. No se descontó nada de PunTouch.");
        setConfirmMark(false);
        await load();
      } else {
        setResult(`Error: ${data.error || "desconocido"}`);
      }
    } catch {
      setResult("Error de red");
    }
    setApplying(false);
  }

  const totalCant = rows.reduce((s, r) => s + r.cantidad, 0);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  if (!isAdmin) {
    return (
      <PageTransition className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-gray-400">Solo admin puede acceder a esta pantalla.</p>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Reconciliar stock de movimientos</h1>
          <Link href="/admin/movimientos" className="text-sm text-brand-600 hover:underline">← Volver</Link>
        </div>
      </Stagger>

      <Stagger delay={50}>
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 mb-4 text-sm text-amber-900">
          Por un bug entre el 6 de abril y el 29 de mayo de 2026, los movimientos aprobados se descontaron contra el SQL de prueba en vez del de producción. Esta pantalla muestra el total acumulado por SKU que falta descontar de PunTouch.
          {reconciledSince && reconciledSince !== "1970-01-01T00:00:00.000Z" && (
            <div className="mt-1 text-xs">Última reconciliación aplicada hasta: {new Date(reconciledSince).toLocaleString("es-AR")}</div>
          )}
        </div>
      </Stagger>

      <Stagger delay={100}>
        <div className="bg-white rounded-lg border shadow-sm p-4 mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-medium text-gray-700">
              {rows.length} SKUs ({totalCant.toLocaleString("es-AR", { maximumFractionDigits: 3 })} unidades totales) de {totalMovements} movimientos
            </div>
            {result && <div className="text-sm text-green-600 mt-1">{result}</div>}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setConfirmMark(true)}
              disabled={rows.length === 0 || applying}
              className={`px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-medium hover:bg-gray-700 disabled:opacity-50 ${springBtn}`}
            >
              Marcar como ya conciliado
            </button>
            <button
              onClick={() => setConfirmApply(true)}
              disabled={rows.length === 0 || applying}
              className={`px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 ${springBtn}`}
            >
              Aplicar todo a PunTouch
            </button>
          </div>
        </div>
      </Stagger>

      {loading ? (
        <LoadingCenter text="Cargando..." />
      ) : rows.length === 0 ? (
        <p className="text-gray-400">No hay movimientos pendientes de reconciliar.</p>
      ) : (
        <Stagger delay={150}>
          <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-orange-500 text-white">
                  <th className="text-left px-3 py-2">SKU</th>
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-right px-3 py-2">Movs</th>
                  <th className="text-right px-3 py-2">Cant. a descontar</th>
                  <th className="text-right px-3 py-2">Stock actual</th>
                  <th className="text-right px-3 py-2">Stock nuevo</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {pageRows.map((r) => (
                  <tr key={r.sku} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-xs text-gray-500">{r.sku}</td>
                    <td className="px-3 py-1.5 text-gray-900">{r.productName}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{r.movimientos}</td>
                    <td className="px-3 py-1.5 text-right font-medium text-red-600">-{r.cantidad}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{r.currentStock ?? "-"}</td>
                    <td className={`px-3 py-1.5 text-right font-medium ${(r.newStock ?? 0) < 0 ? "text-red-700" : "text-gray-900"}`}>
                      {r.newStock ?? "-"}
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
              total={rows.length}
              loading={loading}
              onPageChange={setPage}
            />
          </div>
        </Stagger>
      )}

      <ConfirmModal
        open={confirmApply}
        message={`Vas a descontar ${rows.length} SKUs (${totalCant.toLocaleString("es-AR")} unidades) de PunTouch. Esto NO se puede deshacer automáticamente. ¿Continuar?`}
        onConfirm={applyAll}
        onCancel={() => setConfirmApply(false)}
        loading={applying}
        confirmLabel="Aplicar"
        confirmColor="bg-red-600 hover:bg-red-700"
      />
      <ConfirmModal
        open={confirmMark}
        message={`Marcar ${rows.length} SKUs como ya conciliados sin descontar nada de PunTouch. La pantalla queda vacía y de ahora en más solo aparecen movimientos nuevos. ¿Continuar?`}
        onConfirm={markAsReconciled}
        onCancel={() => setConfirmMark(false)}
        loading={applying}
        confirmLabel="Marcar"
        confirmColor="bg-gray-600 hover:bg-gray-700"
      />
    </PageTransition>
  );
}
