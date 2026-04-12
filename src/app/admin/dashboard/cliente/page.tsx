"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { HiArrowLeft } from "react-icons/hi";
import Link from "next/link";

const fmt = (n: number) => formatPrice(n);
const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));

interface ClientData {
  cliente: { cod: string; nombre: string; calle: string; telefono: string; cuit: string; saldo: number; fechaAlta: string };
  comprasMensuales: Array<{ mes: string; cantCompras: number; totalVenta: number; ganancia: number }>;
  topProductos: Array<{ sku: string; nombre: string; cantidad: number; totalVenta: number }>;
  metodosPago: Array<{ nombre: string; total: number; cantidad: number }>;
  ultimasCompras: Array<{ boleta: string; fecha: string; total: number; cantItems: number }>;
}

function formatFecha(f: string): string {
  if (!f || f.length < 8) return f;
  return `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;
}

export default function ClienteDetailPage() {
  const searchParams = useSearchParams();
  const cod = searchParams.get("cod") || "";
  const [data, setData] = useState<ClientData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!cod) return;
    setLoading(true);
    fetch(`/api/admin/dashboard/cliente?cod=${cod}`)
      .then((r) => r.json())
      .then((d) => { if (!d.error) setData(d); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [cod]);

  if (!cod) return <div className="max-w-4xl mx-auto px-4 py-6 text-gray-400">Cliente no especificado</div>;
  if (loading) return <div className="max-w-4xl mx-auto px-4 py-6 text-gray-400">Cargando...</div>;
  if (!data) return <div className="max-w-4xl mx-auto px-4 py-6 text-gray-400">Error al cargar datos</div>;

  const c = data.cliente;
  const totalVenta = data.comprasMensuales.reduce((s, m) => s + m.totalVenta, 0);
  const totalGanancia = data.comprasMensuales.reduce((s, m) => s + m.ganancia, 0);
  const totalCompras = data.comprasMensuales.reduce((s, m) => s + m.cantCompras, 0);
  const ticketPromedio = totalCompras > 0 ? totalVenta / totalCompras : 0;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      <Link href="/admin/dashboard" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:text-brand-700 mb-4">
        <HiArrowLeft className="w-4 h-4" /> Volver al dashboard
      </Link>

      {/* Client info */}
      <div className="bg-white border rounded-xl p-4 mb-6">
        <h1 className="text-xl font-bold text-gray-900">{c.nombre}</h1>
        <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500">
          <span>Cod: {c.cod}</span>
          {c.telefono && <span>Tel: {c.telefono}</span>}
          {c.cuit && <span>CUIT: {c.cuit}</span>}
          {c.calle && <span>{c.calle}</span>}
          {c.fechaAlta && <span>Alta: {formatFecha(c.fechaAlta)}</span>}
        </div>
        <div className="mt-3 inline-block px-3 py-1.5 rounded-lg bg-brand-50 border border-brand-200">
          <span className="text-sm text-gray-600">Saldo: </span>
          <span className={`text-sm font-bold ${c.saldo > 0 ? "text-red-600" : "text-green-600"}`}>{fmt(c.saldo)}</span>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded-xl p-3 text-center">
          <div className="text-lg font-bold text-gray-900">{totalCompras}</div>
          <div className="text-xs text-gray-500">Compras</div>
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
          <div className="text-lg font-bold text-brand-600">{fmt(ticketPromedio)}</div>
          <div className="text-xs text-gray-500">Ticket Promedio</div>
        </div>
      </div>

      {/* Monthly chart */}
      <div className="bg-white border rounded-xl p-4 mb-6">
        <h3 className="text-sm font-bold text-gray-700 mb-3">Compras Mensuales</h3>
        <ResponsiveContainer width="100%" height={250}>
          <LineChart data={data.comprasMensuales}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtK} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
            <Line type="monotone" dataKey="totalVenta" name="Total" stroke="#3b82f6" strokeWidth={2} dot />
            <Line type="monotone" dataKey="ganancia" name="Ganancia" stroke="#22c55e" strokeWidth={2} dot />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Top products */}
        <div className="bg-white border rounded-xl p-4 overflow-hidden">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Productos Favoritos</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.topProductos.slice(0, 10)} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 9 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
              <Bar dataKey="totalVenta" fill="#f97316" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Payment methods */}
        <div className="bg-white border rounded-xl p-4 overflow-hidden">
          <h3 className="text-sm font-bold text-gray-700 mb-3">Metodos de Pago</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.metodosPago.slice(0, 8)} layout="vertical" margin={{ left: 10, right: 10 }}>
              <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
              <Bar dataKey="total" fill="#3b82f6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent purchases */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h3 className="text-sm font-bold text-gray-700">Ultimas Compras</h3>
        </div>
        <div className="divide-y">
          {data.ultimasCompras.map((c) => (
            <div key={c.boleta} className="px-4 py-2.5 flex items-center justify-between">
              <div>
                <span className="text-sm text-gray-900">#{c.boleta}</span>
                <span className="text-xs text-gray-400 ml-2">{formatFecha(c.fecha)}</span>
              </div>
              <div className="text-right">
                <div className="text-sm font-bold text-gray-900">{fmt(c.total)}</div>
                <div className="text-xs text-gray-400">{c.cantItems} items</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
