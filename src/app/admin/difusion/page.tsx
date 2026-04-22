"use client";

import { useEffect, useState } from "react";
// import { formatPrice } from "@/lib/utils";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter } from "@/components/AnimateIn";
import { HiOutlinePaperAirplane, HiOutlinePhotograph, HiOutlineClock, HiOutlineCheck } from "react-icons/hi";

interface Difusion {
  id: number;
  mensaje: string;
  imagenUrl: string | null;
  filtro: string;
  programada: string | null;
  estado: string;
  enviados: number;
  fallidos: number;
  total: number;
  creadoPor: string;
  createdAt: string;
}

export default function DifusionPage() {
  const [difusiones, setDifusiones] = useState<Difusion[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [mensaje, setMensaje] = useState("Hola {nombre}! ");
  const [imagenUrl, setImagenUrl] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [sending, setSending] = useState(false);
  const [sendConfirm, setSendConfirm] = useState(false);
  const [toast, setToast] = useState("");
  const [previewCount, setPreviewCount] = useState<number | null>(null);

  async function loadDifusiones() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/difusion");
      const d = await res.json();
      setDifusiones(d.difusiones || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadDifusiones(); }, []);

  async function send() {
    if (!sendConfirm) { setSendConfirm(true); return; }
    setSending(true);
    try {
      const res = await fetch("/api/admin/difusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mensaje, imagenUrl: imagenUrl || null, filtro, enviarAhora: true }),
      });
      const d = await res.json();
      if (d.ok) {
        setToast(`Enviando a ${d.totalRecipients} clientes...`);
        setTimeout(() => setToast(""), 3000);
        setMensaje("Hola {nombre}! ");
        setImagenUrl("");
        setSendConfirm(false);
        loadDifusiones();
      }
    } catch {}
    setSending(false);
  }

  // Preview count
  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        const res = await fetch("/api/admin/difusion", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mensaje: "test", filtro, enviarAhora: false }),
        });
        const d = await res.json();
        setPreviewCount(d.totalRecipients || 0);
      } catch { setPreviewCount(null); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [filtro]);

  const FILTROS = [
    { value: "todos", label: "Todos los clientes" },
    { value: "reparto", label: "Solo reparto (dias de entrega)" },
    { value: "zona:LUNES", label: "Lunes" },
    { value: "zona:MARTES", label: "Martes" },
    { value: "zona:MIERCOLES", label: "Miercoles" },
    { value: "zona:JUEVES", label: "Jueves" },
    { value: "zona:VIERNES", label: "Viernes" },
    { value: "zona:SABADO", label: "Sabado" },
  ];

  return (
    <PageTransition className="max-w-3xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Difusion WhatsApp</h1>
        <p className="text-sm text-gray-500 mb-6">Envia mensajes con imagen a los clientes por WhatsApp.</p>
      </Stagger>

      {/* Form */}
      <Stagger delay={50}>
        <div className="bg-white border rounded-xl shadow-sm p-5 mb-6 space-y-4">
          {/* Image URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <HiOutlinePhotograph className="w-4 h-4 inline mr-1" />
              Imagen (URL o subir)
            </label>
            <input type="text" value={imagenUrl} onChange={(e) => setImagenUrl(e.target.value)}
              placeholder="https://... o pegar URL de la imagen"
              className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
            {imagenUrl && (
              <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                <img src={imagenUrl} alt="Preview" className="max-h-40 rounded mx-auto" />
              </div>
            )}
          </div>

          {/* Message */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mensaje</label>
            <textarea value={mensaje} onChange={(e) => setMensaje(e.target.value)}
              rows={3} placeholder="Hola {nombre}! Mira las ofertas de hoy..."
              className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600" />
            <p className="text-xs text-gray-400 mt-1">Usa {"{nombre}"} para el nombre del cliente.</p>
          </div>

          {/* Preview */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 mb-1">Vista previa:</div>
            <div className="text-sm text-gray-800">{mensaje.replace(/\{nombre\}/g, "Juan").replace(/\{nombre_completo\}/g, "Juan Perez")}</div>
          </div>

          {/* Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Enviar a</label>
            <select value={filtro} onChange={(e) => { setFiltro(e.target.value); setSendConfirm(false); }}
              className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600">
              {FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            {previewCount !== null && (
              <p className="text-xs text-gray-500 mt-1">{previewCount} clientes con telefono</p>
            )}
          </div>

          {/* Send */}
          <button onClick={send} disabled={sending || !mensaje.trim()}
            className={`w-full py-3 text-white rounded-xl font-bold text-lg transition-all disabled:opacity-40 ${springBtn} ${
              sendConfirm ? "bg-red-600 hover:bg-red-700 animate-pulse" : "bg-green-600 hover:bg-green-700"
            }`}>
            <HiOutlinePaperAirplane className="w-5 h-5 inline mr-2" />
            {sending ? "Enviando..." : sendConfirm ? `CONFIRMAR — Enviar a ${previewCount || "?"} clientes` : "Enviar ahora"}
          </button>
        </div>
      </Stagger>

      {/* History */}
      <Stagger delay={100}>
        <h2 className="text-lg font-bold text-gray-900 mb-3">Historial</h2>
        {loading ? <LoadingCenter /> : difusiones.length === 0 ? (
          <p className="text-gray-400 text-center py-6">No hay difusiones anteriores.</p>
        ) : (
          <div className="space-y-2">
            {difusiones.map((d, i) => (
              <div key={d.id} className={`bg-white border rounded-xl p-3 ${hoverRow}`} style={staggerStyle(true, i)}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-400">{new Date(d.createdAt).toLocaleString("es-AR")} · {d.creadoPor}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    d.estado === "completada" ? "bg-green-100 text-green-700" :
                    d.estado === "enviando" ? "bg-amber-100 text-amber-700 animate-pulse" :
                    d.estado === "cancelada" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {d.estado === "completada" ? <><HiOutlineCheck className="w-3 h-3 inline mr-1" />{d.enviados}/{d.total}</> :
                     d.estado === "enviando" ? <><HiOutlineClock className="w-3 h-3 inline mr-1" />Enviando {d.enviados}/{d.total}</> :
                     d.estado}
                  </span>
                </div>
                <p className="text-sm text-gray-800 line-clamp-2">{d.mensaje}</p>
                {d.imagenUrl && <span className="text-xs text-blue-500">Con imagen</span>}
                {d.fallidos > 0 && <span className="text-xs text-red-500 ml-2">{d.fallidos} fallidos</span>}
              </div>
            ))}
          </div>
        )}
      </Stagger>

      {toast && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </PageTransition>
  );
}
