"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlineCog, HiOutlineEye, HiOutlineCheck, HiOutlineClock } from "react-icons/hi";
import { FaWhatsapp } from "react-icons/fa";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";
import ConfirmModal from "@/components/ConfirmModal";

interface Config {
  enabled: boolean;
  minSaldo: string;
  cooldownDays: string;
  maxPerRun: string;
  message: string;
}

interface Cliente {
  cod: string;
  nombre: string;
  telefono: string;
  saldo: number;
}

interface Preview {
  enabled: boolean;
  minSaldo: number;
  cooldownDays: number;
  maxPerRun: number;
  totalDeudores: number;
  yaRemindados: number;
  elegibles: number;
  clientes: Cliente[];
}

interface HistoryEntry {
  date: string;
  ok: number;
  failed: number;
}

const DEFAULT_MESSAGE = "Hola {nombre}, te recordamos que tenes un saldo pendiente de {saldo} en Distrialma. Podes abonar por transferencia o acercarte al local. Cualquier consulta estamos a disposicion. Gracias!";

export default function DeudaAutoPage() {
  const [config, setConfig] = useState<Config>({
    enabled: false,
    minSaldo: "50000",
    cooldownDays: "7",
    maxPerRun: "50",
    message: DEFAULT_MESSAGE,
  });
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [preview, setPreview] = useState<Preview | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; skipped: number } | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);

  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Load config from settings
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/settings");
        const all = await res.json();
        setConfig({
          enabled: all.deuda_reminder_enabled !== "false",
          minSaldo: all.deuda_reminder_min_saldo || "50000",
          cooldownDays: all.deuda_reminder_cooldown_days || "7",
          maxPerRun: all.deuda_reminder_max_per_run || "50",
          message: all.deuda_reminder_message || DEFAULT_MESSAGE,
        });
      } catch {}
      setLoadingConfig(false);
    }
    load();
  }, []);

  // Load history
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/admin/deuda-reminder?history=1");
        const data = await res.json();
        setHistory(data.history || []);
      } catch {}
      setLoadingHistory(false);
    }
    load();
  }, [sendResult]);

  async function saveConfig() {
    setSavingConfig(true);
    setConfigSaved(false);
    try {
      const pairs = [
        { key: "deuda_reminder_enabled", value: String(config.enabled) },
        { key: "deuda_reminder_min_saldo", value: config.minSaldo },
        { key: "deuda_reminder_cooldown_days", value: config.cooldownDays },
        { key: "deuda_reminder_max_per_run", value: config.maxPerRun },
        { key: "deuda_reminder_message", value: config.message },
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
    } catch {}
    setSavingConfig(false);
  }

  async function loadPreview() {
    setLoadingPreview(true);
    setPreview(null);
    try {
      const res = await fetch("/api/admin/deuda-reminder");
      const data = await res.json();
      setPreview(data);
    } catch {}
    setLoadingPreview(false);
  }

  async function doSend() {
    setSending(true);
    setSendResult(null);
    setConfirmSend(false);
    try {
      const res = await fetch("/api/admin/deuda-reminder", { method: "POST" });
      const data = await res.json();
      setSendResult(data);
      setPreview(null);
    } catch {}
    setSending(false);
  }

  // Preview message with sample data
  const samplePreview = config.message
    .replace(/\{nombre\}/g, "JUAN")
    .replace(/\{nombre_completo\}/g, "JUAN PEREZ")
    .replace(/\{saldo\}/g, formatPrice(parseFloat(config.minSaldo) || 50000));

  if (loadingConfig) return <LoadingCenter text="Cargando configuracion..." />;

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Recordatorios de Deuda Automaticos</h1>
        <p className="text-sm text-gray-500 mb-6">El sistema envia recordatorios automaticos por WhatsApp a clientes con saldo pendiente. Cron: lunes a viernes 10am y 3pm.</p>
      </Stagger>

      {/* Send result */}
      {sendResult && (
        <Stagger delay={30}>
          <div className={`rounded-xl p-4 mb-4 border-2 ${sendResult.failed === 0 ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"}`}>
            <div className="flex items-center gap-2 font-semibold">
              <HiOutlineCheck className={`w-5 h-5 ${sendResult.failed === 0 ? "text-green-600" : "text-amber-600"}`} />
              Enviados: {sendResult.sent} — Errores: {sendResult.failed} — Saltados: {sendResult.skipped}
            </div>
          </div>
        </Stagger>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Config */}
        <Stagger delay={50}>
          <div className="bg-white border rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <HiOutlineCog className="w-4 h-4 text-brand-500" />
              <h2 className="text-sm font-semibold text-gray-700">Configuracion</h2>
            </div>

            {/* Enabled toggle */}
            <div className="flex items-center justify-between mb-4 pb-4 border-b">
              <div>
                <div className="text-sm font-medium text-gray-900">Envio automatico</div>
                <div className="text-xs text-gray-500">Cron envia solo si esta activado</div>
              </div>
              <button
                onClick={() => setConfig((c) => ({ ...c, enabled: !c.enabled }))}
                className={`relative w-12 h-6 rounded-full transition-colors ${config.enabled ? "bg-green-500" : "bg-gray-300"}`}
              >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${config.enabled ? "translate-x-6" : "translate-x-0.5"}`} />
              </button>
            </div>

            {/* Min saldo */}
            <div className="mb-3">
              <label className="text-xs text-gray-600 font-medium">Saldo minimo</label>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  value={config.minSaldo}
                  onChange={(e) => setConfig((c) => ({ ...c, minSaldo: e.target.value }))}
                  className="flex-1 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500"
                />
              </div>
            </div>

            {/* Cooldown */}
            <div className="mb-3">
              <label className="text-xs text-gray-600 font-medium">Dias de cooldown</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={config.cooldownDays}
                  onChange={(e) => setConfig((c) => ({ ...c, cooldownDays: e.target.value }))}
                  className="w-20 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500"
                />
                <span className="text-xs text-gray-500">dias entre recordatorios al mismo cliente</span>
              </div>
            </div>

            {/* Max per run */}
            <div className="mb-4">
              <label className="text-xs text-gray-600 font-medium">Maximo por tanda</label>
              <div className="flex items-center gap-2 mt-1">
                <input
                  type="number"
                  value={config.maxPerRun}
                  onChange={(e) => setConfig((c) => ({ ...c, maxPerRun: e.target.value }))}
                  className="w-20 px-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500"
                />
                <span className="text-xs text-gray-500">clientes por ejecucion</span>
              </div>
            </div>

            <button
              onClick={saveConfig}
              disabled={savingConfig}
              className={`w-full py-2 bg-brand-400 text-white rounded-xl text-sm font-medium hover:bg-brand-500 disabled:opacity-50 ${springBtn}`}
            >
              {savingConfig ? "Guardando..." : configSaved ? "Guardado!" : "Guardar configuracion"}
            </button>
          </div>
        </Stagger>

        {/* Message template */}
        <Stagger delay={100}>
          <div className="bg-white border rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <FaWhatsapp className="w-4 h-4 text-green-500" />
              <h2 className="text-sm font-semibold text-gray-700">Plantilla del mensaje</h2>
            </div>
            <textarea
              value={config.message}
              onChange={(e) => setConfig((c) => ({ ...c, message: e.target.value }))}
              rows={5}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-brand-500 mb-2"
            />
            <p className="text-xs text-gray-400 mb-3">Variables: {"{nombre}"} = primer nombre, {"{nombre_completo}"} = nombre completo, {"{saldo}"} = saldo formateado</p>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <div className="text-xs font-medium text-green-700 mb-1">Vista previa:</div>
              <div className="text-xs text-gray-800 whitespace-pre-wrap">{samplePreview}</div>
            </div>
          </div>
        </Stagger>
      </div>

      {/* Preview & send */}
      <Stagger delay={150}>
        <div className="bg-white border rounded-xl shadow-sm p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <HiOutlineEye className="w-4 h-4 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-700">Vista previa y envio manual</h2>
            </div>
            <button
              onClick={loadPreview}
              disabled={loadingPreview}
              className={`px-4 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-xl text-sm font-medium hover:bg-blue-100 disabled:opacity-50 ${springBtn}`}
            >
              {loadingPreview ? "Cargando..." : "Cargar vista previa"}
            </button>
          </div>

          {preview && (
            <div>
              {/* Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-gray-900">{preview.totalDeudores}</div>
                  <div className="text-xs text-gray-500">Con deuda &gt; {formatPrice(preview.minSaldo)}</div>
                </div>
                <div className="bg-purple-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-purple-700">{preview.yaRemindados}</div>
                  <div className="text-xs text-purple-600">Ya recordados ({preview.cooldownDays}d)</div>
                </div>
                <div className="bg-green-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-green-700">{preview.elegibles}</div>
                  <div className="text-xs text-green-600">Elegibles para enviar</div>
                </div>
                <div className="bg-amber-50 rounded-xl p-3 text-center">
                  <div className="text-xl font-bold text-amber-700">{preview.maxPerRun}</div>
                  <div className="text-xs text-amber-600">Max por tanda</div>
                </div>
              </div>

              {/* Client list */}
              {preview.clientes.length > 0 ? (
                <div className="border rounded-xl overflow-hidden mb-4">
                  <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500">
                    {preview.clientes.length} clientes recibirian el recordatorio
                  </div>
                  <div className="divide-y max-h-72 overflow-y-auto">
                    {preview.clientes.map((c, i) => (
                      <div key={c.cod} className={`flex items-center justify-between px-4 py-2 ${hoverRow}`} style={staggerStyle(true, i, 0, 15)}>
                        <div className="min-w-0">
                          <span className="text-sm font-medium text-gray-900">{c.nombre}</span>
                          <span className="text-xs text-gray-400 ml-2">#{c.cod}</span>
                          {c.telefono && <span className="text-xs text-gray-400 ml-2">{c.telefono}</span>}
                        </div>
                        <span className="text-sm font-bold text-red-600 shrink-0">{formatPrice(c.saldo)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-6 text-gray-400 text-sm">No hay clientes elegibles para recordar.</div>
              )}

              {/* Send button */}
              {preview.clientes.length > 0 && (
                <button
                  onClick={() => setConfirmSend(true)}
                  disabled={sending || !config.enabled}
                  className={`w-full py-3 bg-green-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${springBtn}`}
                >
                  <FaWhatsapp className="w-5 h-5" />
                  {!config.enabled ? "Activar primero en configuracion" : sending ? "Enviando..." : `Enviar ahora a ${preview.clientes.length} clientes`}
                </button>
              )}
            </div>
          )}

          {!preview && !loadingPreview && (
            <div className="text-center py-6 text-gray-400 text-sm">Carga la vista previa para ver quienes recibirian el recordatorio.</div>
          )}
        </div>
      </Stagger>

      {/* History */}
      <Stagger delay={200}>
        <div className="bg-white border rounded-xl shadow-sm p-4">
          <div className="flex items-center gap-2 mb-4">
            <HiOutlineClock className="w-4 h-4 text-gray-500" />
            <h2 className="text-sm font-semibold text-gray-700">Historial de envios automaticos</h2>
          </div>
          {loadingHistory ? (
            <div className="text-center py-4 text-gray-400 text-sm">Cargando...</div>
          ) : history.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">No hay envios registrados.</div>
          ) : (
            <div className="divide-y">
              {history.slice(0, 30).map((h, i) => (
                <div key={h.date} className={`flex items-center justify-between px-2 py-2.5 ${hoverRow}`} style={staggerStyle(true, i, 0, 15)}>
                  <span className="text-sm text-gray-700 font-medium">{new Date(h.date + "T12:00:00").toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full font-medium">{h.ok} enviados</span>
                    {h.failed > 0 && (
                      <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full font-medium">{h.failed} errores</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Stagger>

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmSend}
        message={`Se enviara el recordatorio a ${preview?.clientes.length || 0} clientes con saldo pendiente. Cada mensaje tiene 3 segundos de pausa. Esta accion no se puede deshacer.`}
        onConfirm={doSend}
        onCancel={() => setConfirmSend(false)}
        loading={sending}
      />
    </PageTransition>
  );
}
