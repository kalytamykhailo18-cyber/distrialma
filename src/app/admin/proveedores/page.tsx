"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePlus, HiOutlineCash, HiOutlineChevronDown, HiOutlineChevronRight } from "react-icons/hi";

interface Proveedor {
  cod: string;
  nombre: string;
  saldo: number;
}

interface ProvEntry {
  id: number;
  createdAt: string;
  estado: string;
  total: number;
  itemCount: number;
  usuario: string;
  notas: string | null;
}

export default function ProveedoresPage() {
  const { data: session } = useSession();
  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const hasCosteo = user?.role === "admin" || (user?.permissions?.includes("costeo") ?? false);

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Payment form
  const [payingProv, setPayingProv] = useState<Proveedor | null>(null);
  const [payMonto, setPayMonto] = useState("");
  const [payConcepto, setPayConcepto] = useState("");
  const [payingSaving, setPayingSaving] = useState(false);
  const [payError, setPayError] = useState("");

  // Supplier entries (purchase history)
  const [expandedProv, setExpandedProv] = useState<string | null>(null);
  const [provEntries, setProvEntries] = useState<ProvEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  function loadData() {
    setLoading(true);
    fetch("/api/admin/proveedores")
      .then((r) => r.json())
      .then((data) => setProveedores(data.proveedores || []))
      .catch(() => setProveedores([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  function toggleProvEntries(cod: string) {
    if (expandedProv === cod) {
      setExpandedProv(null);
      setProvEntries([]);
      return;
    }
    setExpandedProv(cod);
    setLoadingEntries(true);
    fetch(`/api/admin/stock-entries?proveedor=${encodeURIComponent(cod)}&estado=all&limit=20`)
      .then((r) => r.json())
      .then((data) => setProvEntries(data.entries || []))
      .catch(() => setProvEntries([]))
      .finally(() => setLoadingEntries(false));
  }

  async function handleAdd() {
    if (!newName.trim()) {
      setError("Nombre requerido");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setNewName("");
      setShowAdd(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment() {
    if (!payingProv || !payMonto) return;
    const monto = parseFloat(payMonto);
    if (isNaN(monto) || monto <= 0) {
      setPayError("Monto inválido");
      return;
    }
    setPayError("");
    setPayingSaving(true);
    try {
      const res = await fetch("/api/admin/proveedores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod: payingProv.cod, monto, concepto: payConcepto.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setPayingProv(null);
      setPayMonto("");
      setPayConcepto("");
      loadData();
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Error al registrar pago");
    } finally {
      setPayingSaving(false);
    }
  }

  const filtered = filter.trim()
    ? proveedores.filter((p) =>
        p.nombre.toLowerCase().includes(filter.toLowerCase())
      )
    : proveedores;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 transition-colors"
        >
          <HiOutlinePlus className="w-4 h-4" />
          Nuevo proveedor
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 rounded-lg border p-4 mb-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewName(""); setError(""); }}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {/* Payment form */}
      {payingProv && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4 mb-4">
          <h3 className="text-sm font-medium text-gray-900 mb-2">
            Registrar pago a: <span className="text-green-700">{payingProv.nombre}</span>
          </h3>
          <p className="text-xs text-gray-500 mb-3">
            Saldo actual: <span className="font-medium text-red-600">{formatPrice(payingProv.saldo)}</span>
          </p>
          <div className="flex gap-3 items-end flex-wrap">
            <div className="flex-1 min-w-[120px]">
              <label className="block text-xs text-gray-500 mb-1">Monto</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={payMonto}
                onChange={(e) => setPayMonto(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs text-gray-500 mb-1">Concepto (opcional)</label>
              <input
                type="text"
                value={payConcepto}
                onChange={(e) => setPayConcepto(e.target.value)}
                placeholder="Transferencia, efectivo, etc."
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <button
              onClick={handlePayment}
              disabled={payingSaving}
              className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {payingSaving ? "Registrando..." : "Registrar pago"}
            </button>
            <button
              onClick={() => { setPayingProv(null); setPayMonto(""); setPayConcepto(""); setPayError(""); }}
              disabled={payingSaving}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
          {payError && <p className="text-sm text-red-600 mt-2">{payError}</p>}
        </div>
      )}

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar proveedores..."
        className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-4"
      />

      {loading ? (
        <p className="text-gray-400">Cargando proveedores...</p>
      ) : (
        <div className="bg-white rounded-lg border divide-y max-h-[60vh] overflow-y-auto">
          {filtered.map((p) => (
            <div key={p.cod}>
              <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                <button
                  onClick={() => toggleProvEntries(p.cod)}
                  className="flex items-center gap-1 text-left min-w-0"
                >
                  {expandedProv === p.cod ? (
                    <HiOutlineChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <HiOutlineChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <span className="text-sm text-gray-900">{p.nombre}</span>
                  <span className="text-xs text-gray-400 ml-2">#{p.cod}</span>
                </button>
                <div className="flex items-center gap-3">
                  {hasCosteo && (
                    <>
                      <span
                        className={`text-sm font-medium ${
                          p.saldo > 0 ? "text-red-600" : "text-gray-400"
                        }`}
                      >
                        {p.saldo > 0 ? formatPrice(p.saldo) : "\u2014"}
                      </span>
                      {p.saldo > 0 && (
                        <button
                          onClick={() => { setPayingProv(p); setPayMonto(""); setPayConcepto(""); setPayError(""); }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          <HiOutlineCash className="w-3.5 h-3.5" />
                          Pagar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Supplier entries (purchase history) */}
              {expandedProv === p.cod && (
                <div className="bg-gray-50 px-4 py-2 border-t">
                  {loadingEntries ? (
                    <p className="text-xs text-gray-400 py-1">Cargando ingresos...</p>
                  ) : provEntries.length === 0 ? (
                    <p className="text-xs text-gray-400 py-1">Sin ingresos registrados</p>
                  ) : (
                    <div className="space-y-1">
                      {provEntries.map((entry) => (
                        <a
                          key={entry.id}
                          href={`/admin/compras/${entry.id}`}
                          className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-500">
                              {new Date(entry.createdAt).toLocaleDateString("es-AR")}
                            </span>
                            <span className="text-xs text-gray-700">
                              {entry.itemCount} {entry.itemCount === 1 ? "producto" : "productos"}
                            </span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded ${
                                entry.estado === "pendiente"
                                  ? "bg-yellow-100 text-yellow-700"
                                  : entry.estado === "costeado"
                                  ? "bg-green-100 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {entry.estado}
                            </span>
                          </div>
                          {hasCosteo && entry.total > 0 && (
                            <span className="text-xs font-medium text-gray-700">
                              {formatPrice(entry.total)}
                            </span>
                          )}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  );
}
