"use client";

import { useState, useEffect } from "react";

interface ClientDay {
  cod: string;
  nombre: string;
  cuit: string;
  zonaOriginal: string;
  days: string[];
}

const DAYS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

export default function DiasEntregaPage() {
  const [clients, setClients] = useState<ClientDay[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  async function loadClients() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/delivery-days?search=${encodeURIComponent(search)}`);
      const data = await res.json();
      setClients(data.clients || []);
    } catch {
      setClients([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadClients();
  }, []);

  function handleSearch() {
    loadClients();
  }

  async function toggleDay(clientId: string, day: string) {
    const client = clients.find((c) => c.cod === clientId);
    if (!client) return;

    const currentDays = client.days;
    const newDays = currentDays.includes(day)
      ? currentDays.filter((d) => d !== day)
      : [...currentDays, day];

    setSaving(clientId);
    try {
      const res = await fetch("/api/admin/delivery-days", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId, days: newDays }),
      });
      const data = await res.json();
      setClients((prev) =>
        prev.map((c) => (c.cod === clientId ? { ...c, days: data.days } : c))
      );
    } catch { /* */ }
    finally {
      setSaving(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Días de Entrega</h1>

      <p className="text-sm text-gray-500 mb-4">
        Asigná uno o más días de entrega por cliente. Reemplaza la zona de PunTouch.
      </p>

      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
          placeholder="Buscar por nombre o CUIT..."
          className="flex-1 px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        />
        <button
          onClick={handleSearch}
          disabled={loading}
          className="px-4 py-2 bg-brand-400 text-white rounded-lg text-sm font-medium hover:bg-brand-500 disabled:opacity-50"
        >
          Buscar
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">Cargando...</p>
      ) : clients.length === 0 ? (
        <p className="text-gray-400">No se encontraron clientes. Buscá por nombre o CUIT.</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-3 py-2 font-medium text-gray-600">Cliente</th>
                <th className="text-left px-3 py-2 font-medium text-gray-600 text-xs">Zona PunTouch</th>
                {DAYS.map((d) => (
                  <th key={d} className="text-center px-1 py-2 font-medium text-gray-600 text-xs">
                    {d.slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((client) => (
                <tr key={client.cod} className="hover:bg-gray-50">
                  <td className="px-3 py-2">
                    <div className="font-medium text-gray-900">{client.nombre}</div>
                    <div className="text-xs text-gray-400">{client.cuit || client.cod}</div>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">{client.zonaOriginal || "—"}</td>
                  {DAYS.map((day) => (
                    <td key={day} className="text-center px-1 py-2">
                      <button
                        onClick={() => toggleDay(client.cod, day)}
                        disabled={saving === client.cod}
                        className={`w-7 h-7 rounded-md text-xs font-bold transition-colors ${
                          client.days.includes(day)
                            ? "bg-brand-400 text-white"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                        } disabled:opacity-50`}
                      >
                        {client.days.includes(day) ? "✓" : ""}
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
