"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatPrice } from "@/lib/utils";

interface DescuentoItem { nombre: string; cantidad: number; costo: number }
interface Descuento {
  fecha: string; concepto: string; items: DescuentoItem[];
  compartidoCon: string[] | null; monto: number; cargadoPor: string; imageUrl: string | null;
}
interface Faltante { fecha: string; concepto: string; detalle: string; monto: number; cargadoPor: string }

export default function MisDescuentosClientPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    isEmpleado: boolean; empleado?: string; mes?: string; descuentos?: Descuento[]; faltantes?: Faltante[];
    totalDescuentos?: number; totalFaltantes?: number; totalGeneral?: number;
  } | null>(null);

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/client/descuentos")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [status]);

  if (status === "loading" || loading) return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-gray-400">Cargando...</div>;
  if (!session) return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-gray-400">Inicia sesion para ver tus descuentos.</div>;
  if (!data?.isEmpleado) return <div className="max-w-2xl mx-auto px-4 py-10 text-center text-gray-400">Tu cuenta no tiene descuentos asociados.</div>;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Mis Descuentos</h1>
      <p className="text-sm text-gray-500 mb-6">{data.empleado} — {data.mes}</p>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
          <div className="text-xs text-red-500">Descuentos</div>
          <div className="text-lg font-bold text-red-700">{formatPrice(data.totalDescuentos || 0)}</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-center">
          <div className="text-xs text-amber-500">Faltantes</div>
          <div className="text-lg font-bold text-amber-700">{formatPrice(data.totalFaltantes || 0)}</div>
        </div>
        <div className="bg-gray-100 border border-gray-300 rounded-xl p-3 text-center">
          <div className="text-xs text-gray-500">Total</div>
          <div className="text-lg font-bold text-gray-900">{formatPrice(data.totalGeneral || 0)}</div>
        </div>
      </div>

      {(data.descuentos || []).length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-700 mb-2">Descuentos</h2>
          <div className="space-y-3 mb-6">
            {(data.descuentos || []).map((d, i) => (
              <div key={i} className="bg-white border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{new Date(d.fecha).toLocaleDateString("es-AR")} — {d.cargadoPor}</span>
                  <span className="text-sm font-bold text-red-600">{formatPrice(d.monto)}</span>
                </div>
                <div className="text-xs text-gray-500 mb-1">{d.concepto}</div>
                <div className="space-y-0.5">
                  {d.items.map((item, j) => (
                    <div key={j} className="text-sm text-gray-800 flex justify-between">
                      <span>{item.nombre} x{item.cantidad % 1 === 0 ? Math.round(item.cantidad) : item.cantidad.toFixed(1)}</span>
                      <span className="text-gray-500">{formatPrice(item.costo * item.cantidad)}</span>
                    </div>
                  ))}
                </div>
                {d.compartidoCon && <div className="text-xs text-blue-500 mt-1">Compartido con: {d.compartidoCon.join(", ")}</div>}
                {d.imageUrl && (
                  <a href={d.imageUrl} target="_blank" rel="noopener noreferrer">
                    <img src={d.imageUrl} alt="Foto" className="mt-2 max-h-32 rounded-lg border" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {(data.faltantes || []).length > 0 && (
        <>
          <h2 className="text-sm font-bold text-gray-700 mb-2">Faltantes de caja</h2>
          <div className="space-y-3 mb-6">
            {(data.faltantes || []).map((f, i) => (
              <div key={i} className="bg-white border rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{new Date(f.fecha).toLocaleDateString("es-AR")} — {f.cargadoPor}</span>
                  <span className="text-sm font-bold text-amber-600">{formatPrice(f.monto)}</span>
                </div>
                <div className="text-sm text-gray-700">{f.detalle}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {(data.descuentos || []).length === 0 && (data.faltantes || []).length === 0 && (
        <p className="text-center text-gray-400 py-8">No hay descuentos este mes</p>
      )}
    </div>
  );
}
