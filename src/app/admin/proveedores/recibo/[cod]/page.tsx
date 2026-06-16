"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { formatPrice } from "@/lib/utils";
import { numeroEnLetras } from "@/lib/numeroEnLetras";
import { BANCOS } from "@/lib/bancos";
import { HiOutlinePlus, HiOutlineTrash, HiOutlineCamera } from "react-icons/hi";
import { PageTransition, Stagger, springBtn, LoadingCenter } from "@/components/AnimateIn";
import ChequeCameraCapture from "@/components/ChequeCameraCapture";

interface Proveedor {
  cod: string;
  nombre: string;
  saldo: number;
}

interface Cuenta {
  id: number;
  banco: string;
  cuit: string;
  alias: string;
  activa: boolean;
}

interface ChequeRow {
  uid: string;
  tipo: "propio" | "tercero";
  formato: "fisico" | "echeq";
  banco: string;
  numero: string;
  fechaEmision: string;
  fechaCobro: string;
  monto: string;
  cuentaId: string;
  librador: string;
  cuitLibrador: string;
  fotoDataUrls: string[]; // can be 0..N images per cheque
}

function newCheque(): ChequeRow {
  const today = new Date().toISOString().slice(0, 10);
  return {
    uid: Math.random().toString(36).slice(2),
    tipo: "propio",
    formato: "fisico",
    banco: BANCOS[0]?.nombre || "",
    numero: "",
    fechaEmision: today,
    fechaCobro: today,
    monto: "",
    cuentaId: "",
    librador: "",
    cuitLibrador: "",
    fotoDataUrls: [],
  };
}

