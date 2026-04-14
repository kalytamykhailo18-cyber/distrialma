"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";

interface PreviewProduct { sku: string; nombre: string; costoActual: number; costoNuevo: number }

const fmt = (n: number) => formatPrice(n);

export default function PreciosMasivosPage() {
  const [marcas, setMarcas] = useState<Array<{ cod: string; nombre: string }>>([]);
  const [proveedores, setProveedores] = useState<Array<{ cod: string; nombre: string }>>([]);
  const [marcaCod, setMarcaCod] = useState("");
  const [proveedorCod, setProveedorCod] = useState("");
  const [porcentaje, setPorcentaje] = useState("");
  const [preview, setPreview] = useState<PreviewProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState("");
  const [confirmStep, setConfirmStep] = useState(false);

  useEffect(() => {
    fetch("/api/admin/precios-masivos").then(r => r.json()).then(d => {
      setMarcas(d.marcas || []);
      setProveedores(d.proveedores || []);
    }).catch(() => {});
  }, []);

  async function handlePreview() {
    if (!porcentaje || (!marcaCod && !proveedorCod)) return;
    setLoading(true);
    setPreview([]);
    setResult("");
    try {
      const res = await fetch("/api/admin/precios-masivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcaCod: marcaCod || undefined, proveedorCod: proveedorCod || undefined, porcentaje, preview: true }),
      });
      const d = await res.json();
      setPreview(d.products || []);
    } catch {}
    setLoading(false);
  }

  async function handleApply() {
    if (!porcentaje || (!marcaCod && !proveedorCod)) return;
    setApplying(true);
    setConfirmStep(false);
    setResult("");
    try {
      const res = await fetch("/api/admin/precios-masivos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marcaCod: marcaCod || undefined, proveedorCod: proveedorCod || undefined, porcentaje }),
      });
      const d = await res.json();
      setResult("Actualizados: " + (d.updated || 0) + " productos");
      setPreview([]);
    } catch { setResult("Error al aplicar"); }
    setApplying(false);
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Actualizacion Masiva de Precios</h1>
      <p className="text-sm text-gray-500 mb-6">Aplica un porcentaje al costo de todos los productos de una marca o proveedor. Los precios se recalculan respetando los margenes.</p>

      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Marca</label>
            <select value={marcaCod} onChange={(e) => { setMarcaCod(e.target.value); setPreview([]); setResult(""); }}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Todas</option>
              {marcas.map(m => <option key={m.cod} value={m.cod}>{m.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Proveedor</label>
            <select value={proveedorCod} onChange={(e) => { setProveedorCod(e.target.value); setPreview([]); setResult(""); }}
              className="w-full px-3 py-2 border rounded-lg text-sm">
              <option value="">Todos</option>
              {proveedores.map(p => <option key={p.cod} value={p.cod}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">% al costo</label>
            <div className="flex items-center gap-2">
              <input type="number" value={porcentaje} onChange={(e) => { setPorcentaje(e.target.value); setPreview([]); setResult(""); }}
                placeholder="10" step="0.5"
                className="flex-1 px-3 py-2 border border-brand-400 rounded-lg text-sm text-right font-bold" />
              <span className="text-gray-500">%</span>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={handlePreview} disabled={loading || !porcentaje || (!marcaCod && !proveedorCod)}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {loading ? "Buscando..." : "Vista previa"}
          </button>
          {preview.length > 0 && !confirmStep && (
            <button onClick={() => setConfirmStep(true)}
              className="px-4 py-2 bg-brand-500 text-white rounded-lg text-sm font-medium">
              Aplicar a {preview.length} productos
            </button>
          )}
          {confirmStep && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-red-600 font-medium">Confirmar?</span>
              <button onClick={handleApply} disabled={applying}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {applying ? "Aplicando..." : "Si, aplicar"}
              </button>
              <button onClick={() => setConfirmStep(false)}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm font-medium">
                Cancelar
              </button>
            </div>
          )}
        </div>
        {result && <p className="mt-3 text-sm text-green-600 font-medium">{result}</p>}
      </div>

      {preview.length > 0 && (
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b">
            <h3 className="text-sm font-bold text-gray-700">{preview.length} productos afectados</h3>
          </div>
          <div className="divide-y max-h-[400px] overflow-y-auto">
            {preview.map(p => (
              <div key={p.sku} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-400 font-mono mr-2">{p.sku}</span>
                  <span className="text-sm text-gray-900">{p.nombre}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 text-sm">
                  <span className="text-gray-400">{fmt(p.costoActual)}</span>
                  <span className="text-gray-400">→</span>
                  <span className="text-brand-600 font-bold">{fmt(p.costoNuevo)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
