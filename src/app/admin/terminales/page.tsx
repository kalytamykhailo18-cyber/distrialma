"use client";

import { useEffect, useState, useCallback } from "react";
import { PageTransition, Stagger, springBtn, LoadingCenter } from "@/components/AnimateIn";
import {
  HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineDesktopComputer,
  HiOutlineX, HiOutlineCheck, HiOutlineExternalLink,
} from "react-icons/hi";

interface Terminal {
  id: number;
  nombre: string;
  sucursal: string;
  sucursalNombre: string;
  listas: string;
  cuit: string;
  razonSocial: string;
  direccion: string;
  aliasBanco: string;
  formatoImpresion: string;
  flujo: string;
  permisoAnular: boolean;
  permisoPrecio: boolean;
  permisoDevolver: boolean;
  requiereCliente: boolean;
  activa: boolean;
}

const EMPTY_FORM: Omit<Terminal, "id"> = {
  nombre: "", sucursal: "", sucursalNombre: "", listas: "1", cuit: "", razonSocial: "",
  direccion: "", aliasBanco: "", formatoImpresion: "ticket", flujo: "directo",
  permisoAnular: false, permisoPrecio: false, permisoDevolver: true, requiereCliente: false, activa: true,
};

const SUCURSALES = [
  { value: "1", label: "Minorista (Merlo)" },
  { value: "3", label: "PedidosYa" },
  { value: "4", label: "Mayorista (Merlo)" },
  { value: "5", label: "Distribuidor" },
  { value: "6", label: "Pontevedra" },
];

const LISTA_LABELS: Record<string, string> = { "1": "Minorista", "2": "Mayorista", "3": "Especial", "4": "Caja Cerrada", "5": "PedidosYa" };

