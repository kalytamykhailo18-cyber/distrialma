"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { HiOutlineArrowLeft, HiOutlineCheck, HiOutlineX } from "react-icons/hi";

interface MovementItem {
  id: number;
  sku: string;
  productName: string;
  cantidad: number;
  costo: number;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

interface Movement {
  id: number;
  sucursal: string;
  destino: string;
  subtipo: string | null;
  empleados: Array<{ cod: string; nombre: string }> | null;
  usuario: string;
  estado: string;
  notas: string | null;
  aprobadoPor: string | null;
  aprobadoAt: string | null;
  createdAt: string;
  items: MovementItem[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function MovimientoDetail() {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string })?.role === "admin";
  const [movement, setMovement] = useState<Movement | null>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/movimientos?estado=all&limit=500`)
      .then((r) => r.json())
      .then((data) => {
        const found = data.movements?.find(
          (m: Movement) => m.id === parseInt(params.id as string)
        );
        setMovement(found || null);
      })
      .catch(() => setMovement(null))
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleApprove() {
    if (!movement) return;
    if (
      !confirm(
        `¿Aprobar este movimiento?\n\nSe descontará stock de ${movement.items.length} producto(s) del inventario principal.`
      )
    )
      return;

    setApproving(true);
    try {
      const res = await fetch("/api/admin/movimientos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: movement.id }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Error al aprobar");
        return;
      }

      // Reload
      setMovement({
        ...movement,
        estado: "aprobado",
        aprobadoPor: (session?.user as { name?: string })?.name || "admin",
        aprobadoAt: new Date().toISOString(),
      });
    } catch {
      alert("Error de conexión");
    } finally {
      setApproving(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-gray-400">Cargando...</p>
      </div>
    );
  }

  if (!movement) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6 text-center">
        <p className="text-gray-500 mb-4">Movimiento no encontrado</p>
        <Link href="/admin/movimientos" className="text-brand-500 hover:underline">
          Volver a movimientos
        </Link>
      </div>
    );
  }

  const isPendiente = movement.estado === "pendiente";

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin/movimientos")}
          className="p-2 hover:bg-gray-100 rounded-lg"
        >
          <HiOutlineArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Movimiento #{movement.id}
          </h1>
          <p className="text-sm text-gray-500">
            {movement.sucursal} → {movement.destino}
          </p>
        </div>
        <span
          className={`ml-auto text-xs px-3 py-1 rounded-full font-medium ${
            movement.estado === "pendiente"
              ? "bg-amber-100 text-amber-700"
              : movement.estado === "rechazado"
              ? "bg-red-100 text-red-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {movement.estado === "pendiente" ? "Pendiente aprobación" : movement.estado === "rechazado" ? "Rechazado" : "Aprobado"}
        </span>
      </div>

      {/* Info card */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Sucursal:</span>
            <span className="ml-2 font-medium">{movement.sucursal}</span>
          </div>
          <div>
            <span className="text-gray-500">Motivo:</span>
            <span className="ml-2 font-medium">{movement.destino}</span>
          </div>
          <div>
            <span className="text-gray-500">Creado por:</span>
            <span className="ml-2 font-medium">{movement.usuario}</span>
          </div>
          <div>
            <span className="text-gray-500">Fecha:</span>
            <span className="ml-2">{formatDate(movement.createdAt)}</span>
          </div>
          {movement.aprobadoPor && (
            <div>
              <span className="text-gray-500">{movement.estado === "rechazado" ? "Rechazado por:" : "Aprobado por:"}</span>
              <span className={`ml-2 font-medium ${movement.estado === "rechazado" ? "text-red-600" : "text-green-600"}`}>
                {movement.aprobadoPor}
              </span>
              {movement.aprobadoAt && (
                <span className="text-xs text-gray-400 ml-1">
                  ({formatDate(movement.aprobadoAt)})
                </span>
              )}
            </div>
          )}
          {movement.empleados && movement.empleados.length > 0 && (
            <div className="col-span-2">
              <span className="text-gray-500">Empleado(s) responsable(s):</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {movement.empleados.map((e) => (
                  <span key={e.cod} className="text-xs px-2 py-1 rounded-full bg-red-50 text-red-700 font-medium">
                    {e.nombre}
                  </span>
                ))}
              </div>
            </div>
          )}
          {movement.notas && (
            <div className="col-span-2">
              <span className="text-gray-500">Notas:</span>
              <span className="ml-2">{movement.notas}</span>
            </div>
          )}
        </div>
      </div>

      {/* Products table */}
      <div className="bg-white border rounded-xl overflow-hidden mb-4">
        <div className="px-4 py-3 border-b bg-gray-50">
          <h3 className="text-sm font-medium text-gray-700">
            Productos ({movement.items.length})
          </h3>
        </div>
        <div className="divide-y">
          {movement.items.map((item) => (
            <div key={item.id} className="px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {item.productName}
                </p>
                <p className="text-xs text-gray-400">
                  SKU: {item.sku}
                  {item.costo > 0 && <span className="ml-2">Costo: {formatPrice(item.costo)}</span>}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-gray-900">x{item.cantidad}</p>
                {item.costo > 0 && (
                  <p className="text-xs text-gray-500">{formatPrice(item.costo * item.cantidad)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
        {movement.items.some((i) => i.costo > 0) && (
          <div className="px-4 py-3 border-t bg-gray-50 flex justify-between">
            <span className="text-sm font-medium text-gray-700">Total valorizado</span>
            <span className="text-sm font-bold text-gray-900">
              {formatPrice(movement.items.reduce((sum, i) => sum + (i.costo || 0) * i.cantidad, 0))}
            </span>
          </div>
        )}
      </div>

      {/* Approval button (admin only, pending only) */}
      {isAdmin && isPendiente && (
        <div className="flex gap-3">
          <button
            onClick={handleApprove}
            disabled={approving}
            className="flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium text-white bg-green-600 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <HiOutlineCheck className="w-5 h-5" />
            {approving ? "Aprobando..." : "Aprobar (descuenta stock)"}
          </button>
          <button
            onClick={() => {
              if (!confirm("¿Rechazar este movimiento? Queda registrado como rechazado.")) return;
              fetch("/api/admin/movimientos", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: movement.id, action: "rechazar" }),
              }).then((r) => {
                if (r.ok) {
                  setMovement({ ...movement, estado: "rechazado", aprobadoPor: (session?.user as { name?: string })?.name || "admin", aprobadoAt: new Date().toISOString() });
                }
              });
            }}
            className="flex items-center justify-center gap-2 px-6 py-3 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
            Rechazar
          </button>
        </div>
      )}

      {!isAdmin && isPendiente && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
          <p className="text-sm text-amber-700">
            Este movimiento está pendiente de aprobación por un administrador.
          </p>
        </div>
      )}
    </div>
  );
}
