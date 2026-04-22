"use client";

import { HiOutlineShoppingCart } from "react-icons/hi";
import { formatPrice } from "@/lib/utils";
import { Pendiente } from "../types";

interface Props {
  pendientes: Pendiente[];
  loadingPendientes: boolean;
  onRefresh: () => void;
  onSelect: (p: Pendiente) => void;
}

export default function PosPendientes({ pendientes, loadingPendientes, onRefresh, onSelect }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-3">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-bold text-gray-900">Pendientes ({pendientes.length})</h2>
        <button onClick={onRefresh} disabled={loadingPendientes}
          className={`text-sm text-brand-600 hover:text-brand-700 ${loadingPendientes ? "animate-pulse" : ""}`}>
          {loadingPendientes ? "Cargando..." : "Actualizar"}
        </button>
      </div>
      {pendientes.length === 0 ? (
        <div className="text-center text-gray-400 py-12">
          <HiOutlineShoppingCart className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No hay pedidos pendientes</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pendientes.map((p, i) => (
            <button key={p.boleta} onClick={() => onSelect(p)}
              className="w-full text-left bg-white border rounded-xl p-3 hover:shadow-md transition-all duration-200"
              style={{ opacity: 0, animation: `cardIn 300ms ease ${i * 40}ms forwards` }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400 font-mono">#{p.nroped || p.boleta}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${p.origen === "POS" ? "bg-cyan-100 text-cyan-700" : p.origen === "Web" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                  {p.origen}
                </span>
              </div>
              <div className="font-medium text-gray-900 text-sm">{p.clienteNombre || "Sin cliente"}</div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-gray-500">{p.empleadoNombre} · {p.fecha} {p.hora}</span>
                <span className="font-bold text-brand-600">{formatPrice(p.total)}</span>
              </div>
              <div className="text-xs text-gray-400 mt-1">{p.items.length} items · {p.cant} unidades</div>
              {p.notas && p.notas.startsWith("PeYa:") && (
                <div className="text-xs font-medium text-amber-600 mt-1">{p.notas}</div>
              )}
            </button>
          ))}
        </div>
      )}

      <style jsx>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
