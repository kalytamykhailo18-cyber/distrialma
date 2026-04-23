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
  const [uploading, setUploading] = useState(false);
  const [rangoDesde, setRangoDesde] = useState("");
  const [rangoHasta, setRangoHasta] = useState("");
  const [soloMostrador, setSoloMostrador] = useState(false);
  const [modo, setModo] = useState<"ahora" | "programar">("ahora");
  const [programadaFecha, setProgramadaFecha] = useState("");
  const [programadaHora, setProgramadaHora] = useState("08:00");
  const [horaArg, setHoraArg] = useState("");

  // Current Argentina time
  useEffect(() => {
    function update() {
      setHoraArg(new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    }
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

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
      const body: Record<string, unknown> = { mensaje, imagenUrl: imagenUrl || null, filtro, rangoDesde, rangoHasta, soloMostrador };
      if (modo === "programar" && programadaFecha && programadaHora) {
        body.programada = `${programadaFecha}T${programadaHora}:00-03:00`;
        body.enviarAhora = false;
      } else {
        body.enviarAhora = true;
      }
      const res = await fetch("/api/admin/difusion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json();
      if (d.ok) {
        setToast(modo === "programar" ? `Programada para ${programadaFecha} ${programadaHora} — ${d.totalRecipients} clientes` : `Enviando a ${d.totalRecipients} clientes...`);
        setTimeout(() => setToast(""), 4000);
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
          body: JSON.stringify({ mensaje: "test", filtro, enviarAhora: false, rangoDesde, rangoHasta, soloMostrador }),
        });
        const d = await res.json();
        setPreviewCount(d.totalRecipients || 0);
      } catch { setPreviewCount(null); }
    }, 500);
    return () => clearTimeout(timeout);
  }, [filtro, rangoDesde, rangoHasta, soloMostrador]);

  async function uploadImage(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      formData.append("sku", "difusion");
      const res = await fetch("/api/admin/upload", { method: "POST", body: formData });
      const d = await res.json();
      if (d.filename) setImagenUrl(d.filename);
    } catch {}
    setUploading(false);
  }

  const FILTROS = [
    { value: "todos", label: "Todos los clientes" },
    { value: "reparto", label: "Solo reparto (dias de entrega)" },
    { value: "zona:MERLO", label: "Zona: Merlo" },
    { value: "zona:PONTEVEDRA", label: "Zona: Pontevedra" },
    { value: "zona:LIBERTAD", label: "Zona: Libertad" },
    { value: "zona:MORENO", label: "Zona: Moreno" },
    { value: "zona:ITUZAINGO", label: "Zona: Ituzaingo" },
    { value: "zona:PADUA", label: "Zona: Padua" },
    { value: "zona:PARQUE", label: "Zona: Parque San Martin" },
    { value: "zona:EMPLEADOS", label: "Zona: Empleados" },
    { value: "zona:LUNES", label: "Reparto: Lunes" },
    { value: "zona:MARTES", label: "Reparto: Martes" },
    { value: "zona:MIERCOLES", label: "Reparto: Miercoles" },
    { value: "zona:JUEVES", label: "Reparto: Jueves" },
    { value: "zona:VIERNES", label: "Reparto: Viernes" },
    { value: "zona:SABADO", label: "Reparto: Sabado" },
    { value: "rango", label: "Por rango de cliente" },
  ];

  return (
    <PageTransition className="max-w-3xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-gray-900">Difusion WhatsApp</h1>
          {horaArg && <span className="text-sm text-gray-500 bg-gray-100 px-3 py-1 rounded-lg font-mono">{horaArg} ARG</span>}
        </div>
        <p className="text-sm text-gray-500 mb-6">Envia mensajes con imagen a los clientes por WhatsApp.</p>
      </Stagger>

      {/* Form */}
      <Stagger delay={50}>
        <div className="bg-white border rounded-xl shadow-sm p-5 mb-6 space-y-4">
          {/* Image */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <HiOutlinePhotograph className="w-4 h-4 inline mr-1" />
              Imagen
            </label>
            <div className="flex gap-2">
              <label className={`flex-1 flex items-center justify-center px-4 py-3 border-2 border-dashed border-brand-300 rounded-lg cursor-pointer hover:border-brand-500 transition-colors ${uploading ? "opacity-50" : ""}`}>
                <input type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(f); }}
                  disabled={uploading} />
                <span className="text-sm text-gray-500">{uploading ? "Subiendo..." : imagenUrl ? "Cambiar imagen" : "Subir imagen"}</span>
              </label>
              {imagenUrl && (
                <button onClick={() => setImagenUrl("")} className="text-xs text-red-500 hover:text-red-700 px-2">Quitar</button>
              )}
            </div>
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
            {filtro === "rango" && (
              <div className="flex gap-2 mt-2">
                <input type="number" value={rangoDesde} onChange={(e) => setRangoDesde(e.target.value)}
                  placeholder="Desde (ej: 1)" className="flex-1 px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600" />
                <input type="number" value={rangoHasta} onChange={(e) => setRangoHasta(e.target.value)}
                  placeholder="Hasta (ej: 1000)" className="flex-1 px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600" />
              </div>
            )}
            {filtro !== "reparto" && (
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input type="checkbox" checked={soloMostrador} onChange={(e) => { setSoloMostrador(e.target.checked); setSendConfirm(false); }}
                  className="w-4 h-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
                <span className="text-sm text-gray-700">Solo mostrador <span className="text-gray-400">(excluir reparto)</span></span>
              </label>
            )}
            {previewCount !== null && (
              <p className="text-xs text-gray-500 mt-1">{previewCount} clientes con telefono</p>
            )}
          </div>

          {/* Reset dedup for testing */}
          {filtro === "zona:EMPLEADOS" && (
            <button onClick={async () => {
              await fetch("/api/admin/difusion/reset", { method: "POST" });
              setToast("Historial de envios a empleados limpiado");
              setTimeout(() => setToast(""), 3000);
            }} className={`w-full py-2 text-sm text-amber-700 bg-amber-50 border border-amber-300 rounded-xl font-medium ${springBtn} hover:bg-amber-100`}>
              Resetear envios a empleados (para probar)
            </button>
          )}

          {/* Send mode toggle */}
          <div className="flex gap-2">
            <button onClick={() => { setModo("ahora"); setSendConfirm(false); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modo === "ahora" ? "bg-green-100 text-green-800 border-2 border-green-500" : "bg-gray-50 text-gray-500 border border-gray-200"}`}>
              Enviar ahora
            </button>
            <button onClick={() => { setModo("programar"); setSendConfirm(false); }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${modo === "programar" ? "bg-blue-100 text-blue-800 border-2 border-blue-500" : "bg-gray-50 text-gray-500 border border-gray-200"}`}>
              <HiOutlineClock className="w-4 h-4 inline mr-1" />
              Programar
            </button>
          </div>

          {/* Schedule picker */}
          {modo === "programar" && (
            <div className="flex gap-2">
              <input type="date" value={programadaFecha} onChange={(e) => { setProgramadaFecha(e.target.value); setSendConfirm(false); }}
                className="flex-1 px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
              <input type="time" value={programadaHora} onChange={(e) => { setProgramadaHora(e.target.value); setSendConfirm(false); }}
                className="w-28 px-3 py-2 border border-blue-400 rounded-lg text-sm focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600" />
            </div>
          )}

          {/* Send / Schedule button */}
          <button onClick={send} disabled={sending || !mensaje.trim() || (modo === "programar" && !programadaFecha)}
            className={`w-full py-3 text-white rounded-xl font-bold text-lg transition-all disabled:opacity-40 ${springBtn} ${
              sendConfirm ? "bg-red-600 hover:bg-red-700 animate-pulse" : modo === "programar" ? "bg-blue-600 hover:bg-blue-700" : "bg-green-600 hover:bg-green-700"
            }`}>
            {modo === "programar" ? <HiOutlineClock className="w-5 h-5 inline mr-2" /> : <HiOutlinePaperAirplane className="w-5 h-5 inline mr-2" />}
            {sending ? "Enviando..." : sendConfirm
              ? (modo === "programar" ? `CONFIRMAR — Programar para ${previewCount || "?"} clientes` : `CONFIRMAR — Enviar a ${previewCount || "?"} clientes`)
              : (modo === "programar" ? `Programar envio` : "Enviar ahora")}
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
                    d.estado === "programada" ? "bg-blue-100 text-blue-700" :
                    d.estado === "cancelada" ? "bg-red-100 text-red-700" :
                    "bg-gray-100 text-gray-600"
                  }`}>
                    {d.estado === "completada" ? <><HiOutlineCheck className="w-3 h-3 inline mr-1" />{d.enviados}/{d.total}</> :
                     d.estado === "enviando" ? <><HiOutlineClock className="w-3 h-3 inline mr-1" />Enviando {d.enviados}/{d.total}</> :
                     d.estado === "programada" ? <><HiOutlineClock className="w-3 h-3 inline mr-1" />Programada {d.programada ? new Date(d.programada).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : ""}</> :
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
