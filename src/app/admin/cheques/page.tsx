"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePlus, HiOutlineSearch, HiOutlineTrash, HiOutlinePencil, HiOutlineCheck, HiOutlineX, HiOutlineClock, HiOutlineOfficeBuilding, HiOutlineUser, HiOutlineCog, HiOutlineDocumentText, HiOutlineDeviceMobile, HiOutlineRefresh, HiOutlineCurrencyDollar, HiOutlineArrowRight } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, useDataReady } from "@/components/AnimateIn";
import { BANCOS, getBanco } from "@/lib/bancos";

interface Cuenta { id: number; banco: string; cuit: string; alias: string; activa: boolean }
interface Cheque {
  id: number;
  tipo: string;
  formato: string;
  numero: string;
  banco: string;
  monto: number;
  fechaEmision: string;
  fechaCobro: string;
  cuentaId: number | null;
  cuenta?: Cuenta;
  librador: string | null;
  cuitLibrador: string | null;
  clienteCod: string | null;
  proveedorCod: string | null;
  proveedorNombre: string | null;
  estado: string;
  observaciones: string | null;
  usuario: string | null;
  createdAt: string;
  reemplaza?: { id: number; numero: string } | null;
  reemplazadoPor?: { id: number; numero: string } | null;
}
interface Resumen {
  enCirculacion: { cantidad: number; total: number };
  enCartera: { cantidad: number; total: number };
  porBanco: Array<{ banco: string; cantidad: number; total: number }>;
}
interface Proveedor { cod: string; nombre: string }

const ESTADO_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  "en-circulacion": { label: "En circulacion", color: "text-orange-700", bg: "bg-orange-100" },
  "en-cartera": { label: "En cartera", color: "text-blue-700", bg: "bg-blue-100" },
  "pagado": { label: "Pagado", color: "text-green-700", bg: "bg-green-100" },
  "depositado": { label: "Depositado", color: "text-green-700", bg: "bg-green-100" },
  "rechazado": { label: "Rechazado", color: "text-red-700", bg: "bg-red-100" },
  "anulado": { label: "Anulado", color: "text-gray-500", bg: "bg-gray-100" },
  "endosado": { label: "Endosado", color: "text-purple-700", bg: "bg-purple-100" },
  "canjeado": { label: "Canjeado", color: "text-indigo-700", bg: "bg-indigo-100" },
  "pagado-efectivo": { label: "Pagado efectivo", color: "text-green-700", bg: "bg-green-100" },
};

