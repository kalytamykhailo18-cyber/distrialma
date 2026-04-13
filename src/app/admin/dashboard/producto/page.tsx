"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { HiArrowLeft } from "react-icons/hi";
import Link from "next/link";

const fmt = (n: number) => formatPrice(n);
const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));
const LISTA_LABELS: Record<number, string> = { 1: "Minorista", 2: "Mayorista", 3: "Especial", 4: "Caja Cerrada", 5: "PedidosYa" };
const SUC_NAMES: Record<string, string> = { "1": "Minorista 435", "2": "Mayorista 387", "6": "May. Pontevedra", "7": "Distribuidora", "10": "Reventas" };

interface ProductData {
  producto: { sku: string; nombre: string; marca: string; rubro: string; unidad: string; stockActual: number; costoUnit: number; precios: Record<string, number> };
  ventasMensuales: Array<{ mes: string; cantidad: number; totalVenta: number; ganancia: number }>;
  porSucursal: Array<{ sucursal: string; cantidad: number; totalVenta: number; ganancia: number }>;
  porLista: Array<{ lista: number; cantidad: number; totalVenta: number; ganancia: number }>;
  topClientes: Array<{ clienteCod: string; nombre: string; cantidad: number; totalVenta: number }>;
}

export default function ProductoDetailPage() {
  const searchParams = useSearchParams();
  const sku = searchParams.get("sku") || "";
  const [data, setData] = useState<ProductData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!sku) return;
    setLoading(true);
    fetch(`/api/admin/dashboard/producto?sku=${sku}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [sku]);

  if (!sku) return <div className="max-w-4xl mx-auto px-4 py-6 text-gray-400">SKU no especificado</div>;
  if (loading) return <div className="max-w-4xl mx-auto px-4 py-6 text-gray-400">Cargando...</div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-6 text-gray-400">Error al cargar datos</div>;

  const p = data.producto;
  const totalVenta = data.ventasMensuales.reduce((s, m) => s + m.totalVenta, 0);
  const totalGanancia = data.ventasMensuales.reduce((s, m) => s + m.ganancia, 0);
  const totalCant = data.ventasMensuales.reduce((s, m) => s + m.cantidad, 0);
  const margen = totalVenta > 0 ? ((totalGanancia / totalVenta) * 100).toFixed(1) : "0";

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link href="/admin/resumen-productos" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-4">
        <HiArrowLeft className="w-4 h-4" /> Volver al resumen
      </Link>

      <div className="bg-white border rounded-xl p-4 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{p.nombre}</h1>
            <p className="text-sm text-gray-500">SKU: {p.sku} — {p.marca} — {p.rubro} — {p.unidad}</p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Stock actual</div>
            <div className="text-xl font-bold text-gray-900">{p.stockActual} {p.unidad === "KG" ? "kg" : "u"}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4">
          {Object.entries(p.precios).map(([key, val]) => val > 0 && (
            <div key={key} className="bg-gray-50 rounded-lg p-2 text-center">
              <div className="text-xs text-gray-500">{LISTA_LABELS[parseInt(key.replace("p", ""))] || key}</div>
              <div className="text-sm font-bold">{fmt(val)}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-gray-900">{totalCant.toLocaleString("es-AR", { maximumFractionDigits: 0 })}</div>
          <div className="text-xs text-gray-500">Cantidad vendida</div>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-blue-600">{fmtK(totalVenta)}</div>
          <div className="text-xs text-gray-500">Facturado</div>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-green-600">{fmtK(totalGanancia)}</div>
          <div className="text-xs text-gray-500">Ganancia</div>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-brand-600">{margen}%</div>
          <div className="text-xs text-gray-500">Margen</div>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white border rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Ventas Mensuales</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data.ventasMensuales}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
            <Line type="monotone" dataKey="totalVenta" name="Venta" stroke="#3b82f6" strokeWidth={2} dot />
            <Line type="monotone" dataKey="ganancia" name="Ganancia" stroke="#22c55e" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Per sucursal */}
        <div className="bg-white border rounded-xl p-4 overflow-hidden">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Por Sucursal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.porSucursal} layout="vertical">
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="sucursal" width={100} tick={{ fontSize: 10 }} tickFormatter={(v) => SUC_NAMES[v] || `Suc ${v}`} />
              <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
              <Bar dataKey="totalVenta" name="Venta" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Per lista */}
        <div className="bg-white border rounded-xl p-4 overflow-hidden">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Por Lista de Precios</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.porLista.map((l) => ({ ...l, listaName: LISTA_LABELS[l.lista] || `Lista ${l.lista}` }))} layout="vertical">
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="listaName" width={100} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
              <Bar dataKey="totalVenta" name="Venta" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Top clients */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-bold text-gray-700">Principales Compradores</h3>
        </div>
        <div className="divide-y">
          {data.topClientes.map((c, i) => (
            <Link key={c.clienteCod} href={`/admin/dashboard/cliente?cod=${c.clienteCod}`} target="_blank"
              className="px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 block">
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-400 font-mono w-5">{i + 1}</span>
                <span className="text-sm text-gray-900">{c.nombre || "Sin nombre"}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">{fmt(c.totalVenta)}</div>
                <div className="text-xs text-gray-400">{c.cantidad.toLocaleString("es-AR", { maximumFractionDigits: 1 })} {p.unidad === "KG" ? "kg" : "u"}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
