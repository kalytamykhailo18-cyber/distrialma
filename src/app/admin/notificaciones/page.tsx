"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePaperAirplane, HiOutlineSearch, HiOutlineCheck, HiOutlineX, HiOutlineCurrencyDollar, HiOutlineExclamation } from "react-icons/hi";
import { FaWhatsapp } from "react-icons/fa";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";

interface Deudor {
  cod: string;
  nombre: string;
  saldo: number;
  telefono: string;
  direccion: string;
}

const TEMPLATES = [
  {
    label: "Recordatorio amable",
    body: "Hola {nombre}, soy de Distrialma. Te recordamos que tenes un saldo pendiente de {saldo}. Cuando puedas, pasá a regularizarlo o mandanos comprobante de transferencia. Gracias!",
  },
  {
    label: "Recordatorio firme",
    body: "Hola {nombre}, desde Distrialma. Tu cuenta registra un saldo pendiente de {saldo}. Por favor regularizalo lo antes posible. Si ya pagaste, envianos el comprobante. Gracias.",
  },
  {
    label: "Cortas",
    body: "Hola {nombre}, te recordamos que tenes {saldo} pendiente. Saludos, Distrialma.",
  },
];

const PAGE_SIZE = 50;

export default function NotificacionesPage() {
  const [deudores, setDeudores] = useState<Deudor[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [minMonto, setMinMonto] = useState("1000");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(TEMPLATES[0].body);
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number; results: Array<{ cod: string; ok: boolean; error?: string }> } | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [page, setPage] = useState(0);
  const [lastContact, setLastContact] = useState<Record<string, { fecha: string; tipo: string; enviadoPor: string | null }>>({});
  const [sinContactoDias, setSinContactoDias] = useState("15");

  async function loadLastContact() {
    try {
      const res = await fetch("/api/admin/notificaciones/log?tipo=deuda");
      const d = await res.json();
      setLastContact(d.lastContact || {});
    } catch {}
  }
  useEffect(() => { loadLastContact(); }, []);

  useEffect(() => { setPage(0); }, [search, minMonto, sinContactoDias]);

  function daysAgo(iso: string): number {
    return Math.floor((Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24));
  }

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/notificaciones/deudas?min=${minMonto || 0}`);
      const d = await res.json();
      setDeudores(d.deudores || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { load(); }, [minMonto]); // eslint-disable-line

  const minSinContacto = parseInt(sinContactoDias) || 0;
  const filtered = deudores.filter((d) => {
    if (search.trim()) {
      const t = search.toLowerCase();
      if (!(d.nombre.toLowerCase().includes(t) || d.cod.includes(t))) return false;
    }
    if (minSinContacto > 0 && lastContact[d.cod]) {
      const ago = daysAgo(lastContact[d.cod].fecha);
      if (ago < minSinContacto) return false;
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  function toggleSelect(cod: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod); else next.add(cod);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((d) => d.cod)));
    }
  }

  function selectPage() {
    setSelected((prev) => {
      const next = new Set(prev);
      const allOnPageSelected = paged.every((d) => next.has(d.cod));
      if (allOnPageSelected) {
        paged.forEach((d) => next.delete(d.cod));
      } else {
        paged.forEach((d) => next.add(d.cod));
      }
      return next;
    });
  }

  async function doSend() {
    setSending(true);
    setSendResult(null);
    const recipients = deudores.filter((d) => selected.has(d.cod));
    try {
      const res = await fetch("/api/admin/notificaciones/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipients, message, tipo: "deuda" }),
      });
      const d = await res.json();
      setSendResult(d);
      setSelected(new Set());
      setConfirmSend(false);
      loadLastContact();
    } catch {}
    setSending(false);
  }

  const selectedSaldo = deudores.filter((d) => selected.has(d.cod)).reduce((s, d) => s + d.saldo, 0);

  // Preview
  const previewRecipient = filtered.find((d) => selected.has(d.cod)) || filtered[0];
  const preview = previewRecipient ? message
    .replace(/\{nombre\}/g, previewRecipient.nombre)
    .replace(/\{saldo\}/g, formatPrice(previewRecipient.saldo)) : message;

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Notificaciones de Deuda</h1>
        <p className="text-sm text-gray-500 mb-4">Envia recordatorios por WhatsApp a clientes con saldo pendiente.</p>
      </Stagger>

      {sendResult && (
        <Stagger delay={30}>
          <div className={`rounded-xl p-4 mb-4 border-2 ${sendResult.failed === 0 ? "bg-green-50 border-green-300" : "bg-amber-50 border-amber-300"}`}>
            <div className="flex items-center gap-2 font-semibold">
              <HiOutlineCheck className={`w-5 h-5 ${sendResult.failed === 0 ? "text-green-600" : "text-amber-600"}`} />
              Enviados: {sendResult.sent} — Errores: {sendResult.failed}
            </div>
            {sendResult.failed > 0 && (
              <div className="text-xs text-amber-700 mt-2">
                {sendResult.results.filter((r) => !r.ok).map((r) => (
                  <div key={r.cod}>#{r.cod}: {r.error}</div>
                ))}
              </div>
            )}
          </div>
        </Stagger>
      )}

      <Stagger delay={50}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Message composer */}
          <div className="bg-white border rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <HiOutlinePaperAirplane className="w-4 h-4 text-brand-500" />
              <h2 className="text-sm font-semibold text-gray-700">Mensaje</h2>
            </div>
            <div className="flex flex-wrap gap-1 mb-2">
              {TEMPLATES.map((t) => (
                <button key={t.label} onClick={() => setMessage(t.body)}
                  className={`px-2 py-1 text-xs rounded-lg border ${springBtn} ${message === t.body ? "bg-brand-500 text-white border-brand-500" : "bg-white border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
            <p className="text-xs text-gray-400 mt-1">Variables: {"{nombre}"} = nombre del cliente, {"{saldo}"} = saldo formateado</p>
            {previewRecipient && (
              <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-2">
                <div className="text-xs font-medium text-green-700 mb-1">Vista previa (para {previewRecipient.nombre}):</div>
                <div className="text-xs text-gray-800 whitespace-pre-wrap">{preview}</div>
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="bg-white border rounded-xl shadow-sm p-4">
            <div className="flex items-center gap-2 mb-2">
              <HiOutlineCurrencyDollar className="w-4 h-4 text-red-500" />
              <h2 className="text-sm font-semibold text-gray-700">Seleccion</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <div className="text-2xl font-bold text-gray-900">{selected.size}</div>
                <div className="text-xs text-gray-500">Destinatarios</div>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <div className="text-lg font-bold text-red-600">{formatPrice(selectedSaldo)}</div>
                <div className="text-xs text-red-600">Saldo total</div>
              </div>
            </div>
            <button
              onClick={() => setConfirmSend(true)}
              disabled={selected.size === 0 || !message.trim() || sending}
              className={`w-full mt-3 py-3 bg-green-500 text-white rounded-xl font-semibold disabled:opacity-50 flex items-center justify-center gap-2 ${springBtn}`}>
              <FaWhatsapp className="w-5 h-5" />
              Enviar a {selected.size} cliente{selected.size === 1 ? "" : "s"}
            </button>
          </div>
        </div>
      </Stagger>

      {/* Filters */}
      <Stagger delay={100}>
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
          </div>
          <div className="flex items-center gap-2 bg-white border rounded-xl px-3">
            <span className="text-xs text-gray-500">Saldo mayor a:</span>
            <input type="number" value={minMonto} onChange={(e) => setMinMonto(e.target.value)}
              className="w-24 px-2 py-1 text-sm focus:outline-none" />
          </div>
          <div className="flex items-center gap-2 bg-purple-50 border border-purple-200 rounded-xl px-3" title="No mostrar clientes que ya contactaste en este periodo">
            <span className="text-xs text-purple-700">No contactados hace:</span>
            <input type="number" value={sinContactoDias} onChange={(e) => setSinContactoDias(e.target.value)}
              className="w-14 px-2 py-1 text-sm bg-transparent focus:outline-none" />
            <span className="text-xs text-purple-700">dias+</span>
          </div>
          <button onClick={selectPage} className={`px-4 py-2 bg-white border rounded-xl text-sm font-medium hover:bg-gray-50 ${springBtn}`}>
            {paged.every((d) => selected.has(d.cod)) ? "Deseleccionar pagina" : "Seleccionar pagina"}
          </button>
          <button onClick={selectAll} className={`px-4 py-2 bg-white border rounded-xl text-sm font-medium hover:bg-gray-50 ${springBtn}`}>
            {selected.size === filtered.length ? "Deseleccionar" : "Seleccionar todos"}
          </button>
        </div>
      </Stagger>

      {/* Debtor list */}
      {loading ? <LoadingCenter text="Cargando deudores..." /> : filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400">No hay clientes con saldo pendiente.</div>
      ) : (
        <Stagger delay={150}>
          <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-xs text-gray-500 flex flex-wrap items-center justify-between gap-2">
              <span>{filtered.length} clientes con saldo pendiente {selected.size > 0 && <span className="text-brand-600 font-medium">({selected.size} seleccionados)</span>}</span>
              <span className="font-semibold">Total: {formatPrice(filtered.reduce((s, d) => s + d.saldo, 0))}</span>
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-2 bg-gray-50 border-b flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(0)} disabled={page === 0}
                    className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>«</button>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Anterior</button>
                  <span className="text-xs text-gray-500 mx-2">Pag. {page + 1} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Siguiente</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                    className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>»</button>
                </div>
              </div>
            )}
            <div className="divide-y">
              {paged.map((d, i) => {
                const isSelected = selected.has(d.cod);
                return (
                  <label key={d.cod} style={staggerStyle(true, i, 150, 20)}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer ${hoverRow} ${isSelected ? "bg-brand-50" : ""}`}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(d.cod)}
                      className="w-4 h-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-900 truncate">{d.nombre}</span>
                        <span className="text-xs text-gray-400">#{d.cod}</span>
                        {lastContact[d.cod] && (() => {
                          const ago = daysAgo(lastContact[d.cod].fecha);
                          return (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ago < 7 ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-500"}`}
                              title={`Ultimo contacto el ${new Date(lastContact[d.cod].fecha).toLocaleDateString("es-AR")} por ${lastContact[d.cod].enviadoPor || "—"}`}>
                              Contactado hace {ago === 0 ? "hoy" : ago === 1 ? "1 dia" : `${ago} dias`}
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {d.telefono && <span className="mr-2">📱 {d.telefono}</span>}
                        {d.direccion}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-red-600">{formatPrice(d.saldo)}</div>
                    </div>
                  </label>
                );
              })}
            </div>
            {totalPages > 1 && (
              <div className="px-4 py-3 bg-gray-50 border-t flex items-center justify-between gap-2">
                <span className="text-xs text-gray-500">
                  Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
                </span>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(0)} disabled={page === 0}
                    className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>«</button>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0}
                    className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Anterior</button>
                  <span className="text-xs text-gray-500 mx-2">Pagina {page + 1} / {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
                    className={`px-3 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>Siguiente</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}
                    className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>»</button>
                </div>
              </div>
            )}
          </div>
        </Stagger>
      )}

      {/* Confirm modal */}
      {confirmSend && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !sending && setConfirmSend(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3 mb-4">
              <HiOutlineExclamation className="w-8 h-8 text-amber-500 shrink-0" />
              <div>
                <h2 className="text-lg font-bold text-gray-900">Confirmar envio</h2>
                <p className="text-sm text-gray-600 mt-1">Se enviara el mensaje a <strong>{selected.size} cliente{selected.size === 1 ? "" : "s"}</strong>. Esta accion no se puede deshacer.</p>
              </div>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 mb-4 text-xs text-gray-700 max-h-32 overflow-y-auto whitespace-pre-wrap">
              {message}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setConfirmSend(false)} disabled={sending}
                className={`flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold disabled:opacity-50 ${springBtn}`}>
                <HiOutlineX className="w-5 h-5 inline mr-1" />
                Cancelar
              </button>
              <button onClick={doSend} disabled={sending}
                className={`flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold disabled:opacity-50 ${springBtn}`}>
                <FaWhatsapp className="w-5 h-5 inline mr-1" />
                {sending ? "Enviando..." : "Enviar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageTransition>
  );
}
