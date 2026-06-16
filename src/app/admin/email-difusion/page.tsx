"use client";

import { useState, useEffect } from "react";
import { PageTransition, Stagger, springBtn, LoadingCenter } from "@/components/AnimateIn";
import ConfirmModal from "@/components/ConfirmModal";

interface Recipient {
  cod: string;
  nombre: string;
  email: string;
  ultimaCompra: string;
  cantCompras: number;
  totalHistorico: number;
}

function formatDate(f: string): string {
  if (!f || f.length < 8) return "—";
  return `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;
}

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

const DEFAULT_HTML = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#1f2937">
  <h2 style="color:#ea580c">¡Hola {nombre}!</h2>
  <p>Te invitamos a visitar nuestra web con las ofertas de la semana.</p>
  <p>Productos nuevos, promociones y precios especiales para vos.</p>
  <p style="margin:24px 0">
    <a href="https://distrialma.com.ar" style="background:#ea580c;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;font-weight:bold">Ver catálogo</a>
  </p>
  <p style="color:#6b7280;font-size:13px">Distrialma — Mayorista de alimentos<br>Av. Calle Real 387, Merlo, Buenos Aires</p>
</div>`;

export default function EmailDifusionPage() {
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dias, setDias] = useState("0");
  const [minCompras, setMinCompras] = useState("1");
  const [subject, setSubject] = useState("Novedades de Distrialma");
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_HTML);
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState("");
  const [confirmSend, setConfirmSend] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/email-difusion?dias=${dias || 0}&minCompras=${minCompras || 0}`);
      const data = await res.json();
      setRecipients(data.recipients || []);
      setSelected(new Set((data.recipients || []).map((r: Recipient) => r.cod)));
    } catch {
      setRecipients([]);
    }
    setLoading(false);
  }

  useEffect(() => { load(); }, [dias, minCompras]); // eslint-disable-line

  function toggleSelect(cod: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod);
      else next.add(cod);
      return next;
    });
  }

  function selectAll() {
    if (selected.size === recipients.length) setSelected(new Set());
    else setSelected(new Set(recipients.map((r) => r.cod)));
  }

  async function sendTest() {
    if (!testEmail || !testEmail.includes("@")) {
      setResult("Ingresá un email de prueba válido");
      return;
    }
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/admin/email-difusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, bodyHtml, testEmail }),
      });
      const data = await res.json();
      setResult(res.ok ? `Mail de prueba enviado a ${testEmail}` : `Error: ${data.error}`);
    } catch {
      setResult("Error de red");
    }
    setSending(false);
  }

  async function sendBulk() {
    setSending(true);
    setResult("");
    try {
      const res = await fetch("/api/admin/email-difusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject,
          bodyHtml,
          recipients: Array.from(selected),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setResult(`Enviados: ${data.sent}. Fallaron: ${data.failed}${data.errors?.length ? "\n" + data.errors.join("\n") : ""}`);
        setConfirmSend(false);
      } else {
        setResult(`Error: ${data.error}`);
      }
    } catch {
      setResult("Error de red");
    }
    setSending(false);
  }

  return (
    <PageTransition className="max-w-7xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Difusión por email</h1>
        <p className="text-sm text-gray-500 mb-4">Envío masivo gratuito vía Resend. Usá <code className="bg-gray-100 px-1 rounded">{"{nombre}"}</code> en el asunto o cuerpo para personalizar.</p>
      </Stagger>

      <Stagger delay={50}>
        <div className="grid md:grid-cols-2 gap-4 mb-4">
          <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-800">Mensaje</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Asunto</label>
              <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cuerpo (HTML)</label>
              <textarea value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} rows={14}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-brand-500" />
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-600 mb-1">Probar enviando a</label>
                <input type="email" placeholder="tu@email.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <button onClick={sendTest} disabled={sending || !testEmail} className={`px-4 py-2 bg-gray-700 text-white rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 ${springBtn}`}>
                Prueba
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg border shadow-sm p-4 space-y-3">
            <h2 className="font-semibold text-gray-800">Vista previa</h2>
            <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 max-h-[450px] overflow-auto">
              <div className="text-xs text-gray-500 mb-2 pb-2 border-b">
                <strong>De:</strong> Distrialma &lt;administracion@alertrasadmin.com&gt;<br />
                <strong>Asunto:</strong> {subject.replace(/\{nombre\}/g, recipients[0]?.nombre || "{nombre}")}
              </div>
              <div dangerouslySetInnerHTML={{ __html: bodyHtml.replace(/\{nombre\}/g, recipients[0]?.nombre || "Cliente") }} />
            </div>
          </div>
        </div>
      </Stagger>

      <Stagger delay={100}>
        <div className="bg-white rounded-lg border shadow-sm p-4 mb-4">
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <h2 className="font-semibold text-gray-800">Destinatarios</h2>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Sin comprar hace:</span>
              <input type="number" value={dias} onChange={(e) => setDias(e.target.value)} className="w-16 border rounded px-2 py-1 text-sm" placeholder="0" />
              <span className="text-gray-500">días (0=todos)</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">Min compras:</span>
              <input type="number" value={minCompras} onChange={(e) => setMinCompras(e.target.value)} className="w-14 border rounded px-2 py-1 text-sm" />
            </div>
            <button onClick={selectAll} className="ml-auto text-sm px-3 py-1.5 bg-gray-100 rounded-lg hover:bg-gray-200">
              {selected.size === recipients.length && recipients.length > 0 ? "Deseleccionar todos" : "Seleccionar todos"}
            </button>
            <button onClick={() => setConfirmSend(true)} disabled={selected.size === 0 || sending}
              className={`px-4 py-1.5 bg-brand-500 text-white rounded-lg text-sm font-medium hover:bg-brand-600 disabled:opacity-50 ${springBtn}`}>
              Enviar a {selected.size}
            </button>
          </div>

          {result && <pre className="text-sm text-gray-700 bg-gray-50 rounded p-2 whitespace-pre-wrap mb-3">{result}</pre>}

          {loading ? <LoadingCenter text="Cargando..." /> : recipients.length === 0 ? (
            <p className="text-gray-400 text-sm">No hay clientes con email cargado. Cargá emails en la ficha de cliente o pedile al equipo que los registre.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-orange-500 text-white">
                    <th className="px-2 py-2"></th>
                    <th className="text-left px-3 py-2">Cliente</th>
                    <th className="text-left px-3 py-2">Email</th>
                    <th className="text-right px-3 py-2">Última compra</th>
                    <th className="text-right px-3 py-2">Compras</th>
                    <th className="text-right px-3 py-2">Histórico</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recipients.slice(0, 200).map((r) => (
                    <tr key={r.cod} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5">
                        <input type="checkbox" checked={selected.has(r.cod)} onChange={() => toggleSelect(r.cod)} />
                      </td>
                      <td className="px-3 py-1.5"><span className="text-xs text-gray-400 font-mono mr-2">{r.cod}</span>{r.nombre}</td>
                      <td className="px-3 py-1.5 text-xs">{r.email}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">{formatDate(r.ultimaCompra)}</td>
                      <td className="px-3 py-1.5 text-right">{r.cantCompras}</td>
                      <td className="px-3 py-1.5 text-right font-medium">{formatPrice(r.totalHistorico)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {recipients.length > 200 && <p className="text-xs text-gray-400 mt-2">Mostrando 200 de {recipients.length}</p>}
            </div>
          )}
        </div>
      </Stagger>

      <ConfirmModal
        open={confirmSend}
        message={`Vas a mandar el mail a ${selected.size} clientes. ¿Confirmás?`}
        onConfirm={sendBulk}
        onCancel={() => setConfirmSend(false)}
        loading={sending}
        confirmLabel="Enviar"
      />
    </PageTransition>
  );
}
