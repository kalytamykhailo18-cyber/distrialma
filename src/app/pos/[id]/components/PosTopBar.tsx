"use client";

import { HiOutlineUser, HiOutlineUserGroup } from "react-icons/hi";
import { Terminal, Empleado, Cliente, LISTA_LABELS } from "../types";

interface Props {
  terminal: Terminal;
  activeLista: number;
  empleados: Empleado[];
  selectedEmpleado: Empleado | null;
  setSelectedEmpleado: (e: Empleado | null) => void;
  selectedCliente: Cliente | null;
  setSelectedCliente: (c: Cliente | null) => void;
  clientSearch: string;
  setClientSearch: (s: string) => void;
  clientResults: Cliente[];
  showClientSearch: boolean;
  setShowClientSearch: (b: boolean) => void;
  pendientesCount: number;
  showPendientesList: boolean;
  onTogglePendientes: () => void;
}

export default function PosTopBar({
  terminal, activeLista, empleados, selectedEmpleado, setSelectedEmpleado,
  selectedCliente, setSelectedCliente, clientSearch, setClientSearch,
  clientResults, showClientSearch, setShowClientSearch,
  pendientesCount, showPendientesList, onTogglePendientes,
}: Props) {
  return (
    <div className="bg-white border-b px-3 md:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 shadow-sm">
      <div className="flex items-center gap-2 md:gap-4">
        <span className="font-bold text-gray-900 text-sm md:text-lg">{terminal.nombre}</span>
        <span className="text-xs text-gray-400 hidden sm:inline">{terminal.sucursalNombre}</span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 font-medium">
          {LISTA_LABELS[activeLista] || `Lista ${activeLista}`}
        </span>
        {terminal.esCajero && (
          <button onClick={onTogglePendientes}
            className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${showPendientesList ? "bg-cyan-500 text-white" : "bg-cyan-100 text-cyan-700 hover:bg-cyan-200"}`}>
            Pendientes {pendientesCount > 0 && `(${pendientesCount})`}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 md:gap-3">
        <div className="flex items-center gap-1 md:gap-2">
          <HiOutlineUser className="w-4 h-4 text-gray-400 hidden md:block" />
          <select value={selectedEmpleado?.cod || ""}
            onChange={(e) => { const emp = empleados.find((x) => x.cod === e.target.value); setSelectedEmpleado(emp || null); }}
            className="text-xs md:text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-brand-500 max-w-[140px] md:max-w-none">
            <option value="">Vendedor...</option>
            {empleados.map((e) => <option key={e.cod} value={e.cod}>{e.nombre}</option>)}
          </select>
        </div>
        {terminal.requiereCliente && (
          <div className="relative">
            <div className="flex items-center gap-2">
              <HiOutlineUserGroup className="w-4 h-4 text-gray-400 hidden md:block" />
              {selectedCliente ? (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-700">{selectedCliente.nombre}</span>
                  <button onClick={() => { setSelectedCliente(null); setShowClientSearch(true); }} className="text-xs text-red-500 hover:text-red-700">x</button>
                </div>
              ) : (
                <input type="text" placeholder="Buscar cliente..." value={clientSearch}
                  onChange={(e) => { setClientSearch(e.target.value); setShowClientSearch(true); }}
                  onFocus={() => setShowClientSearch(true)}
                  className="text-sm border border-gray-300 rounded-lg px-2 py-1.5 w-48 focus:outline-none focus:border-brand-500" />
              )}
            </div>
            {showClientSearch && clientResults.length > 0 && !selectedCliente && (
              <div className="absolute right-0 top-full mt-1 bg-white border rounded-lg shadow-lg z-50 w-72 max-h-60 overflow-y-auto">
                {clientResults.map((c) => (
                  <button key={c.cod} onClick={() => { setSelectedCliente(c); setClientSearch(""); setShowClientSearch(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-b-0">
                    <div className="text-sm font-medium text-gray-800">{c.nombre}</div>
                    <div className="text-xs text-gray-400">{c.cuit && `CUIT: ${c.cuit}`} {c.zona && `· ${c.zona}`}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