function formatDate(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysUntil(s: string): number {
  const d = new Date(s);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ChequesPage() {
  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"propio" | "tercero">("propio");
  const [estadoFiltro, setEstadoFiltro] = useState("");
  const [search, setSearch] = useState("");
  const [cuentaFiltro, setCuentaFiltro] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showCuentas, setShowCuentas] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [replacingId, setReplacingId] = useState<number | null>(null);
  const [replacingInfo, setReplacingInfo] = useState<{ numero: string; monto: number } | null>(null);

  // Endosar modal state
  const [endosarCheque, setEndosarCheque] = useState<Cheque | null>(null);
  const [endosarProvCod, setEndosarProvCod] = useState("");
  const [endosarProvSearch, setEndosarProvSearch] = useState("");
  const ready = useDataReady(cheques.length || loading ? cheques : null);

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [fNumero, setFNumero] = useState("");
  const [fBanco, setFBanco] = useState("");
  const [fFormato, setFFormato] = useState("fisico");
  const [fMonto, setFMonto] = useState("");
  const [fFechaEmision, setFFechaEmision] = useState(today);
  const [fFechaCobro, setFFechaCobro] = useState(today);
  const [fCuentaId, setFCuentaId] = useState("");
  const [fLibrador, setFLibrador] = useState("");
  const [fCuitLibrador, setFCuitLibrador] = useState("");
  const [fProveedorCod, setFProveedorCod] = useState("");
  const [fProveedorSearch, setFProveedorSearch] = useState("");
  const [fObs, setFObs] = useState("");

  // Cuenta form state
  const [cBanco, setCBanco] = useState("");
  const [cCuit, setCCuit] = useState("");
  const [cAlias, setCAlias] = useState("");

  async function loadCheques() {
    setLoading(true);
    const params = new URLSearchParams({ tipo: tab });
    if (estadoFiltro) params.set("estado", estadoFiltro);
    if (search) params.set("search", search);
    if (cuentaFiltro) params.set("cuentaId", cuentaFiltro);
    try {
      const res = await fetch(`/api/admin/cheques?${params}`);
      const d = await res.json();
      setCheques(d.cheques || []);
      setResumen(d.resumen || null);
    } catch {}
    setLoading(false);
  }

  async function loadCuentas() {
    try {
      const res = await fetch("/api/admin/cheques/cuentas");
      const d = await res.json();
      setCuentas(d.cuentas || []);
    } catch {}
  }

  async function loadProveedores() {
    try {
      const res = await fetch("/api/admin/proveedores");
      const d = await res.json();
      setProveedores(d.proveedores || []);
    } catch {}
  }

  useEffect(() => { loadCheques(); }, [tab, estadoFiltro, search, cuentaFiltro]); // eslint-disable-line
  useEffect(() => { loadCuentas(); loadProveedores(); }, []);

  function resetForm() {
    setFNumero(""); setFBanco(""); setFFormato("fisico"); setFMonto("");
    setFFechaEmision(today); setFFechaCobro(today);
    setFCuentaId(""); setFLibrador(""); setFCuitLibrador("");
    setFProveedorCod(""); setFProveedorSearch(""); setFObs("");
    setEditingId(null);
    setReplacingId(null);
    setReplacingInfo(null);
  }

  function openCanjear(c: Cheque) {
    resetForm();
    // Pre-populate the new cheque form with info from the old one
    setFFormato(c.formato || "fisico");
    setFBanco(c.banco);
    setFMonto(String(c.monto));
    setFFechaEmision(today);
    setFFechaCobro(today);
    if (c.cuentaId) setFCuentaId(String(c.cuentaId));
    if (c.librador) setFLibrador(c.librador);
    if (c.cuitLibrador) setFCuitLibrador(c.cuitLibrador);
    if (c.proveedorCod) setFProveedorCod(c.proveedorCod);
    if (c.proveedorNombre) setFProveedorSearch(c.proveedorNombre);
    setFObs(`Reemplaza al cheque #${c.numero}`);
    setReplacingId(c.id);
    setReplacingInfo({ numero: c.numero, monto: Number(c.monto) });
    setShowForm(true);
  }

  function openNew() { resetForm(); setShowForm(true); }

  function openEdit(c: Cheque) {
    setFNumero(c.numero);
    setFBanco(c.banco);
    setFFormato(c.formato || "fisico");
    setFMonto(String(c.monto));
    setFFechaEmision(c.fechaEmision.slice(0, 10));
    setFFechaCobro(c.fechaCobro.slice(0, 10));
    setFCuentaId(c.cuentaId ? String(c.cuentaId) : "");
    setFLibrador(c.librador || "");
    setFCuitLibrador(c.cuitLibrador || "");
    setFProveedorCod(c.proveedorCod || "");
    setFProveedorSearch(c.proveedorNombre || "");
    setFObs(c.observaciones || "");
    setEditingId(c.id);
    setShowForm(true);
  }

  async function saveCheque() {
    if (!fNumero || !fBanco || !fMonto || !fFechaCobro) return;
    const provMatch = proveedores.find((p) => p.cod === fProveedorCod);
    const payload = {
      tipo: tab,
      formato: fFormato,
      numero: fNumero, banco: fBanco, monto: fMonto,
      fechaEmision: fFechaEmision, fechaCobro: fFechaCobro,
      cuentaId: fCuentaId || null,
      librador: fLibrador || null,
      cuitLibrador: fCuitLibrador || null,
      proveedorCod: fProveedorCod || null,
      proveedorNombre: provMatch?.nombre || null,
      observaciones: fObs || null,
      reemplazaId: replacingId || null,
    };
    if (editingId) {
      await fetch("/api/admin/cheques", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, ...payload }),
      });
    } else {
      await fetch("/api/admin/cheques", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
    setShowForm(false);
    resetForm();
    loadCheques();
  }

  async function updateEstado(id: number, estado: string) {
    await fetch("/api/admin/cheques", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado }),
    });
    loadCheques();
  }

  function openEndosar(c: Cheque) {
    setEndosarCheque(c);
    setEndosarProvCod(c.proveedorCod || "");
    setEndosarProvSearch(c.proveedorNombre || "");
  }

  async function confirmEndosar() {
    if (!endosarCheque || !endosarProvCod) return;
    const prov = proveedores.find((p) => p.cod === endosarProvCod);
    if (!prov) return;
    await fetch("/api/admin/cheques", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: endosarCheque.id,
        estado: "endosado",
        proveedorCod: endosarProvCod,
        proveedorNombre: prov.nombre,
      }),
    });
    setEndosarCheque(null);
    setEndosarProvCod("");
    setEndosarProvSearch("");
    loadCheques();
  }

  async function deleteCheque(id: number) {
    if (!confirm("Eliminar este cheque?")) return;
    await fetch(`/api/admin/cheques?id=${id}`, { method: "DELETE" });
    loadCheques();
  }

  async function saveCuenta() {
    if (!cBanco || !cCuit || !cAlias) return;
    await fetch("/api/admin/cheques/cuentas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ banco: cBanco, cuit: cCuit, alias: cAlias }),
    });
    setCBanco(""); setCCuit(""); setCAlias("");
    loadCuentas();
  }

  async function deleteCuenta(id: number) {
    if (!confirm("Eliminar esta cuenta? No afecta los cheques ya cargados.")) return;
    await fetch(`/api/admin/cheques/cuentas?id=${id}`, { method: "DELETE" });
    loadCuentas();
  }

  // Filter proveedor search
  const filteredProveedores = fProveedorSearch.length > 1
    ? proveedores.filter((p) => p.nombre.toLowerCase().includes(fProveedorSearch.toLowerCase())).slice(0, 8)
    : [];

  return (
    <PageTransition className="max-w-6xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Cheques</h1>
            <p className="text-sm text-gray-500">Control de cheques propios emitidos y de terceros.</p>
          </div>
          <button onClick={() => setShowCuentas(true)} className={`p-2 text-gray-500 hover:bg-gray-100 rounded-lg ${springBtn}`} title="Administrar cuentas bancarias">
            <HiOutlineCog className="w-5 h-5" />
          </button>
        </div>
      </Stagger>

      {/* Summary cards */}
      {resumen && (
        <Stagger delay={50}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-orange-50 border-2 border-orange-200 rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-orange-700">{tab === "propio" ? resumen.enCirculacion.cantidad : 0}</div>
              <div className="text-xs text-orange-600">{tab === "propio" ? "En circulacion" : "—"}</div>
              {tab === "propio" && <div className="text-sm font-semibold text-orange-700 mt-1">{formatPrice(resumen.enCirculacion.total)}</div>}
            </div>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 text-center shadow-sm">
              <div className="text-2xl font-bold text-blue-700">{tab === "tercero" ? resumen.enCartera.cantidad : 0}</div>
              <div className="text-xs text-blue-600">{tab === "tercero" ? "En cartera" : "—"}</div>
              {tab === "tercero" && <div className="text-sm font-semibold text-blue-700 mt-1">{formatPrice(resumen.enCartera.total)}</div>}
            </div>
            <div className="bg-white border rounded-xl p-3 shadow-sm col-span-2 sm:col-span-2">
              <div className="text-xs text-gray-500 mb-2 text-center">Por banco</div>
              <div className="flex flex-wrap justify-center gap-2">
                {tab === "propio" && resumen.porBanco.length > 0 ? resumen.porBanco.map((b) => {
                  const bi = getBanco(b.banco);
                  return (
                    <div key={b.banco} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 ${bi ? bi.bgSoft : "bg-gray-50"}`}>
                      {bi ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bi.logo} alt={bi.nombre} className="w-8 h-8 rounded-lg shrink-0 object-contain bg-white border" />
                      ) : (
                        <HiOutlineOfficeBuilding className="w-5 h-5 text-gray-400" />
                      )}
                      <div className="text-xs">
                        <div className="font-bold text-gray-900">{b.cantidad} cheques</div>
                        <div className="font-semibold text-gray-700">{formatPrice(b.total)}</div>
                      </div>
                    </div>
                  );
                }) : <div className="text-sm text-gray-400">Sin datos</div>}
              </div>
            </div>
          </div>
        </Stagger>
      )}

      {/* Tabs */}
      <Stagger delay={100}>
        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => { setTab("propio"); setEstadoFiltro(""); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${springBtn} ${tab === "propio" ? "bg-orange-500 text-white" : "bg-white border text-gray-700 hover:bg-gray-50"}`}>
            <HiOutlineOfficeBuilding className="w-4 h-4 inline mr-1" />
            Propios (emitidos)
          </button>
          <button onClick={() => { setTab("tercero"); setEstadoFiltro(""); }}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${springBtn} ${tab === "tercero" ? "bg-blue-500 text-white" : "bg-white border text-gray-700 hover:bg-gray-50"}`}>
            <HiOutlineUser className="w-4 h-4 inline mr-1" />
            Terceros (recibidos)
          </button>
          <div className="flex-1" />
          <button onClick={openNew} className={`flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 ${springBtn}`}>
            <HiOutlinePlus className="w-4 h-4" />
            Nuevo cheque
          </button>
        </div>
      </Stagger>

      {/* Filters */}
      <Stagger delay={120}>
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar numero, banco, librador..."
              className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
          </div>
          {tab === "propio" && cuentas.length > 0 && (
            <select value={cuentaFiltro} onChange={(e) => setCuentaFiltro(e.target.value)}
              className={`px-3 py-2 rounded-xl text-xs font-medium border ${cuentaFiltro ? "bg-brand-500 text-white border-brand-500" : "bg-white text-gray-600 border-gray-200"}`}>
              <option value="">Todas las empresas</option>
              {cuentas.map((cu) => (
                <option key={cu.id} value={cu.id}>{cu.alias} (CUIT {cu.cuit})</option>
              ))}
            </select>
          )}
          {(tab === "tercero" ? ["", "en-cartera", "depositado", "endosado", "rechazado"] : ["", "en-circulacion", "pagado", "rechazado"]).map((e) => (
            <button key={e || "all"} onClick={() => setEstadoFiltro(e)}
              className={`px-3 py-2 rounded-xl text-xs font-medium ${springBtn} ${estadoFiltro === e ? "bg-brand-500 text-white" : "bg-white border text-gray-600 hover:bg-gray-50"}`}>
              {e ? ESTADO_LABELS[e]?.label || e : "Todos"}
            </button>
          ))}
        </div>
      </Stagger>

      {/* Cheque list */}
      {loading ? <LoadingCenter text="Cargando cheques..." /> : cheques.length === 0 ? (
        <div className="text-center py-12 bg-white border rounded-xl shadow-sm">
          <p className="text-gray-400 text-lg mb-2">No hay cheques {tab === "propio" ? "propios" : "de terceros"}</p>
          <button onClick={openNew} className={`mt-3 px-4 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold ${springBtn}`}>
            <HiOutlinePlus className="w-4 h-4 inline mr-1" />
            Cargar el primero
          </button>
        </div>
      ) : (
        <Stagger delay={150}>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {cheques.map((c, i) => {
              const estadoInfo = ESTADO_LABELS[c.estado] || { label: c.estado, color: "text-gray-700", bg: "bg-gray-100" };
              const bancoInfo = getBanco(c.banco);
              const dias = daysUntil(c.fechaCobro);
              const pendiente = c.estado !== "pagado" && c.estado !== "depositado" && c.estado !== "anulado" && c.estado !== "rechazado";
              // Legal expiration: 30 days from fechaCobro
              const vencido = dias < -30 && pendiente;
              // Within the 30-day presentation window but past fecha cobro
              const enVentana = dias < 0 && dias >= -30 && pendiente;
              const hoy = dias === 0;
              const proximo = dias > 0 && dias <= 7;
              return (
                <div key={c.id} style={staggerStyle(ready, i, 150, 40)}
                  className={`bg-white border-[8px] rounded-xl shadow-sm p-4 transition-all duration-200 hover:shadow-md ${
                    vencido ? "border-red-600" : enVentana ? "border-orange-500" : hoy ? "border-amber-500" : proximo ? "border-yellow-400" : "border-gray-400"
                  }`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      {bancoInfo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={bancoInfo.logo} alt={bancoInfo.nombre} className="w-12 h-12 rounded-xl shadow-sm shrink-0 object-contain bg-white border" />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-gray-200 text-gray-500 flex items-center justify-center shrink-0">
                          <HiOutlineOfficeBuilding className="w-5 h-5" />
                        </div>
                      )}
                      <div>
                        <div className="text-xs text-gray-400">#{c.numero}</div>
                        <div className="text-xs font-semibold text-gray-700">{c.banco}</div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${estadoInfo.bg} ${estadoInfo.color}`}>
                        {estadoInfo.label}
                      </span>
                      {c.formato && (
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${c.formato === "echeq" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                          {c.formato === "echeq" ? "ECHEQ" : "FISICO"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-gray-900 mb-1">{formatPrice(Number(c.monto))}</div>
                  {c.cuenta && (
                    <div className="text-xs text-gray-500 mb-2">CUIT {c.cuenta.alias}</div>
                  )}
                  <div className={`text-xs font-medium mb-2 flex items-center gap-1 ${
                    vencido ? "text-red-600" : enVentana ? "text-orange-600" : hoy ? "text-amber-600" : proximo ? "text-yellow-600" : "text-gray-600"
                  }`}>
                    <HiOutlineClock className="w-3 h-3" />
                    Cobro: {formatDate(c.fechaCobro)}
                    {vencido && ` (VENCIDO hace ${-dias - 30} dias)`}
                    {enVentana && ` (a cobrar — quedan ${30 + dias} dias)`}
                    {hoy && " (HOY)"}
                    {proximo && ` (en ${dias} dias)`}
                  </div>
                  {c.proveedorNombre && (
                    <div className="text-xs text-gray-500 mb-1">
                      <span className="text-gray-400">Para: </span>
                      <span className="font-medium">{c.proveedorNombre}</span>
                    </div>
                  )}
                  {c.librador && (
                    <div className="text-xs text-gray-500 mb-1">
                      <span className="text-gray-400">De: </span>
                      <span className="font-medium">{c.librador}</span>
                    </div>
                  )}
                  {c.reemplaza && (
                    <div className="text-xs text-indigo-600 bg-indigo-50 rounded px-2 py-1 mt-1 font-medium">
                      <HiOutlineRefresh className="w-3 h-3 inline mr-1" />
                      Reemplaza al #{c.reemplaza.numero}
                    </div>
                  )}
                  {c.reemplazadoPor && (
                    <div className="text-xs text-indigo-600 bg-indigo-50 rounded px-2 py-1 mt-1 font-medium">
                      <HiOutlineRefresh className="w-3 h-3 inline mr-1" />
                      Canjeado por #{c.reemplazadoPor.numero}
                    </div>
                  )}
                  {c.observaciones && (
                    <div className="text-xs text-gray-400 italic mt-1">{c.observaciones}</div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 pt-3 border-t flex flex-wrap gap-1.5">
                    {pendiente && (
                      <button onClick={() => updateEstado(c.id, tab === "propio" ? "pagado" : "depositado")}
                        className={`flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 ${springBtn}`}>
                        <HiOutlineCheck className="w-3 h-3" />
                        {tab === "propio" ? "Pagado" : "Depositar"}
                      </button>
                    )}
                    {/* Endosar: only for tercero cheques in cartera */}
                    {tab === "tercero" && pendiente && (
                      <button onClick={() => openEndosar(c)}
                        className={`flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium hover:bg-purple-200 ${springBtn}`}
                        title="Endosar este cheque a un proveedor">
                        <HiOutlineArrowRight className="w-3 h-3" />
                        Endosar
                      </button>
                    )}
                    {/* For vencido or en-ventana cheques, allow canje and pago efectivo */}
                    {pendiente && (vencido || enVentana) && (
                      <>
                        <button onClick={() => openCanjear(c)}
                          className={`flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-200 ${springBtn}`}
                          title="El cliente lo cambio por otro cheque nuevo — se abre el formulario para cargarlo">
                          <HiOutlineRefresh className="w-3 h-3" />
                          Canjear
                        </button>
                        <button onClick={() => updateEstado(c.id, "pagado-efectivo")}
                          className={`flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium hover:bg-green-200 ${springBtn}`}
                          title="Lo pago en efectivo">
                          <HiOutlineCurrencyDollar className="w-3 h-3" />
                          Efectivo
                        </button>
                      </>
                    )}
                    {c.estado !== "rechazado" && pendiente && (
                      <button onClick={() => updateEstado(c.id, "rechazado")}
                        className={`flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium hover:bg-red-200 ${springBtn}`}>
                        <HiOutlineX className="w-3 h-3" />
                        Rechazado
                      </button>
                    )}
                    <button onClick={() => openEdit(c)}
                      className={`flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs font-medium hover:bg-gray-200 ${springBtn}`}>
                      <HiOutlinePencil className="w-3 h-3" />
                      Editar
                    </button>
                    <button onClick={() => deleteCheque(c.id)}
                      className={`flex items-center gap-1 px-2 py-1 text-red-500 rounded text-xs font-medium hover:bg-red-50 ${springBtn}`}>
                      <HiOutlineTrash className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Stagger>
      )}

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b sticky top-0 bg-white z-10 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">
                {replacingId ? "Canjear cheque" : editingId ? "Editar" : "Nuevo"} cheque {tab === "propio" ? "propio" : "de tercero"}
              </h2>
              <button onClick={() => setShowForm(false)} className={`text-gray-400 ${springBtn}`}>
                <HiOutlineX className="w-6 h-6" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              {replacingId && replacingInfo && (
                <div className="bg-indigo-50 border-2 border-indigo-200 rounded-xl p-3 flex items-start gap-2">
                  <HiOutlineRefresh className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-indigo-800">Canjeando cheque #{replacingInfo.numero}</div>
                    <div className="text-xs text-indigo-700 mt-0.5">
                      Monto original: {formatPrice(replacingInfo.monto)}. Al guardar, el cheque viejo quedara como &quot;Canjeado&quot; y vinculado a este nuevo.
                    </div>
                  </div>
                </div>
              )}
              {/* Formato: fisico / echeq */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Tipo de cheque</label>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setFFormato("fisico")}
                    className={`py-3 rounded-xl font-semibold transition-all ${springBtn} ${fFormato === "fisico" ? "bg-brand-500 text-white shadow-md" : "bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                    <HiOutlineDocumentText className="w-5 h-5 inline mr-1" />
                    Fisico
                  </button>
                  <button type="button" onClick={() => setFFormato("echeq")}
                    className={`py-3 rounded-xl font-semibold transition-all ${springBtn} ${fFormato === "echeq" ? "bg-brand-500 text-white shadow-md" : "bg-white border-2 border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
                    <HiOutlineDeviceMobile className="w-5 h-5 inline mr-1" />
                    Echeq
                  </button>
                </div>
              </div>

              {/* Banco - quick select with brand colors */}
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Banco</label>
                <div className="grid grid-cols-3 gap-2">
                  {BANCOS.map((b) => {
                    const isSelected = fBanco.toUpperCase().includes(b.key);
                    return (
                      <button key={b.key} type="button"
                        onClick={() => {
                          setFBanco(b.nombre);
                          if (tab === "propio") {
                            const cu = cuentas.find((x) => x.banco.toUpperCase().includes(b.key));
                            if (cu) setFCuentaId(String(cu.id));
                          }
                        }}
                        className={`p-2 rounded-xl transition-all border-2 ${springBtn} ${isSelected ? `${b.border} shadow-md scale-105 ring-2 ring-offset-1 ${b.border.replace("border", "ring")}` : `bg-white border-gray-200 hover:${b.bgSoft} hover:${b.border}`}`}>
                        <div className="flex flex-col items-center gap-1">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={b.logo} alt={b.nombre} className="w-14 h-14 rounded-lg object-contain bg-white" />
                          <div className="text-xs font-semibold text-gray-700">{b.nombre}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <input type="text" value={fBanco} onChange={(e) => setFBanco(e.target.value)}
                  placeholder="O escribi otro banco..."
                  className="w-full mt-2 px-4 py-2 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              </div>

              {tab === "propio" && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Cuenta (CUIT)</label>
                  <select value={fCuentaId} onChange={(e) => {
                    setFCuentaId(e.target.value);
                    const cu = cuentas.find((x) => String(x.id) === e.target.value);
                    if (cu) setFBanco(cu.banco);
                  }}
                    className="w-full px-4 py-3 border border-brand-400 rounded-xl text-base focus:outline-none focus:border-brand-600">
                    <option value="">Seleccionar cuenta...</option>
                    {cuentas.filter((cu) => !fBanco || cu.banco.toUpperCase().includes(fBanco.toUpperCase().split(" ")[0])).map((cu) => (
                      <option key={cu.id} value={cu.id}>{cu.alias} — CUIT {cu.cuit}</option>
                    ))}
                  </select>
                  {cuentas.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">Primero cargá una cuenta con el icono de configuracion arriba.</p>
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Numero</label>
                  <input type="text" value={fNumero} onChange={(e) => setFNumero(e.target.value)}
                    placeholder="12345678" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Monto</label>
                  <input type="number" step="0.01" value={fMonto} onChange={(e) => setFMonto(e.target.value)}
                    placeholder="0.00" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500 font-bold" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha emision</label>
                  <input type="date" value={fFechaEmision} onChange={(e) => setFFechaEmision(e.target.value)}
                    className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Fecha cobro</label>
                  <input type="date" value={fFechaCobro} onChange={(e) => setFFechaCobro(e.target.value)}
                    className="w-full px-4 py-3 border border-brand-400 rounded-xl text-base focus:outline-none focus:border-brand-600 font-medium" />
                </div>
              </div>
              {tab === "tercero" && (
                <>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">Librador (quien lo emitio)</label>
                    <input type="text" value={fLibrador} onChange={(e) => setFLibrador(e.target.value)}
                      placeholder="Nombre o razon social" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">CUIT del librador</label>
                    <input type="text" value={fCuitLibrador} onChange={(e) => setFCuitLibrador(e.target.value)}
                      placeholder="Opcional" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                  </div>
                </>
              )}
              <div className="relative" style={{ zIndex: filteredProveedores.length > 0 ? 60 : "auto" }}>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Proveedor {tab === "tercero" && "(si ya lo endosaste)"}</label>
                <input type="text" value={fProveedorSearch} onChange={(e) => { setFProveedorSearch(e.target.value); setFProveedorCod(""); }}
                  placeholder="Buscar proveedor..." className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                {filteredProveedores.length > 0 && !fProveedorCod && (
                  <div className="absolute left-0 right-0 z-50 mt-1 bg-white border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                    {filteredProveedores.map((p) => (
                      <button key={p.cod} type="button"
                        onClick={() => { setFProveedorCod(p.cod); setFProveedorSearch(p.nombre); }}
                        className={`w-full px-4 py-2 text-left text-sm ${hoverRow}`}>
                        {p.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Observaciones</label>
                <textarea value={fObs} onChange={(e) => setFObs(e.target.value)}
                  rows={2} placeholder="Opcional" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-sm focus:outline-none focus:border-brand-500" />
              </div>
              <div className="flex gap-2 pt-2">
                <button onClick={() => setShowForm(false)} className={`flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold ${springBtn}`}>
                  Cancelar
                </button>
                <button onClick={saveCheque} disabled={!fNumero || !fBanco || !fMonto || !fFechaCobro}
                  className={`flex-1 py-3 bg-brand-500 text-white rounded-xl font-semibold disabled:opacity-50 ${springBtn}`}>
                  {editingId ? "Guardar" : "Crear"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Endosar modal */}
      {endosarCheque && (() => {
        const filteredProvs = endosarProvSearch.length > 1 && !endosarProvCod
          ? proveedores.filter((p) => p.nombre.toLowerCase().includes(endosarProvSearch.toLowerCase())).slice(0, 8)
          : [];
        return (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEndosarCheque(null)}>
            <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="p-5 border-b sticky top-0 bg-white z-10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HiOutlineArrowRight className="w-5 h-5 text-purple-600" />
                  <h2 className="text-lg font-bold text-gray-900">Endosar cheque</h2>
                </div>
                <button onClick={() => setEndosarCheque(null)} className={`text-gray-400 ${springBtn}`}>
                  <HiOutlineX className="w-6 h-6" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div className="bg-purple-50 border-2 border-purple-200 rounded-xl p-4">
                  <div className="text-xs text-purple-600 mb-1">Cheque a endosar</div>
                  <div className="text-sm font-semibold text-gray-900">{endosarCheque.banco} #{endosarCheque.numero}</div>
                  <div className="text-lg font-bold text-gray-900 mt-1">{formatPrice(Number(endosarCheque.monto))}</div>
                  {endosarCheque.librador && (
                    <div className="text-xs text-gray-500 mt-1">Librador: {endosarCheque.librador}</div>
                  )}
                  <div className="text-xs text-gray-500">Cobro: {formatDate(endosarCheque.fechaCobro)}</div>
                </div>
                <div className="relative" style={{ zIndex: filteredProvs.length > 0 ? 60 : "auto" }}>
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Proveedor destinatario</label>
                  <input type="text" value={endosarProvSearch}
                    onChange={(e) => { setEndosarProvSearch(e.target.value); setEndosarProvCod(""); }}
                    placeholder="Buscar proveedor..."
                    className="w-full px-4 py-3 border border-purple-400 rounded-xl text-base focus:outline-none focus:border-purple-600" />
                  {filteredProvs.length > 0 && (
                    <div className="absolute left-0 right-0 z-50 mt-1 bg-white border rounded-xl shadow-lg max-h-56 overflow-y-auto">
                      {filteredProvs.map((p) => (
                        <button key={p.cod} type="button"
                          onClick={() => { setEndosarProvCod(p.cod); setEndosarProvSearch(p.nombre); }}
                          className={`w-full px-4 py-2 text-left text-sm ${hoverRow}`}>
                          {p.nombre}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-gray-500">
                  Al confirmar, el cheque queda marcado como <strong>Endosado</strong> al proveedor elegido. El monto sale de tu cartera.
                </p>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => setEndosarCheque(null)} className={`flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-semibold ${springBtn}`}>
                    Cancelar
                  </button>
                  <button onClick={confirmEndosar} disabled={!endosarProvCod}
                    className={`flex-1 py-3 bg-purple-600 text-white rounded-xl font-semibold disabled:opacity-50 ${springBtn}`}>
                    Endosar
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cuentas modal */}
      {showCuentas && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setShowCuentas(false)}>
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b sticky top-0 bg-white z-10 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Cuentas bancarias</h2>
              <button onClick={() => setShowCuentas(false)} className={`text-gray-400 ${springBtn}`}>
                <HiOutlineX className="w-6 h-6" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-2">
                {cuentas.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay cuentas cargadas.</p>
                ) : cuentas.map((cu) => (
                  <div key={cu.id} className="flex items-center justify-between bg-gray-50 rounded-xl p-3">
                    <div>
                      <div className="font-semibold text-gray-900">{cu.alias}</div>
                      <div className="text-xs text-gray-500">{cu.banco} — CUIT {cu.cuit}</div>
                    </div>
                    <button onClick={() => deleteCuenta(cu.id)} className={`text-red-500 p-2 hover:bg-red-50 rounded-lg ${springBtn}`}>
                      <HiOutlineTrash className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t pt-4 space-y-2">
                <h3 className="text-sm font-semibold text-gray-700">Agregar cuenta nueva</h3>
                <input type="text" value={cAlias} onChange={(e) => setCAlias(e.target.value)}
                  placeholder="Alias (ej: Galicia Empresa 1)" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                <input type="text" value={cBanco} onChange={(e) => setCBanco(e.target.value)}
                  placeholder="Banco" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                <input type="text" value={cCuit} onChange={(e) => setCCuit(e.target.value)}
                  placeholder="CUIT" className="w-full px-4 py-3 border border-gray-300 rounded-xl text-base focus:outline-none focus:border-brand-500" />
                <button onClick={saveCuenta} disabled={!cAlias || !cBanco || !cCuit}
                  className={`w-full py-3 bg-brand-500 text-white rounded-xl font-semibold disabled:opacity-50 ${springBtn}`}>
                  <HiOutlinePlus className="w-4 h-4 inline mr-1" />
                  Agregar cuenta
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </PageTransition>
  );
}