function parseAmt(s: string): number {
  if (!s) return 0;
  let v = s.trim();
  if (v.includes(",")) v = v.replace(/\./g, "").replace(",", ".");
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

export default function NuevoReciboPage() {
  const router = useRouter();
  const params = useParams();
  const cod = String(params?.cod || "");
  const { data: session } = useSession();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";

  const [proveedor, setProveedor] = useState<Proveedor | null>(null);
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [loading, setLoading] = useState(true);

  const [cheques, setCheques] = useState<ChequeRow[]>([]);
  const [efectivoMonto, setEfectivoMonto] = useState("");
  const [efectivoFotos, setEfectivoFotos] = useState<string[]>([]);
  const [transferenciaMonto, setTransferenciaMonto] = useState("");
  const [transferenciaRef, setTransferenciaRef] = useState("");
  const [ajusteMonto, setAjusteMonto] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [concepto, setConcepto] = useState("");

  const [cameraOpen, setCameraOpen] = useState<string | null>(null); // uid del cheque cuya foto se esta capturando
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/proveedores").then((r) => r.json()),
      fetch("/api/admin/cheques/cuentas").then((r) => r.json()).catch(() => ({ cuentas: [] })),
    ])
      .then(([provData, cuentasData]) => {
        const list = (provData.proveedores || []) as Proveedor[];
        const found = list.find((p) => p.cod === cod) || null;
        setProveedor(found);
        setCuentas((cuentasData.cuentas || []).filter((c: Cuenta) => c.activa));
      })
      .finally(() => setLoading(false));
  }, [cod]);

  const totalCheques = cheques.reduce((s, c) => s + parseAmt(c.monto), 0);
  const totalEfectivo = parseAmt(efectivoMonto);
  const totalTransferencia = parseAmt(transferenciaMonto);
  // Ajuste can be negative (e.g. "-150" para descuento por error de calculo)
  const totalAjuste = isAdmin ? (() => {
    const s = ajusteMonto.trim();
    if (!s) return 0;
    const neg = s.startsWith("-");
    const n = parseAmt(s.replace(/^-/, ""));
    return neg ? -n : n;
  })() : 0;
  const total = Math.round((totalCheques + totalEfectivo + totalTransferencia + totalAjuste) * 100) / 100;

  function updateCheque(uid: string, patch: Partial<ChequeRow>) {
    setCheques((prev) => prev.map((c) => (c.uid === uid ? { ...c, ...patch } : c)));
  }

  function removeCheque(uid: string) {
    setCheques((prev) => prev.filter((c) => c.uid !== uid));
  }

  function onCameraCapture(dataUrl: string) {
    if (!cameraOpen) return;
    // The cheque-aspect crop camera is only for cheques. Efectivo never uses it now —
    // remito documents shouldn't be cropped to cheque shape.
    setCheques((prev) => prev.map((c) =>
      c.uid === cameraOpen ? { ...c, fotoDataUrls: [...c.fotoDataUrls, dataUrl] } : c
    ));
    setCameraOpen(null);
  }

  function addChequeFiles(uid: string, files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((f) => {
      const r = new FileReader();
      r.onload = (ev) => {
        const dataUrl = String(ev.target?.result || "");
        if (dataUrl) {
          setCheques((prev) => prev.map((c) =>
            c.uid === uid ? { ...c, fotoDataUrls: [...c.fotoDataUrls, dataUrl] } : c
          ));
        }
      };
      r.readAsDataURL(f);
    });
  }

  function addEfectivoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    Array.from(files).forEach((f) => {
      const r = new FileReader();
      r.onload = (ev) => {
        const dataUrl = String(ev.target?.result || "");
        if (dataUrl) setEfectivoFotos((prev) => [...prev, dataUrl]);
      };
      r.readAsDataURL(f);
    });
  }

  async function handleSubmit() {
    if (!proveedor) return;
    setError("");

    if (total <= 0) {
      setError("El total debe ser mayor a 0");
      return;
    }
    for (const c of cheques) {
      if (!c.numero.trim()) { setError("Cheque sin numero"); return; }
      if (parseAmt(c.monto) <= 0) { setError(`Cheque #${c.numero}: importe invalido`); return; }
      if (c.tipo === "propio" && !c.cuentaId) { setError(`Cheque #${c.numero}: falta seleccionar cuenta propia`); return; }
      if (c.tipo === "tercero" && !c.librador.trim()) { setError(`Cheque #${c.numero}: falta librador`); return; }
    }

    setSaving(true);
    try {
      const body = {
        proveedorCod: proveedor.cod,
        proveedorName: proveedor.nombre,
        cheques: cheques.map((c) => ({
          tipo: c.tipo,
          formato: c.formato,
          numero: c.numero.trim(),
          banco: c.banco,
          monto: parseAmt(c.monto),
          fechaEmision: c.fechaEmision,
          fechaCobro: c.fechaCobro,
          cuentaId: c.tipo === "propio" && c.cuentaId ? Number(c.cuentaId) : null,
          librador: c.tipo === "tercero" ? c.librador.trim() : null,
          cuitLibrador: c.tipo === "tercero" ? c.cuitLibrador.trim() : null,
          fotoDataUrls: c.fotoDataUrls.length > 0 ? c.fotoDataUrls : null,
        })),
        efectivo: totalEfectivo > 0 ? { monto: totalEfectivo, imagenesDataUrls: efectivoFotos.length > 0 ? efectivoFotos : null } : null,
        transferencia: totalTransferencia > 0 ? { monto: totalTransferencia, referencia: transferenciaRef.trim() || null } : null,
        ajuste: (isAdmin && totalAjuste !== 0) ? { monto: totalAjuste, motivo: ajusteMotivo.trim() || null } : null,
        concepto: concepto.trim() || null,
      };
      const res = await fetch("/api/admin/proveedores/recibos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");

      // Open PDF in new tab
      window.open(`/api/admin/proveedores/recibos/${data.paymentId}/pdf`, "_blank");
      router.push("/admin/proveedores");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingCenter />;
  if (!proveedor) {
    return (
      <PageTransition className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-gray-500">Proveedor no encontrado.</p>
        <button onClick={() => router.push("/admin/proveedores")} className="mt-3 text-brand-600 hover:underline text-sm">
          Volver a Proveedores
        </button>
      </PageTransition>
    );
  }

  return (
    <PageTransition className="max-w-4xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Nuevo recibo de pago</h1>
          <button onClick={() => router.push("/admin/proveedores")} className="text-sm text-gray-500 hover:text-gray-700">
            Cancelar
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Proveedor: <span className="font-medium text-gray-800">{proveedor.nombre}</span>
          {isAdmin && (
            <>
              {" · saldo actual "}
              <span className={proveedor.saldo > 0 ? "text-red-600 font-medium" : proveedor.saldo < 0 ? "text-green-700 font-medium" : "text-gray-400"}>
                {proveedor.saldo > 0
                  ? formatPrice(proveedor.saldo)
                  : proveedor.saldo < 0
                  ? `A favor ${formatPrice(Math.abs(proveedor.saldo))}`
                  : "—"}
              </span>
            </>
          )}
        </p>
      </Stagger>

      {/* Cheques */}
      <Stagger delay={50}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-gray-700">Cheques</h2>
          <button
            type="button"
            onClick={() => setCheques((p) => [...p, newCheque()])}
            className={`flex items-center gap-1 text-sm text-white bg-brand-500 px-3 py-1.5 rounded-lg hover:bg-brand-600 ${springBtn}`}
          >
            <HiOutlinePlus className="w-4 h-4" /> Agregar cheque
          </button>
        </div>
        {cheques.length === 0 ? (
          <p className="text-xs text-gray-400">Sin cheques. Pode agregar arriba.</p>
        ) : (
          <div className="space-y-3">
            {cheques.map((c, idx) => (
              <div key={c.uid} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-600">Cheque #{idx + 1}</span>
                  <button type="button" onClick={() => removeCheque(c.uid)} className="text-red-500 hover:text-red-700" aria-label="Quitar">
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                    <select value={c.tipo} onChange={(e) => updateCheque(c.uid, { tipo: e.target.value as "propio" | "tercero" })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                      <option value="propio">Propio</option>
                      <option value="tercero">3ero</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Formato</label>
                    <select value={c.formato} onChange={(e) => updateCheque(c.uid, { formato: e.target.value as "fisico" | "echeq" })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                      <option value="fisico">Fisico</option>
                      <option value="echeq">ECHEQ</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Banco</label>
                    <select value={c.banco} onChange={(e) => updateCheque(c.uid, { banco: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                      {BANCOS.map((b) => <option key={b.key} value={b.nombre}>{b.nombre}</option>)}
                      <option value="">Otro...</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">N°</label>
                    <input value={c.numero} onChange={(e) => updateCheque(c.uid, { numero: e.target.value })}
                      placeholder="Numero" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Emision</label>
                    <input type="date" value={c.fechaEmision} onChange={(e) => updateCheque(c.uid, { fechaEmision: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cobro</label>
                    <input type="date" value={c.fechaCobro} onChange={(e) => updateCheque(c.uid, { fechaCobro: e.target.value })}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Importe</label>
                    <input type="text" inputMode="decimal" value={c.monto}
                      onChange={(e) => updateCheque(c.uid, { monto: e.target.value.replace(/[^0-9.,]/g, "") })}
                      placeholder="0,00" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  </div>
                  <div className="flex items-end gap-1">
                    <button
                      type="button"
                      onClick={() => setCameraOpen(c.uid)}
                      className={`flex-1 flex items-center justify-center gap-1 text-sm text-brand-600 border border-brand-300 rounded py-1.5 hover:bg-brand-50 ${springBtn}`}
                      title="Tomar foto con la camara (con recuadro de cheque)"
                    >
                      <HiOutlineCamera className="w-4 h-4" />
                      {c.fotoDataUrls.length > 0 ? `Mas (${c.fotoDataUrls.length})` : "Foto"}
                    </button>
                    <label className="flex items-center justify-center gap-1 text-sm text-brand-600 border border-brand-300 rounded py-1.5 px-2 hover:bg-brand-50 cursor-pointer" title="Subir foto/s del celular">
                      +
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => { addChequeFiles(c.uid, e.target.files); e.target.value = ""; }}
                      />
                    </label>
                  </div>
                </div>
                {c.tipo === "propio" ? (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Cuenta propia</label>
                    {cuentas.length === 0 ? (
                      <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-xs">
                        <span className="text-amber-700">No hay cuentas propias cargadas.</span>
                        <a
                          href="/admin/cheques?showCuentas=1"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-600 hover:underline font-medium"
                        >
                          Crear cuenta →
                        </a>
                      </div>
                    ) : (
                      <select value={c.cuentaId} onChange={(e) => updateCheque(c.uid, { cuentaId: e.target.value })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm bg-white">
                        <option value="">Seleccionar cuenta...</option>
                        {cuentas.map((cu) => (
                          <option key={cu.id} value={cu.id}>{cu.alias} — {cu.banco} ({cu.cuit})</option>
                        ))}
                      </select>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Librador</label>
                      <input value={c.librador} onChange={(e) => updateCheque(c.uid, { librador: e.target.value })}
                        placeholder="Nombre" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">CUIT librador</label>
                      <input value={c.cuitLibrador} onChange={(e) => updateCheque(c.uid, { cuitLibrador: e.target.value })}
                        placeholder="20-12345678-9" className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm" />
                    </div>
                  </div>
                )}
                {c.fotoDataUrls.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {c.fotoDataUrls.map((url, idx) => (
                      <div key={idx} className="relative">
                        <img src={url} alt={`cheque ${idx + 1}`} className="h-20 rounded border" />
                        <button
                          type="button"
                          onClick={() => updateCheque(c.uid, { fotoDataUrls: c.fotoDataUrls.filter((_, i) => i !== idx) })}
                          className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none flex items-center justify-center"
                          aria-label="Quitar"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      </Stagger>

      {/* Efectivo */}
      <Stagger delay={100}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Efectivo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end mb-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Importe</label>
            <input type="text" inputMode="decimal" value={efectivoMonto}
              onChange={(e) => setEfectivoMonto(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="0,00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="flex items-center gap-1 text-sm text-brand-600 border border-brand-300 rounded-lg px-3 py-2 hover:bg-brand-50 cursor-pointer">
              <HiOutlineCamera className="w-4 h-4" />
              <span>{efectivoFotos.length > 0 ? `Agregar mas (${efectivoFotos.length})` : "Subir foto/s del remito"}</span>
              <input
                type="file"
                accept="image/*"
                multiple
                capture="environment"
                className="hidden"
                onChange={(e) => { addEfectivoFiles(e.target.files); e.target.value = ""; }}
              />
            </label>
          </div>
        </div>
        {efectivoFotos.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {efectivoFotos.map((url, idx) => (
              <div key={idx} className="relative">
                <img src={url} alt={`remito ${idx + 1}`} className="h-20 rounded border" />
                <button
                  type="button"
                  onClick={() => setEfectivoFotos((prev) => prev.filter((_, i) => i !== idx))}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none flex items-center justify-center"
                  aria-label="Quitar"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      </Stagger>

      {/* Transferencia */}
      <Stagger delay={150}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <h2 className="text-sm font-medium text-gray-700 mb-3">Transferencia</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Importe</label>
            <input type="text" inputMode="decimal" value={transferenciaMonto}
              onChange={(e) => setTransferenciaMonto(e.target.value.replace(/[^0-9.,]/g, ""))}
              placeholder="0,00" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Referencia (opcional)</label>
            <input value={transferenciaRef} onChange={(e) => setTransferenciaRef(e.target.value)}
              placeholder="N° operacion" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
          </div>
        </div>
      </div>
      </Stagger>

      {/* Ajuste — admin only, for tax / rounding mismatches */}
      {isAdmin && (
        <Stagger delay={175}>
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-sm font-medium text-amber-800">Ajuste (solo admin)</h2>
            <span className="text-xs text-amber-700">Para diferencias por impuestos / redondeo. Puede ser negativo.</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-amber-700 mb-1">Importe (use - para descuento)</label>
              <input
                type="text"
                inputMode="decimal"
                value={ajusteMonto}
                onChange={(e) => setAjusteMonto(e.target.value.replace(/[^0-9.,-]/g, ""))}
                placeholder="0,00 o -150"
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs text-amber-700 mb-1">Motivo</label>
              <input
                value={ajusteMotivo}
                onChange={(e) => setAjusteMotivo(e.target.value)}
                placeholder="Ej: IIBB no calculado / redondeo factura"
                className="w-full px-3 py-2 border border-amber-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
        </Stagger>
      )}

      {/* Concepto */}
      <Stagger delay={200}>
      <div className="bg-white border border-gray-200 rounded-xl p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">Concepto / Notas</label>
        <textarea value={concepto} onChange={(e) => setConcepto(e.target.value)}
          rows={2} placeholder="Pago Factura N°..." className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none" />
      </div>
      </Stagger>

      {/* Total + submit */}
      <Stagger delay={250}>
      <div className="bg-brand-50 border-2 border-brand-300 rounded-xl p-4 mb-4">
        <div className="flex items-baseline justify-between mb-1">
          <span className="text-sm text-gray-600">Total a pagar:</span>
          <span className="text-2xl font-bold text-brand-700">{formatPrice(total)}</span>
        </div>
        {total > 0 && (
          <p className="text-xs text-gray-500 italic">{numeroEnLetras(total)}</p>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving || total <= 0}
          className={`flex-1 px-6 py-3 text-sm font-medium text-white bg-brand-500 rounded-xl hover:bg-brand-600 disabled:opacity-50 ${springBtn}`}
        >
          {saving ? "Guardando..." : "Guardar y generar PDF"}
        </button>
        <button
          onClick={() => router.push("/admin/proveedores")}
          disabled={saving}
          className={`px-4 py-3 text-sm text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-50 ${springBtn}`}
        >
          Cancelar
        </button>
      </div>
      </Stagger>

      <ChequeCameraCapture
        open={cameraOpen !== null}
        onCapture={onCameraCapture}
        onClose={() => setCameraOpen(null)}
      />
    </PageTransition>
  );
}
