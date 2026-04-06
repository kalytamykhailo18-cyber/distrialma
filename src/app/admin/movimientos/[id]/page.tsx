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
}

interface Movement {
  id: number;
  destino: string;
  subtipo: string | null;
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
            {movement.destino}
          </p>
        </div>
        <span
          className={`ml-auto text-xs px-3 py-1 rounded-full font-medium ${
            isPendiente
              ? "bg-amber-100 text-amber-700"
              : "bg-green-100 text-green-700"
          }`}
        >
          {isPendiente ? "Pendiente aprobación" : "Aprobado"}
        </span>
      </div>

      {/* Info card */}
      <div className="bg-white border rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">Destino:</span>
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
              <span className="text-gray-500">Aprobado por:</span>
              <span className="ml-2 font-medium text-green-600">
                {movement.aprobadoPor}
              </span>
              {movement.aprobadoAt && (
                <span className="text-xs text-gray-400 ml-1">
                  ({formatDate(movement.aprobadoAt)})
                </span>
              )}
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
                <p className="text-xs text-gray-400">SKU: {item.sku}</p>
              </div>
              <div className="text-sm font-semibold text-gray-900">
                {item.cantidad}
              </div>
            </div>
          ))}
        </div>
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
              if (!confirm("¿Rechazar este movimiento?")) return;
              fetch("/api/admin/movimientos", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: movement.id }),
              }).then((r) => {
                if (r.ok) router.push("/admin/movimientos");
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
