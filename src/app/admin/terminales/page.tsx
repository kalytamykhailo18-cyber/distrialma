"use client";

import { useEffect, useState, useCallback } from "react";
import { PageTransition, Stagger, staggerStyle, springBtn, LoadingCenter } from "@/components/AnimateIn";
import {
  HiOutlinePlus, HiOutlinePencil, HiOutlineTrash, HiOutlineDesktopComputer,
  HiOutlineX, HiOutlineCheck,
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
  nombre: "",
  sucursal: "",
  sucursalNombre: "",
  listas: "1",
  cuit: "",
  razonSocial: "",
  direccion: "",
  aliasBanco: "",
  formatoImpresion: "ticket",
  flujo: "directo",
  permisoAnular: false,
  permisoPrecio: false,
  permisoDevolver: true,
  requiereCliente: false,
  activa: true,
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
  const [toast, setToast] = useState("");

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

  function startEdit(t: Terminal) {
    setEditing(t.id);
    setForm({
      nombre: t.nombre, sucursal: t.sucursal, sucursalNombre: t.sucursalNombre,
      listas: t.listas, cuit: t.cuit, razonSocial: t.razonSocial, direccion: t.direccion,
      aliasBanco: t.aliasBanco, formatoImpresion: t.formatoImpresion, flujo: t.flujo,
      permisoAnular: t.permisoAnular, permisoPrecio: t.permisoPrecio,
      permisoDevolver: t.permisoDevolver, requiereCliente: t.requiereCliente, activa: t.activa,
    });
  }

  function startNew() {
    setEditing("new");
    setForm({ ...EMPTY_FORM });
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
      setEditing(null);
      loadData();
    } catch {}
    setSaving(false);
  }

  async function remove(id: number) {
    setDeleting(id);
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

  const inputCls = "w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600";
  const labelCls = "block text-sm font-medium text-gray-700 mb-1";

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Terminales POS</h1>
            <p className="text-sm text-gray-500 mt-1">Configuracion de las terminales del punto de venta web.</p>
          </div>
          <button onClick={startNew} className={`flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 ${springBtn}`}>
            <HiOutlinePlus className="w-4 h-4" />
            Agregar terminal
          </button>
        </div>
      </Stagger>

      {loading ? <LoadingCenter /> : (
        <>
          {/* Terminal form (create/edit) */}
          {editing !== null && (
            <Stagger delay={50}>
              <div className="bg-white border rounded-xl shadow-sm p-6 mb-6">
                <h2 className="font-semibold text-gray-900 mb-4">
                  {editing === "new" ? "Nueva terminal" : `Editar: ${terminales.find((t) => t.id === editing)?.nombre}`}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <label className={labelCls}>Nombre *</label>
                    <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                      placeholder="Ej: Caja 1 Minorista" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Sucursal *</label>
                    <select value={form.sucursal} onChange={(e) => setForm({ ...form, sucursal: e.target.value })}
                      className={inputCls}>
                      <option value="">Seleccionar...</option>
                      {SUCURSALES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>CUIT *</label>
                    <input value={form.cuit} onChange={(e) => setForm({ ...form, cuit: e.target.value })}
                      placeholder="30-12345678-9" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Razon social</label>
                    <input value={form.razonSocial} onChange={(e) => setForm({ ...form, razonSocial: e.target.value })}
                      placeholder="Distrialma S.R.L." className={inputCls} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelCls}>Direccion</label>
                    <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })}
                      placeholder="Av. San Martin 1234, Merlo" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Alias banco (transferencias)</label>
                    <input value={form.aliasBanco} onChange={(e) => setForm({ ...form, aliasBanco: e.target.value })}
                      placeholder="distrialma.merlo" className={inputCls} />
                  </div>
                  <div>
                    <label className={labelCls}>Formato impresion</label>
                    <select value={form.formatoImpresion} onChange={(e) => setForm({ ...form, formatoImpresion: e.target.value })}
                      className={inputCls}>
                      <option value="ticket">Ticket (80mm)</option>
                      <option value="a4">A4</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Flujo de venta</label>
                    <select value={form.flujo} onChange={(e) => setForm({ ...form, flujo: e.target.value })}
                      className={inputCls}>
                      <option value="directo">Directo (cobra el vendedor)</option>
                      <option value="pendiente">Pendiente (cobra el cajero)</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelCls}>Listas de precios *</label>
                    <div className="flex flex-wrap gap-2">
                      {["1", "2", "3", "4", "5"].map((l) => (
                        <button key={l} onClick={() => toggleLista(l)}
                          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${springBtn} ${
                            form.listas.split(",").includes(l)
                              ? "bg-brand-500 text-white"
                              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                          }`}>
                          {l} — {LISTA_LABELS[l]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="sm:col-span-2 lg:col-span-3">
                    <label className={labelCls}>Permisos</label>
                    <div className="flex flex-wrap gap-4">
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
                            className="rounded border-gray-300 text-brand-500 focus:ring-brand-500" />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex gap-3 mt-6">
                  <button onClick={save} disabled={saving || !form.nombre.trim() || !form.sucursal || !form.cuit.trim()}
                    className={`flex items-center gap-2 px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium hover:bg-brand-600 disabled:opacity-50 ${springBtn}`}>
                    <HiOutlineCheck className="w-4 h-4" />
                    {saving ? "Guardando..." : "Guardar"}
                  </button>
                  <button onClick={() => setEditing(null)}
                    className={`flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium hover:bg-gray-200 ${springBtn}`}>
                    <HiOutlineX className="w-4 h-4" />
                    Cancelar
                  </button>
                </div>
              </div>
            </Stagger>
          )}

          {/* Terminal list */}
          {terminales.length === 0 && editing === null ? (
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
                <Stagger key={t.id} delay={100 + i * 40}>
                  <div className={`bg-white border rounded-xl shadow-sm p-4 ${!t.activa ? "opacity-50" : ""}`} style={staggerStyle(true, i)}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{t.nombre}</h3>
                        <p className="text-xs text-gray-500">{t.sucursalNombre || `Sucursal ${t.sucursal}`}</p>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => startEdit(t)}
                          className={`p-1.5 text-gray-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg ${springBtn}`}>
                          <HiOutlinePencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => remove(t.id)} disabled={deleting === t.id}
                          className={`p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg ${springBtn}`}>
                          <HiOutlineTrash className="w-4 h-4" />
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
                        <div className="flex gap-1">
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.formatoImpresion === "ticket" ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                        {t.formatoImpresion === "ticket" ? "Ticket" : "A4"}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.flujo === "directo" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                        {t.flujo === "directo" ? "Directo" : "Pendiente"}
                      </span>
                      {t.requiereCliente && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Req. cliente</span>
                      )}
                      {t.permisoAnular && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Anular</span>
                      )}
                      {t.permisoPrecio && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-600">Cambiar precio</span>
                      )}
                      {!t.activa && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-500">Inactiva</span>
                      )}
                    </div>
                  </div>
                </Stagger>
              ))}
            </div>
          )}
        </>
      )}

      {toast && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm z-50">
          {toast}
        </div>
      )}
    </PageTransition>
  );
}
