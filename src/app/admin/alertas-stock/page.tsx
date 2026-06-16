"use client";

import { useEffect, useState } from "react";
import { HiOutlineCog, HiOutlineExclamation } from "react-icons/hi";
import { FaWhatsapp } from "react-icons/fa";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";
import ConfirmModal from "@/components/ConfirmModal";

interface StockAlert {
  sku: string;
  nombre: string;
  stock: number;
  ventaDiaria: number;
  diasRestantes: number;
  unidad: string;
}

interface Data {
  enabled: boolean;
  coverageDays: number;
  phone: string;
  total: number;
  alerts: StockAlert[];
}

export default function AlertasStockPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  // Config state
  const [enabled, setEnabled] = useState(false);
  const [days, setDays] = useState("3");
  const [phone, setPhone] = useState("");
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  // Search/sort
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"dias" | "stock" | "venta">("dias");

  async function loadData() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/stock-alert");
      const d = await res.json();
      setData(d);
      setEnabled(d.enabled);
      setDays(String(d.coverageDays));
      setPhone(d.phone);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function saveConfig() {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      const pairs = [
        { key: "stock_alert_enabled", value: String(enabled) },
        { key: "stock_alert_days", value: days },
        { key: "stock_alert_phone", value: phone },
      ];
      for (const { key, value } of pairs) {
        await fetch("/api/admin/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key, value }),
        });
      }
      setConfigSaved(true);
      setTimeout(() => setConfigSaved(false), 3000);
      loadData(); // Refresh with new settings
    } catch {}
    setSavingConfig(false);
  }

  async function doSend() {
    setSending(true);
    setSendResult(null);
    setConfirmSend(false);
    try {
      const res = await fetch("/api/admin/stock-alert", { method: "POST" });
      const d = await res.json();
      if (d.sent) setSendResult(`Alerta enviada: ${d.total} productos`);
      else setSendResult(d.reason || d.error || "No se envio");
    } catch { setSendResult("Error de conexion"); }
    setSending(false);
  }

  const alerts = data?.alerts || [];
  const filtered = alerts.filter((a) => {
    if (!search.trim()) return true;
    const t = search.toLowerCase();
    return a.nombre.toLowerCase().includes(t) || a.sku.includes(t);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "dias") return a.diasRestantes - b.diasRestantes;
    if (sortBy === "stock") return a.stock - b.stock;
    return b.ventaDiaria - a.ventaDiaria;
  });

  function statusColor(dias: number): string {
    if (dias <= 1) return "bg-red-100 text-red-700";
    if (dias <= 2) return "bg-amber-100 text-amber-700";
    return "bg-yellow-50 text-yellow-700";
  }

  function statusDot(dias: number): string {
    if (dias <= 1) return "bg-red-500";
    if (dias <= 2) return "bg-amber-500";
    return "bg-yellow-400";
  }

  if (loading) return <LoadingCenter text="Calculando alertas de stock..." />;

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Alertas de Stock Bajo</h1>
        <p className="text-sm text-gray-500 mb-6">Productos con stock para menos de {data?.coverageDays || 3} dias segun ventas de las ultimas 2 semanas.</p>
      </Stagger>

      {sendResult && (
        <Stagger delay={30}>
          <div className="rounded-xl p-3 mb-4 border bg-green-50 border-green-300 text-sm text-green-700 font-medium">
            {sendResult}
          </div>
        </Stagger>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Config */}
        <Stagger delay={50}>
          <div className="bg-white border rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <HiOutlineCog className="w-4 h-4 text-brand-500" />
              <h2 className="text-sm font-semibold text-gray-700">Configuracion</h2>
            </div>

            <div className="flex items-center justify-between mb-3 pb-3 border-b">
              <div className="text-sm font-medium text-gray-900">Alerta automatica</div>
              <button
                onClick={() => setEnabled(!enabled)}
                className={`relative w-12 h-6 rounded-full transition-colors ${enabled ? "bg-green-500" : "bg-gray-300"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${enabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            <div className="mb-3">
              <label className="text-xs text-gray-600 font-medium">Dias de cobertura</label>
              <div className="flex items-center gap-2 mt-1">
                <input type="number" value={days} onChange={(e) => setDays(e.target.value)}
                  className="w-20 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                <span className="text-xs text-gray-500">dias</span>
              </div>
            </div>

            <div className="mb-4">
              <label className="text-xs text-gray-600 font-medium">Telefono(s) destinatario(s)</label>
              <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="5491122254949, 5491134207773"
                className="w-full mt-1 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              <p className="text-xs text-gray-400 mt-1">Separá con coma para enviar a varios números.</p>
            </div>

            <button onClick={saveConfig} disabled={savingConfig}
              className={`w-full py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50 ${springBtn}`}>
              {savingConfig ? "Guardando..." : configSaved ? "Guardado!" : "Guardar"}
            </button>
          </div>
        </Stagger>

        {/* Stats */}
        <Stagger delay={100}>
          <div className="bg-white border rounded-xl shadow-sm p-4 lg:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <HiOutlineExclamation className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-gray-700">Resumen</h2>
            </div>
            <div className="grid grid-cols-3 gap-3 mb-4">
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-red-600">{alerts.filter((a) => a.diasRestantes <= 1).length}</div>
                <div className="text-xs text-red-600">Critico (&lt;1 dia)</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-amber-600">{alerts.filter((a) => a.diasRestantes > 1 && a.diasRestantes <= 2).length}</div>
                <div className="text-xs text-amber-600">Urgente (1-2 dias)</div>
              </div>
              <div className="bg-yellow-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-yellow-600">{alerts.filter((a) => a.diasRestantes > 2).length}</div>
                <div className="text-xs text-yellow-600">Bajo (2-{data?.coverageDays} dias)</div>
              </div>
            </div>
            <button
              onClick={() => setConfirmSend(true)}
              disabled={sending || alerts.length === 0}
              className={`w-full py-3 bg-green-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${springBtn}`}>
              <FaWhatsapp className="w-5 h-5" />
              {sending ? "Enviando..." : `Enviar alerta ahora (${alerts.length} productos)`}
            </button>
          </div>
        </Stagger>
      </div>

      {/* Filters */}
      <Stagger delay={150}>
        <div className="flex flex-wrap gap-2 mb-4">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="flex-1 min-w-[200px] px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
          <div className="flex gap-1">
            {([["dias", "Dias restantes"], ["stock", "Stock"], ["venta", "Venta diaria"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setSortBy(key)}
                className={`px-3 py-2 text-xs rounded-xl border ${springBtn} ${sortBy === key ? "bg-brand-500 text-white border-brand-500" : "bg-white text-gray-600 border-gray-200"}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </Stagger>

      {/* Alert list */}
      {sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No hay productos con stock bajo.</div>
      ) : (
        <Stagger delay={200}>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500">
              {sorted.length} productos con stock bajo
            </div>
            <div className="divide-y">
              {sorted.map((a, i) => (
                <div key={a.sku} className={`flex items-center gap-3 px-4 py-3 ${hoverRow}`} style={staggerStyle(true, i, 0, 15)}>
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusDot(a.diasRestantes)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-gray-900 truncate">{a.nombre}</span>
                      <span className="text-xs text-gray-400">#{a.sku}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Stock: {a.stock} {a.unidad} — Venta: {a.ventaDiaria}/{a.unidad.toLowerCase() === "kg" ? "kg" : "un"} por dia
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full shrink-0 ${statusColor(a.diasRestantes)}`}>
                    {a.diasRestantes} dias
                  </span>
                </div>
              ))}
            </div>
          </div>
        </Stagger>
      )}

      <ConfirmModal
        open={confirmSend}
        message={`Se enviara un resumen de ${alerts.length} productos con stock bajo por WhatsApp.`}
        onConfirm={doSend}
        onCancel={() => setConfirmSend(false)}
        loading={sending}
      />
    </PageTransition>
  );
}