export default function TerminalesPage() {
  const [terminales, setTerminales] = useState<Terminal[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | "new" | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  const [toast, setToast] = useState("");
  const [modalVisible, setModalVisible] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2000); };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/pos-terminales");
      const d = await res.json();
      setTerminales(d.terminales || []);
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  function openModal(t?: Terminal) {
    if (t) {
      setEditing(t.id);
      setForm({
        nombre: t.nombre, sucursal: t.sucursal, sucursalNombre: t.sucursalNombre,
        listas: t.listas, cuit: t.cuit, razonSocial: t.razonSocial, direccion: t.direccion,
        aliasBanco: t.aliasBanco, formatoImpresion: t.formatoImpresion, flujo: t.flujo,
        permisoAnular: t.permisoAnular, permisoPrecio: t.permisoPrecio,
        permisoDevolver: t.permisoDevolver, requiereCliente: t.requiereCliente, activa: t.activa,
      });
    } else {
      setEditing("new");
      setForm({ ...EMPTY_FORM });
    }
    setTimeout(() => setModalVisible(true), 10);
  }

  function closeModal() {
    setModalVisible(false);
    setTimeout(() => setEditing(null), 300);
  }

  async function save() {
    if (!form.nombre.trim() || !form.sucursal || !form.cuit.trim() || !form.listas.trim()) return;
    setSaving(true);
    try {
      const body = editing === "new" ? form : { id: editing, ...form };
      body.sucursalNombre = SUCURSALES.find((s) => s.value === form.sucursal)?.label || "";
      await fetch("/api/admin/pos-terminales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      showToast(editing === "new" ? "Terminal creada" : "Terminal actualizada");
      closeModal();
      loadData();
    } catch {}
    setSaving(false);
  }

  async function remove(id: number) {
    if (confirmDelete !== id) { setConfirmDelete(id); return; }
    setDeleting(id);
    setConfirmDelete(null);
    try {
      await fetch("/api/admin/pos-terminales", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      showToast("Terminal eliminada");
      loadData();
    } catch {}
    setDeleting(null);
  }

  function toggleLista(lista: string) {
    const current = form.listas.split(",").filter(Boolean);
    const updated = current.includes(lista)
      ? current.filter((l) => l !== lista)
      : [...current, lista].sort();
    setForm({ ...form, listas: updated.join(",") || "1" });
  }

  const inputCls = "w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 transition-colors duration-200";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Terminales POS</h1>
            <p className="text-sm text-gray-500 mt-1">Configuracion de las terminales del punto de venta web.</p>
          </div>
          <button onClick={() => openModal()} className={`flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 ${springBtn}`}>
            <HiOutlinePlus className="w-4 h-4" />
            Agregar terminal
          </button>
        </div>
      </Stagger>

      {loading ? <LoadingCenter /> : (
        <>
          {terminales.length === 0 ? (
            <Stagger delay={100}>
              <div className="text-center py-12">
                <HiOutlineDesktopComputer className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-400">No hay terminales configuradas.</p>
                <p className="text-sm text-gray-400 mt-1">Crea la primera terminal para empezar.</p>
              </div>
            </Stagger>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {terminales.map((t, i) => (
                <div
                  key={t.id}
                  className={`bg-white border rounded-xl shadow-sm p-4 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 ${!t.activa ? "opacity-50" : ""}`}
                  style={{
                    opacity: 0,
                    animation: `cardIn 400ms cubic-bezier(0.25,1,0.5,1) ${100 + i * 60}ms forwards`,
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{t.nombre}</h3>
                      <p className="text-xs text-gray-500">{t.sucursalNombre || `Sucursal ${t.sucursal}`}</p>
                    </div>
                    <div className="flex gap-1">
                      <a href={`/pos/${t.id}`} target="_blank"
                        className={`p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg ${springBtn}`} title="Abrir POS">
                        <HiOutlineExternalLink className="w-4 h-4" />
                      </a>
                      <button onClick={() => openModal(t)}
                        className={`p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg ${springBtn}`}>
                        <HiOutlinePencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(t.id)} onBlur={() => setConfirmDelete(null)}
                        disabled={deleting === t.id}
                        className={`p-1.5 rounded-lg ${springBtn} ${
                          confirmDelete === t.id ? "bg-red-500 text-white" : "text-gray-400 hover:text-red-600 hover:bg-red-50"
                        }`} title={confirmDelete === t.id ? "Click de nuevo para confirmar" : "Eliminar"}>
                        {confirmDelete === t.id ? (
                          <span className="text-xs font-medium px-1">Confirmar?</span>
                        ) : (
                          <HiOutlineTrash className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-14">CUIT</span>
                      <span className="font-mono">{t.cuit}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-14">Listas</span>
                      <div className="flex gap-1 flex-wrap">
                        {t.listas.split(",").map((l) => (
                          <span key={l} className="px-1.5 py-0.5 bg-brand-100 text-brand-700 rounded text-xs font-medium">
                            {LISTA_LABELS[l] || `L${l}`}
                          </span>
                        ))}
                      </div>
                    </div>
                    {t.direccion && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 w-14">Dir.</span>
                        <span className="truncate">{t.direccion}</span>
                      </div>
                    )}
                    {t.aliasBanco && (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 w-14">Alias</span>
                        <span className="font-mono">{t.aliasBanco}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 mt-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-200 ${t.formatoImpresion === "ticket" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                      {t.formatoImpresion === "ticket" ? "Ticket" : "A4"}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors duration-200 ${t.flujo === "directo" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                      {t.flujo === "directo" ? "Directo" : "Pendiente"}
                    </span>
                    {t.requiereCliente && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Req. cliente</span>}
                    {t.permisoAnular && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Anular</span>}
                    {t.permisoPrecio && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">Cambiar precio</span>}
                    {!t.activa && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-500">Inactiva</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Modal */}
      {editing !== null && (
        <div
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-all duration-300 ${modalVisible ? "bg-black/40" : "bg-black/0 pointer-events-none"}`}
          onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }}
        >
          <div
            className={`bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto transition-all duration-300 ease-[cubic-bezier(0.25,1,0.5,1)] ${
              modalVisible ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4"
            }`}
          >
            {/* Modal header */}
            <div className="flex items-center justify-between p-5 border-b sticky top-0 bg-white rounded-t-2xl z-10">
              <h2 className="text-lg font-bold text-gray-900">
                {editing === "new" ? "Nueva terminal" : `Editar terminal`}
              </h2>
              <button onClick={closeModal} className={`p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg ${springBtn}`}>
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-5 space-y-4">
              {/* Row 1: Name + Branch */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 50ms forwards" }}>
                  <label className={labelCls}>Nombre *</label>
                  <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                    placeholder="Ej: Caja 1 Minorista" className={inputCls} />
                </div>
                <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 100ms forwards" }}>
                  <label className={labelCls}>Sucursal *</label>
                  <select value={form.sucursal} onChange={(e) => setForm({ ...form, sucursal: e.target.value })} className={inputCls}>
                    <option value="">Seleccionar...</option>
                    {SUCURSALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              {/* Row 2: CUIT + Razon Social */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 150ms forwards" }}>
                  <label className={labelCls}>CUIT *</label>
                  <input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })}
                    placeholder="30-12345678-9" className={inputCls} />
                </div>
                <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 200ms forwards" }}>
                  <label className={labelCls}>Razon social</label>
                  <input value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
                    placeholder="Distrialma S.R.L." className={inputCls} />
                </div>
              </div>

              {/* Row 3: Address */}
              <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 250ms forwards" }}>
                <label className={labelCls}>Direccion</label>
                <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                  placeholder="Av. San Martin 1234, Merlo" className={inputCls} />
              </div>

              {/* Row 4: Alias + Format + Flow */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 300ms forwards" }}>
                  <label className={labelCls}>Alias banco</label>
                  <input value={form.aliasBanco} onChange={(e) => setForm({ ...form, aliasBanco: e.target.value })}
                    placeholder="distrialma.merlo" className={inputCls} />
                </div>
                <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 350ms forwards" }}>
                  <label className={labelCls}>Formato</label>
                  <select value={form.formatoImpresion} onChange={(e) => setForm({ ...form, formatoImpresion: e.target.value })} className={inputCls}>
                    <option value="ticket">Ticket (80mm)</option>
                    <option value="a4">A4</option>
                  </select>
                </div>
                <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 400ms forwards" }}>
                  <label className={labelCls}>Flujo de venta</label>
                  <select value={form.flujo} onChange={(e) => setForm({ ...form, flujo: e.target.value })} className={inputCls}>
                    <option value="directo">Directo</option>
                    <option value="pendiente">Pendiente</option>
                  </select>
                </div>
              </div>

              {/* Listas */}
              <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 450ms forwards" }}>
                <label className={labelCls}>Listas de precios *</label>
                <div className="flex flex-wrap gap-2">
                  {["1", "2", "3", "4", "5"].map((l) => (
                    <button key={l} onClick={() => toggleLista(l)}
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${springBtn} ${
                        form.listas.split(",").includes(l)
                          ? "bg-brand-500 text-white shadow-sm"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                      }`}>
                      {l} — {LISTA_LABELS[l]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Permisos */}
              <div style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 500ms forwards" }}>
                <label className={labelCls}>Permisos</label>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {([
                    ["requiereCliente", "Requiere cliente"],
                    ["permisoAnular", "Puede anular ventas"],
                    ["permisoPrecio", "Puede cambiar precios"],
                    ["permisoDevolver", "Puede hacer devoluciones"],
                    ["activa", "Terminal activa"],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input type="checkbox" checked={form[key as keyof typeof form] as boolean}
                        onChange={(e) => setForm({ ...form, [key]: e.target.checked })}
                        className="rounded border-gray-300 text-brand-500 focus:ring-brand-500 transition-colors duration-200" />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex justify-end gap-3 p-5 border-t bg-gray-50 rounded-b-2xl"
              style={{ opacity: 0, animation: "fadeSlideIn 350ms ease 550ms forwards" }}>
              <button onClick={closeModal}
                className={`px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 ${springBtn}`}>
                Cancelar
              </button>
              <button onClick={save} disabled={saving || !form.nombre.trim() || !form.sucursal || !form.cuit.trim()}
                className={`flex items-center gap-2 px-5 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 disabled:opacity-50 ${springBtn}`}>
                <HiOutlineCheck className="w-4 h-4" />
                {saving ? "Guardando..." : "Guardar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50"
          style={{ animation: "fadeSlideIn 300ms ease forwards" }}>
          {toast}
        </div>
      )}

      <style jsx>{`
        @keyframes cardIn {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </PageTransition>
  );
}
