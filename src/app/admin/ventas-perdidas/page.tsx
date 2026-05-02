"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineExclamation } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface Producto {
  sku: string;
  nombre: string;
  unidad: string;
  stock: number;
  precioMayorista: number;
  ventaAnterior: number;
  ventaActual: number;
  ventaPerdida: number;
  importePerdido: number;
}

interface Data {
  dias: number;
  periodoActual: string;
  periodoAnterior: string;
  productos: Producto[];
  totalProductos: number;
  totalPerdido: number;
}

export default function VentasPerdidasPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias] = useState("7");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/ventas-perdidas?dias=${dias}`);
      const d = await res.json();
      setData(d.error ? null : d);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [dias]); // eslint-disable-line

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Ventas Perdidas por Falta de Stock</h1>
        <p className="text-sm text-gray-500 mb-4">Productos sin stock que se vendian en el periodo anterior.</p>
      </Stagger>

      <Stagger delay={50}>
        <div className="flex flex-wrap gap-2 mb-4">
          {["7", "14", "30"].map((d) => (
            <button key={d} onClick={() => setDias(d)}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${springBtn} ${dias === d ? "bg-brand-500 text-white" : "bg-white border text-gray-600"}`}>
              {d} dias
            </button>
          ))}
        </div>
      </Stagger>

      {loading ? <LoadingCenter text="Analizando..." /> : data ? (
        <Stagger delay={100}>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <div className="text-xs text-red-500">Productos sin stock</div>
              <div className="text-2xl font-bold text-red-700">{data.totalProductos}</div>
              <div className="text-xs text-red-400">que se vendian antes</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <div className="text-xs text-amber-500">Venta perdida estimada</div>
              <div className="text-xl font-bold text-amber-700">{formatPrice(data.totalPerdido)}</div>
              <div className="text-xs text-amber-400">en {data.dias} dias</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center sm:col-span-1 col-span-2">
              <div className="text-xs text-gray-500">Comparando</div>
              <div className="text-xs text-gray-600 mt-1">{data.periodoAnterior}</div>
              <div className="text-xs text-gray-400">vs {data.periodoActual}</div>
            </div>
          </div>

          {/* Product list */}
          {data.productos.length === 0 ? (
            <div className="text-center py-12 text-gray-400">No hay productos con ventas perdidas.</div>
          ) : (
            <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500">
                {data.totalProductos} productos — Venta perdida: {formatPrice(data.totalPerdido)}
              </div>
              <div className="divide-y">
                {data.productos.map((p, i) => (
                  <div key={p.sku} className={`px-4 py-3 ${hoverRow}`} style={staggerStyle(true, i, 0, 10)}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <HiOutlineExclamation className="w-4 h-4 text-red-500 shrink-0" />
                          <span className="text-sm font-medium text-gray-900 truncate">{p.nombre}</span>
                          <span className="text-xs text-gray-400">#{p.sku}</span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 ml-6">
                          Antes: {p.ventaAnterior} {p.unidad.toLowerCase()}/periodo — Ahora: {p.ventaActual} — Perdida: {p.ventaPerdida} {p.unidad.toLowerCase()}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <div className="text-sm font-bold text-red-600">{formatPrice(p.importePerdido)}</div>
                        <div className="text-xs text-gray-400">Stock: {p.stock}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Stagger>
      ) : null}
    </PageTransition>
  );
}
