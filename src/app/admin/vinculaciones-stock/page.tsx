"use client";

import { useState, useEffect } from "react";
import { PageTransition, Stagger, springBtn } from "@/components/AnimateIn";
import { HiOutlinePencil, HiOutlineTrash } from "react-icons/hi";

interface Mapping {
  id: number;
  skuHijo: string;
  skuPadre: string;
  nombreHijo: string | null;
  nombrePadre: string | null;
  ratio: number;
  targetStock: number;
  active: boolean;
  notas: string | null;
  createdAt: string;
}

export default function VinculacionesStockPage() {
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // New / edit form
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [fHijo, setFHijo] = useState("");
  const [fPadre, setFPadre] = useState("");
  const [fRatio, setFRatio] = useState("1");
  const [fTarget, setFTarget] = useState("1000");
  const [fNotas, setFNotas] = useState("");
  const [saving, setSaving] = useState(false);

  // If the user is creating/editing a mapping for a hijo that already has another
  // active mapping, force this row to share its targetStock (the cron only uses
  // one target per hijo). Compute from the current form's skuHijo.
  const existingTargetForHijo: number | null = (() => {
    if (!fHijo) return null;
    const other = mappings.find((m) => m.skuHijo === fHijo && m.id !== editingId);
    return other ? other.targetStock : null;
  })();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/vinculaciones-stock");
      const d = await r.json();
      setMappings(d.mappings || []);
    } catch {
      setMappings([]);
    } finally {
      setLoading(false);
    }
  }

  function openNew() {
    setEditingId("new");
    setFHijo(""); setFPadre(""); setFRatio("1"); setFTarget("1000"); setFNotas(""); setError("");
  }

  function openEdit(m: Mapping) {
    setEditingId(m.id);
    setFHijo(m.skuHijo);
    setFPadre(m.skuPadre);
    setFRatio(String(m.ratio));
    setFTarget(String(m.targetStock));
    setFNotas(m.notas || "");
    setError("");
  }

  function cancelForm() {
    setEditingId(null); setError("");
  }

  async function save() {
    setError("");
    if (!fHijo.trim() || !fPadre.trim()) { setError("Pone ambos SKUs"); return; }
    if (fHijo.trim() === fPadre.trim()) { setError("Hijo y padre no pueden ser iguales"); return; }
    const ratio = parseFloat(fRatio.replace(",", "."));
    const target = parseFloat(fTarget.replace(",", "."));
    if (!isFinite(ratio) || ratio <= 0) { setError("Ratio invalido"); return; }
    if (!isFinite(target) || target <= 0) { setError("Stock objetivo invalido"); return; }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        skuHijo: fHijo.trim(),
        skuPadre: fPadre.trim(),
        ratio,
        targetStock: target,
        notas: fNotas.trim() || null,
      };
      const method = editingId === "new" ? "POST" : "PUT";
      if (method === "PUT") body.id = editingId;
      const r = await fetch("/api/admin/vinculaciones-stock", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Error");
      }
      setEditingId(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(m: Mapping) {
    setSaving(true);
    try {
      await fetch("/api/admin/vinculaciones-stock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id, active: !m.active }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(m: Mapping) {
    if (!confirm(`Eliminar la vinculacion ${m.skuHijo} → ${m.skuPadre}? Se deja de descontar a partir de la proxima ejecucion del cron.`)) return;
    setSaving(true);
    try {
      await fetch("/api/admin/vinculaciones-stock", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: m.id }),
      });
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Vinculaciones de stock</h1>
          <button onClick={openNew} className={`px-3 py-1.5 bg-brand-600 text-white text-sm rounded-xl hover:bg-brand-700 ${springBtn}`}>
            + Nueva vinculacion
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Cada noche el cron toma el stock del SKU hijo en cada sucursal, calcula lo vendido contra el stock objetivo, descuenta esa cantidad x ratio del SKU padre, y resetea el hijo. Ejemplo: 1 unidad del hijo vendida descuenta 0.25 kg del padre → ratio = 0.25.
        </p>
      </Stagger>

      {editingId !== null && (
        <Stagger delay={50}>
          <div className="bg-white border-2 border-brand-400 rounded-xl shadow-sm p-4 mb-4">
            <h3 className="text-sm font-bold text-gray-700 mb-3">
              {editingId === "new" ? "Nueva vinculacion" : `Editar vinculacion #${editingId}`}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">SKU hijo (el que se vende)</label>
                <input value={fHijo} onChange={(e) => setFHijo(e.target.value.replace(/[^0-9]/g, ""))} placeholder="7746" className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">SKU padre (de donde se descuenta)</label>
                <input value={fPadre} onChange={(e) => setFPadre(e.target.value.replace(/[^0-9]/g, ""))} placeholder="6595" className="w-full px-3 py-2 border border-gray-300 rounded-xl font-mono text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Ratio (unidades del padre por 1 del hijo)</label>
                <input value={fRatio} onChange={(e) => setFRatio(e.target.value.replace(/[^0-9.,]/g, ""))} placeholder="0.25" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Stock objetivo del hijo
                  {existingTargetForHijo !== null && (
                    <span className="ml-1 text-amber-700">(fijado por la primera vinculacion del {fHijo}: {existingTargetForHijo})</span>
                  )}
                </label>
                <input
                  value={existingTargetForHijo !== null ? String(existingTargetForHijo) : fTarget}
                  onChange={(e) => setFTarget(e.target.value.replace(/[^0-9.,]/g, ""))}
                  disabled={existingTargetForHijo !== null}
                  placeholder="1000"
                  className={`w-full px-3 py-2 border rounded-xl text-sm ${existingTargetForHijo !== null ? "border-amber-300 bg-amber-50" : "border-gray-300"}`}
                />
                {fHijo && mappings.filter((m) => m.skuHijo === fHijo && m.id !== editingId).length > 0 && (
                  <p className="text-xs text-amber-700 mt-1">
                    El {fHijo} ya descuenta de {mappings.filter((m) => m.skuHijo === fHijo && m.id !== editingId).map((m) => `${m.skuPadre} (x${m.ratio})`).join(", ")}. La nueva vinculacion se suma.
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-gray-500 mb-1">Notas (opcional)</label>
                <input value={fNotas} onChange={(e) => setFNotas(e.target.value)} maxLength={200} placeholder="ej: porcion 250g de queso barra" className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            <div className="flex gap-2 mt-3 justify-end">
              <button onClick={cancelForm} disabled={saving} className="px-3 py-1.5 border text-gray-600 text-sm rounded-xl hover:bg-gray-100">Cancelar</button>
              <button onClick={save} disabled={saving} className={`px-3 py-1.5 bg-brand-600 text-white text-sm rounded-xl hover:bg-brand-700 disabled:opacity-50 ${springBtn}`}>
                {saving ? "Guardando…" : "Guardar"}
              </button>
            </div>
          </div>
        </Stagger>
      )}

      <Stagger delay={75}>
        <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <p className="p-4 text-sm text-gray-400">Cargando…</p>
          ) : mappings.length === 0 ? (
            <p className="p-4 text-sm text-gray-400 italic">No hay vinculaciones cargadas todavia.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead className="text-xs text-gray-500 bg-gray-50">
                  <tr>
                    <th className="text-left px-3 py-2">Hijo (se vende)</th>
                    <th className="text-left px-3 py-2">Padre (se descuenta)</th>
                    <th className="text-right px-3 py-2">Ratio</th>
                    <th className="text-right px-3 py-2 hidden sm:table-cell">Stock objetivo</th>
                    <th className="text-left px-3 py-2 hidden sm:table-cell">Notas</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((m) => (
                    <tr key={m.id} className={`border-t ${m.active ? "" : "bg-gray-50 text-gray-400"}`}>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-gray-400 mr-1">#{m.skuHijo}</span>
                        {m.nombreHijo || "(sin nombre)"}
                      </td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-xs text-gray-400 mr-1">#{m.skuPadre}</span>
                        {m.nombrePadre || "(sin nombre)"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{m.ratio}</td>
                      <td className="px-3 py-2 text-right font-mono hidden sm:table-cell">{m.targetStock}</td>
                      <td className="px-3 py-2 text-xs text-gray-500 hidden sm:table-cell">{m.notas || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex gap-2 justify-end items-center">
                          <button onClick={() => toggleActive(m)} title={m.active ? "Desactivar" : "Activar"} className={`text-xs px-2 py-1 rounded ${m.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                            {m.active ? "Activo" : "Inactivo"}
                          </button>
                          <button onClick={() => openEdit(m)} className="text-brand-600 hover:text-brand-700"><HiOutlinePencil className="w-4 h-4" /></button>
                          <button onClick={() => remove(m)} className="text-red-500 hover:text-red-700"><HiOutlineTrash className="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Stagger>
    </PageTransition>
  );
}
