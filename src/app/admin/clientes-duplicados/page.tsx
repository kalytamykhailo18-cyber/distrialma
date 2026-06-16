"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { PageTransition, Stagger, LoadingCenter, springBtn } from "@/components/AnimateIn";

interface DupMember {
  cod: string;
  nombre: string;
  cuit: string;
  telefono: string;
  fechaAlta: string;
  fechaUlt: string;
  saldo: number;
  totalCompras: number;
  totalVeces: number;
  ultimaCompra: string | null;
  deBaja: boolean;
}

interface DupGroup {
  key: string;
  reason: "cuit" | "telefono";
  members: DupMember[];
}

function fmtDate(s: string | null): string {
  if (!s || s.length < 8) return "—";
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

export default function ClientesDuplicadosPage() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<DupGroup[]>([]);
  const [counts, setCounts] = useState({ total: 0, cuitGroups: 0, phoneGroups: 0 });
  // Per group: which cod is "keeper" (rest will be marked de baja)
  const [keeper, setKeeper] = useState<Record<string, string>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [hideResolved, setHideResolved] = useState(true);
  const [filter, setFilter] = useState("");

  function load() {
    setLoading(true);
    fetch("/api/admin/clientes-duplicados")
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups || []);
        setCounts({ total: d.total || 0, cuitGroups: d.cuitGroups || 0, phoneGroups: d.phoneGroups || 0 });
        const next: Record<string, string> = {};
        for (const g of (d.groups || []) as DupGroup[]) {
          next[`${g.reason}:${g.key}`] = g.members[0]?.cod || "";
        }
        setKeeper(next);
      })
      .catch(() => setGroups([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { load(); }, []);

  async function applyGroup(g: DupGroup) {
    const groupId = `${g.reason}:${g.key}`;
    const keepCod = keeper[groupId];
    if (!keepCod) return;
    const toBaja = g.members.filter((m) => m.cod !== keepCod && !m.deBaja).map((m) => m.cod);
    if (toBaja.length === 0) return;
    if (!confirm(`Marcar como de baja a ${toBaja.length} cliente${toBaja.length === 1 ? "" : "s"}? Se conserva #${keepCod}.`)) return;
    setSavingKey(groupId);
    try {
      await fetch("/api/admin/clientes-duplicados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "baja", cods: toBaja, deBaja: true }),
      });
      load();
    } catch {}
    setSavingKey(null);
  }

  async function unifyGroup(g: DupGroup) {
    const groupId = `${g.reason}:${g.key}`;
    const keepCod = keeper[groupId];
    if (!keepCod) return;
    const dupCods = g.members.filter((m) => m.cod !== keepCod && !m.deBaja).map((m) => m.cod);
    if (dupCods.length === 0) return;
    const sumSaldo = g.members.filter((m) => dupCods.includes(m.cod)).reduce((s, m) => s + m.saldo, 0);
    const sumCompras = g.members.filter((m) => dupCods.includes(m.cod)).reduce((s, m) => s + m.totalVeces, 0);
    if (!confirm(
      `Unificar ${dupCods.length} duplicado${dupCods.length === 1 ? "" : "s"} en #${keepCod}?\n\n` +
      `Se moveran ventas y pedidos al cod #${keepCod}, se sumara ${formatPrice(sumSaldo)} de saldo y ${sumCompras} compras, ` +
      `y los duplicados quedaran sin CUIT/telefono y marcados de baja con motivo "Unificado en ${keepCod}".`
    )) return;
    setSavingKey(groupId);
    try {
      const res = await fetch("/api/admin/clientes-duplicados", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "unify", keeperCod: keepCod, dupCods }),
      });
      const data = await res.json();
      if (data.error) {
        alert(`Error al unificar: ${data.error}`);
      } else {
        alert(`Unificado: ${data.affectedTransas} ventas y ${data.affectedPedidos} pedidos movidos a #${keepCod}.`);
      }
      load();
    } catch (e) {
      alert(`Error al unificar: ${e instanceof Error ? e.message : "error"}`);
    }
    setSavingKey(null);
  }

  async function revertCod(cod: string) {
    if (!confirm(`Re-habilitar el cliente #${cod}?`)) return;
    await fetch("/api/admin/clientes-duplicados", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cods: [cod], deBaja: false }),
    });
    load();
  }

  const visibleGroups = groups.filter((g) => {
    const allResolved = g.members.filter((m) => !m.deBaja).length <= 1;
    if (hideResolved && allResolved) return false;
    if (filter) {
      const f = filter.toLowerCase();
      return g.members.some((m) =>
        m.cod.includes(f)
        || m.nombre.toLowerCase().includes(f)
        || m.cuit.includes(f)
        || m.telefono.includes(f)
      );
    }
    return true;
  });

  return (
    <PageTransition className="max-w-7xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Clientes duplicados</h1>
        <p className="text-sm text-gray-500 mb-4">
          {counts.total} grupos totales — {counts.cuitGroups} por CUIT, {counts.phoneGroups} por teléfono.
          Elegí cuál querés conservar; los demás se marcan como “de baja” en PunTouch (no se borran).
        </p>
      </Stagger>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por nombre, CUIT, teléfono, cod…"
          className="px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500 min-w-[260px]"
        />
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={hideResolved} onChange={(e) => setHideResolved(e.target.checked)} className="accent-brand-500" />
          Ocultar grupos ya resueltos
        </label>
        <button onClick={load} className={`text-sm text-brand-600 hover:text-brand-700 ${springBtn}`}>
          Refrescar
        </button>
      </div>

      {loading ? (
        <LoadingCenter />
      ) : visibleGroups.length === 0 ? (
        <p className="text-gray-400 text-center py-12">No hay grupos pendientes.</p>
      ) : (
        <Stagger delay={50}>
          <div className="space-y-4">
            {visibleGroups.map((g) => {
              const groupId = `${g.reason}:${g.key}`;
              const activeCount = g.members.filter((m) => !m.deBaja).length;
              return (
                <div key={groupId} className="bg-white border rounded-xl shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
                    <div className="text-sm text-gray-700">
                      <span className={`px-2 py-0.5 rounded text-xs font-bold mr-2 ${g.reason === "cuit" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                        {g.reason === "cuit" ? "CUIT" : "Teléfono"}
                      </span>
                      <span className="font-mono">{g.key}</span>
                      <span className="text-gray-400 ml-2">— {g.members.length} clientes ({activeCount} activos)</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => unifyGroup(g)}
                        disabled={savingKey === groupId || activeCount <= 1}
                        className={`text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${springBtn} bg-brand-500 text-white hover:bg-brand-600`}
                      >
                        {savingKey === groupId ? "…" : "Unificar en el seleccionado"}
                      </button>
                      <button
                        onClick={() => applyGroup(g)}
                        disabled={savingKey === groupId || activeCount <= 1}
                        className={`text-sm px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 ${springBtn} bg-gray-200 text-gray-700 hover:bg-gray-300`}
                      >
                        Solo marcar de baja
                      </button>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
                        <th className="px-3 py-2 text-center">Conservar</th>
                        <th className="px-3 py-2 text-left">Cod</th>
                        <th className="px-3 py-2 text-left">Nombre</th>
                        <th className="px-3 py-2 text-left">CUIT</th>
                        <th className="px-3 py-2 text-left">Teléfono</th>
                        <th className="px-3 py-2 text-right">Saldo</th>
                        <th className="px-3 py-2 text-right">Compras</th>
                        <th className="px-3 py-2 text-center">Última</th>
                        <th className="px-3 py-2 text-center">Alta</th>
                        <th className="px-3 py-2 text-center">Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.members.map((m) => {
                        const isKeeper = keeper[groupId] === m.cod;
                        return (
                          <tr key={m.cod} className={`border-t ${m.deBaja ? "bg-gray-50 text-gray-400" : isKeeper ? "bg-green-50" : ""}`}>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="radio"
                                name={`keep-${groupId}`}
                                checked={isKeeper}
                                disabled={m.deBaja}
                                onChange={() => setKeeper((prev) => ({ ...prev, [groupId]: m.cod }))}
                                className="accent-brand-500"
                              />
                            </td>
                            <td className="px-3 py-2 font-mono">
                              <a href={`/admin/clientes?cod=${m.cod}`} target="_blank" rel="noopener noreferrer" className="hover:underline">
                                #{m.cod}
                              </a>
                            </td>
                            <td className="px-3 py-2">{m.nombre || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{m.cuit || "—"}</td>
                            <td className="px-3 py-2 font-mono text-xs">{m.telefono || "—"}</td>
                            <td className={`px-3 py-2 text-right font-medium ${m.saldo > 0 ? "text-red-600" : m.saldo < 0 ? "text-green-600" : ""}`}>
                              {formatPrice(m.saldo)}
                            </td>
                            <td className="px-3 py-2 text-right">{m.totalVeces}</td>
                            <td className="px-3 py-2 text-center text-xs">{fmtDate(m.ultimaCompra)}</td>
                            <td className="px-3 py-2 text-center text-xs">{fmtDate(m.fechaAlta)}</td>
                            <td className="px-3 py-2 text-center">
                              {m.deBaja ? (
                                <button onClick={() => revertCod(m.cod)} className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded hover:bg-gray-300">
                                  De baja · re-habilitar
                                </button>
                              ) : (
                                <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">Activo</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </Stagger>
      )}
    </PageTransition>
  );
}
