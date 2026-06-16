"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePlus, HiOutlineCash, HiOutlineChevronDown, HiOutlineDocumentDownload, HiOutlineReceiptTax } from "react-icons/hi";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, useDataReady, CollapsiblePanel } from "@/components/AnimateIn";
import ConfirmModal from "@/components/ConfirmModal";

interface Proveedor {
  cod: string;
  nombre: string;
  cuit?: string;
  alias?: string;
  cbu?: string;
  saldo: number;
}

interface ProvEntry {
  id: number;
  createdAt: string;
  estado: string;
  total: number;
  itemCount: number;
  usuario: string;
  notas: string | null;
  nroFactura: string | null;
}

interface ProvPayment {
  id: number;
  monto: number;
  concepto: string | null;
  usuario: string;
  createdAt: string;
  efectivoImagenes?: string[];
  tipoPago?: string | null;
  pdfUrl?: string | null;
  driveUrl?: string | null;
  anuladoAt?: string | null;
  anuladoBy?: string | null;
}

export default function ProveedoresPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const hasCosteo = user?.role === "admin" || (user?.permissions?.includes("costeo") ?? false);
  const isAdmin = user?.role === "admin";
  const hasRecibos = user?.role === "admin" || (user?.permissions?.includes("recibos") ?? false);

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState<"nombre" | "saldo">("nombre");
  const [soloConDeuda, setSoloConDeuda] = useState(false);
  const [soloSaldoAFavor, setSoloSaldoAFavor] = useState(false);

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCuit, setNewCuit] = useState("");
  const [newAlias, setNewAlias] = useState("");
  const [newCbu, setNewCbu] = useState("");
  // Inline edit state per proveedor cod — one row at a time across CUIT / Alias / CBU
  const [editingField, setEditingField] = useState<{ cod: string; field: "cuit" | "alias" | "cbu" } | null>(null);
  const [editingVal, setEditingVal] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Payment form
  const [payingProv, setPayingProv] = useState<Proveedor | null>(null);
  const [payMonto, setPayMonto] = useState("");
  const [payConcepto, setPayConcepto] = useState("");
  const [payingSaving, setPayingSaving] = useState(false);
  const [payError, setPayError] = useState("");
  const [payImagenFiles, setPayImagenFiles] = useState<File[]>([]);
  const [payImagenPreviews, setPayImagenPreviews] = useState<string[]>([]);

  // Anular recibo confirm modal
  const [anularTarget, setAnularTarget] = useState<{ id: number; monto: number; tipoPago: string | null; cod: string } | null>(null);
  const [anularLoading, setAnularLoading] = useState(false);
  const [anularError, setAnularError] = useState("");

  // Ajuste manual de saldo (admin only)
  const [ajusteDelta, setAjusteDelta] = useState("");
  const [ajusteMotivo, setAjusteMotivo] = useState("");
  const [ajusteSaving, setAjusteSaving] = useState(false);
  const [ajusteError, setAjusteError] = useState("");

  // Marcas asociadas (admin only)
  const [marcaModalCod, setMarcaModalCod] = useState<string | null>(null);
  const [marcaAvailable, setMarcaAvailable] = useState<Array<{ cod: string; nombre: string; logoUrl: string | null }>>([]);
  const [marcaSelected, setMarcaSelected] = useState<string[]>([]);
  const [marcaFilter, setMarcaFilter] = useState("");
  const [marcasLoading, setMarcasLoading] = useState(false);
  const [marcasSaving, setMarcasSaving] = useState(false);
  // Per-cod cache for the chip rendering in the panel
  const [marcasByCod, setMarcasByCod] = useState<Record<string, Array<{ marcaCod: string; nombre: string; logoUrl: string | null }>>>({});

  // Supplier entries (purchase history)
  const [expandedProv, setExpandedProv] = useState<string | null>(null);
  const [provEntries, setProvEntries] = useState<ProvEntry[]>([]);
  const [provPayments, setProvPayments] = useState<ProvPayment[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Date filter for history
  const [filterDesde, setFilterDesde] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [filterHasta, setFilterHasta] = useState(() => new Date().toISOString().slice(0, 10));

  const dataReady = useDataReady(!loading && proveedores);

  function loadData() {
    setLoading(true);
    fetch("/api/admin/proveedores")
      .then((r) => r.json())
      .then((data) => setProveedores(data.proveedores || []))
      .catch(() => setProveedores([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadData();
  }, []);

  async function loadMarcasAssoc(cod: string) {
    setMarcasLoading(true);
    try {
      const r = await fetch(`/api/admin/proveedores/marcas?cod=${encodeURIComponent(cod)}`);
      const data = await r.json();
      if (r.ok) {
        setMarcaAvailable(data.available || []);
        setMarcaSelected((data.associated || []).map((a: { marcaCod: string }) => a.marcaCod));
        setMarcasByCod((prev) => ({ ...prev, [cod]: data.associated || [] }));
      }
    } finally {
      setMarcasLoading(false);
    }
  }

  async function saveMarcasAssoc() {
    if (!marcaModalCod) return;
    setMarcasSaving(true);
    try {
      const r = await fetch("/api/admin/proveedores/marcas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod: marcaModalCod, marcaCods: marcaSelected }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error || "Error al guardar marcas");
      }
      // Refresh the chips for this cod
      await loadMarcasAssoc(marcaModalCod);
      setMarcaModalCod(null);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setMarcasSaving(false);
    }
  }

  // When a panel opens, fetch its marca chips
  useEffect(() => {
    if (expandedProv && !marcasByCod[expandedProv]) {
      fetch(`/api/admin/proveedores/marcas?cod=${encodeURIComponent(expandedProv)}`)
        .then((r) => r.json())
        .then((d) => setMarcasByCod((prev) => ({ ...prev, [expandedProv]: d.associated || [] })))
        .catch(() => {});
    }
  }, [expandedProv, marcasByCod]);

  async function aplicarAjuste(cod: string, currentSaldo: number, preset?: "zero") {
    setAjusteError("");
    let delta: number;
    if (preset === "zero") {
      delta = -currentSaldo;
    } else {
      let s = ajusteDelta.trim();
      const neg = s.startsWith("-");
      if (neg) s = s.slice(1);
      if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
      const n = parseFloat(s);
      if (!isFinite(n) || n === 0) {
        setAjusteError("Ingresá un monto distinto de 0");
        return;
      }
      delta = neg ? -n : n;
    }
    if (!ajusteMotivo.trim() && preset !== "zero") {
      setAjusteError("Pone un motivo");
      return;
    }
    const motivo = preset === "zero" && !ajusteMotivo.trim()
      ? "Llevar saldo a 0"
      : ajusteMotivo.trim();
    setAjusteSaving(true);
    try {
      const r = await fetch("/api/admin/proveedores/ajuste-saldo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod, delta, motivo }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Error");
      setAjusteDelta("");
      setAjusteMotivo("");
      loadData();
      if (expandedProv === cod) {
        toggleProvEntries(cod);
        setTimeout(() => toggleProvEntries(cod), 250);
      }
    } catch (e) {
      setAjusteError(e instanceof Error ? e.message : "Error");
    } finally {
      setAjusteSaving(false);
    }
  }

  async function confirmAnular() {
    if (!anularTarget) return;
    setAnularError("");
    setAnularLoading(true);
    try {
      const res = await fetch(`/api/admin/proveedores/recibos/${anularTarget.id}/anular`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      const cod = anularTarget.cod;
      setAnularTarget(null);
      loadData();
      if (expandedProv === cod) {
        // Force refresh of the open panel
        toggleProvEntries(cod);
        setTimeout(() => toggleProvEntries(cod), 250);
      }
    } catch (e) {
      setAnularError((e as Error).message || "Error al anular");
    } finally {
      setAnularLoading(false);
    }
  }

  function toggleProvEntries(cod: string) {
    if (expandedProv === cod) {
      setExpandedProv(null);
      setProvEntries([]);
      setProvPayments([]);
      return;
    }
    setExpandedProv(cod);
    setLoadingEntries(true);
    Promise.all([
      fetch(`/api/admin/stock-entries?proveedor=${encodeURIComponent(cod)}&estado=all&limit=20`).then((r) => r.json()).catch(() => ({ entries: [] })),
      fetch(`/api/admin/proveedores/payments?cod=${encodeURIComponent(cod)}`).then((r) => r.json()).catch(() => ({ payments: [] })),
    ])
      .then(([entriesData, paymentsData]) => {
        setProvEntries(entriesData.entries || []);
        setProvPayments(paymentsData.payments || []);
      })
      .finally(() => setLoadingEntries(false));
  }

  async function handleAdd() {
    if (!newName.trim()) {
      setError("Nombre requerido");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/proveedores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: newName.trim(),
          cuit: newCuit.trim(),
          alias: newAlias.trim(),
          cbu: newCbu.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setNewName("");
      setNewCuit("");
      setNewAlias("");
      setNewCbu("");
      setShowAdd(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  async function saveField(cod: string, field: "cuit" | "alias" | "cbu") {
    setSavingEdit(true);
    try {
      const res = await fetch("/api/admin/proveedores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod, [field]: editingVal.trim() }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Error");
      }
      setEditingField(null);
      setEditingVal("");
      loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Error al guardar ${field}`);
    } finally {
      setSavingEdit(false);
    }
  }

  async function handlePayment() {
    if (!payingProv || !payMonto) return;
    // Parse both formats: 1.197.207,12 (AR) or 3857323.4 (numeric keypad)
    let montoStr = payMonto.trim();
    if (montoStr.includes(",")) {
      // Argentine format: dots are thousands, comma is decimal
      montoStr = montoStr.replace(/\./g, "").replace(",", ".");
    }
    const monto = parseFloat(montoStr);
    if (isNaN(monto) || monto <= 0) {
      setPayError("Monto inválido");
      return;
    }
    if (!payConcepto.trim()) {
      setPayError("Elegí una forma de pago (Efectivo, Transferencia o Cheque)");
      return;
    }
    setPayError("");
    setPayingSaving(true);
    try {
      // Upload all efectivo images in parallel
      const efectivoImagenes: string[] = [];
      if (payConcepto === "Efectivo" && payImagenFiles.length > 0) {
        const uploads = await Promise.all(payImagenFiles.map(async (f) => {
          const fd = new FormData();
          fd.append("image", f);
          const upRes = await fetch("/api/admin/proveedores/upload-pago-imagen", { method: "POST", body: fd });
          if (!upRes.ok) {
            const upErr = await upRes.json().catch(() => ({}));
            throw new Error(upErr.error || "Error al subir imagen");
          }
          const upData = await upRes.json();
          return upData.url as string;
        }));
        efectivoImagenes.push(...uploads.filter((u): u is string => !!u));
      }
      const res = await fetch("/api/admin/proveedores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod: payingProv.cod, monto, concepto: payConcepto.trim(), efectivoImagenes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      const provCod = payingProv.cod;
      setPayingProv(null);
      setPayMonto("");
      setPayConcepto("");
      setPayImagenFiles([]);
      setPayImagenPreviews([]);
      loadData();
      // Refresh history if this supplier is expanded
      if (expandedProv === provCod) {
        toggleProvEntries(provCod);
        setTimeout(() => toggleProvEntries(provCod), 300);
      }
    } catch (err) {
      setPayError(err instanceof Error ? err.message : "Error al registrar pago");
    } finally {
      setPayingSaving(false);
    }
  }

  function buildMovements(prov: Proveedor) {
    const desdeDate = filterDesde ? new Date(filterDesde + "T00:00:00") : null;
    const hastaDate = filterHasta ? new Date(filterHasta + "T23:59:59") : null;
    const all = [
      ...provEntries.map((e) => ({ type: "entry" as const, date: e.createdAt, data: e })),
      ...provPayments.map((pay) => ({ type: "payment" as const, date: pay.createdAt, data: pay })),
    ]
      .filter((item) => {
        const d = new Date(item.date);
        if (desdeDate && d < desdeDate) return false;
        if (hastaDate && d > hastaDate) return false;
        return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // Running balance
    let bal = prov.saldo;
    const allFull = [
      ...provEntries.map((e) => ({ type: "entry" as const, date: e.createdAt, data: e })),
      ...provPayments.map((pay) => ({ type: "payment" as const, date: pay.createdAt, data: pay })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const balMap = new Map<string, number>();
    for (const item of allFull) {
      const key = `${item.type}-${(item.data as { id: number }).id}`;
      balMap.set(key, bal);
      if (item.type === "entry") bal -= (item.data as ProvEntry).total;
      else {
        const pay = item.data as ProvPayment;
        if (!pay.anuladoAt) bal += pay.monto;
      }
    }

    return all.map((item) => {
      const key = `${item.type}-${(item.data as { id: number }).id}`;
      const saldo = balMap.get(key) ?? 0;
      if (item.type === "entry") {
        const e = item.data as ProvEntry;
        return { fecha: new Date(e.createdAt).toLocaleDateString("es-AR"), tipo: "Compra", detalle: `${e.itemCount} productos${e.nroFactura ? " - Fact: " + e.nroFactura : ""} (${e.estado})`, debe: e.total, haber: 0, saldo };
      } else {
        const pay = item.data as ProvPayment;
        return { fecha: new Date(pay.createdAt).toLocaleDateString("es-AR"), tipo: "Pago", detalle: `${pay.concepto || "Pago"} - por ${pay.usuario}`, debe: 0, haber: pay.monto, saldo };
      }
    });
  }

  async function exportPDF(prov: Proveedor) {
    const rows = buildMovements(prov);
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297;
    const pageH = 210;
    const date = new Date().toLocaleDateString("es-AR");
    const colX = { fecha: 12, tipo: 40, detalle: 65, debe: 185, haber: 220, saldo: 280 };
    const rowH = 7;
    let pageNum = 1;

    function drawHeader() {
      // Title bar
      doc.setFillColor(251, 161, 71);
      doc.rect(0, 0, pageW, 18, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255);
      doc.text(`Estado de Cuenta`, 14, 8);
      doc.setFontSize(11);
      doc.text(prov.nombre, 14, 14);
      doc.setFontSize(9);
      doc.text(`Período: ${filterDesde} al ${filterHasta}`, pageW - 14, 8, { align: "right" });
      doc.text(`Generado: ${date}`, pageW - 14, 14, { align: "right" });
      doc.setTextColor(0);

      // Saldo actual box
      doc.setFillColor(prov.saldo > 0 ? 254 : 240, prov.saldo > 0 ? 226 : 253, prov.saldo > 0 ? 226 : 240);
      doc.roundedRect(pageW - 80, 22, 66, 10, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(prov.saldo > 0 ? 180 : 100, prov.saldo > 0 ? 30 : 100, prov.saldo > 0 ? 30 : 100);
      doc.text(`Saldo actual: ${formatPrice(prov.saldo)}`, pageW - 47, 28, { align: "center" });
      doc.setTextColor(0);
    }

    function drawTableHeader(y: number): number {
      // Column header background
      doc.setFillColor(55, 65, 81);
      doc.rect(10, y, pageW - 20, rowH, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(255);
      doc.text("Fecha", colX.fecha, y + 5);
      doc.text("Tipo", colX.tipo, y + 5);
      doc.text("Detalle", colX.detalle, y + 5);
      doc.text("Debe", colX.debe, y + 5, { align: "right" });
      doc.text("Haber", colX.haber, y + 5, { align: "right" });
      doc.text("Saldo", colX.saldo, y + 5, { align: "right" });
      doc.setTextColor(0);
      return y + rowH;
    }

    function drawFooter() {
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(`Página ${pageNum}`, pageW / 2, pageH - 5, { align: "center" });
      doc.text("DISTRIALMA — Estado de cuenta generado automáticamente", pageW / 2, pageH - 2, { align: "center" });
      doc.setTextColor(0);
    }

    // Page 1
    drawHeader();
    let y = drawTableHeader(36);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];

      if (y > pageH - 15) {
        drawFooter();
        doc.addPage();
        pageNum++;
        y = drawTableHeader(10);
      }

      // Alternating row background
      if (i % 2 === 0) {
        doc.setFillColor(249, 250, 251);
        doc.rect(10, y, pageW - 20, rowH, "F");
      }

      // Row border (bottom line)
      doc.setDrawColor(229, 231, 235);
      doc.line(10, y + rowH, pageW - 10, y + rowH);

      // Fecha
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(row.fecha, colX.fecha, y + 5);

      // Tipo badge
      if (row.tipo === "Compra") {
        doc.setFillColor(219, 234, 254);
        doc.roundedRect(colX.tipo - 1, y + 1, 18, 5, 1, 1, "F");
        doc.setTextColor(29, 78, 216);
        doc.setFontSize(7);
        doc.text("Compra", colX.tipo + 8, y + 4.5, { align: "center" });
      } else {
        doc.setFillColor(220, 252, 231);
        doc.roundedRect(colX.tipo - 1, y + 1, 14, 5, 1, 1, "F");
        doc.setTextColor(22, 163, 74);
        doc.setFontSize(7);
        doc.text("Pago", colX.tipo + 6, y + 4.5, { align: "center" });
      }

      // Detalle
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(55, 65, 81);
      doc.text(row.detalle.substring(0, 60), colX.detalle, y + 5);

      // Debe (red)
      if (row.debe > 0) {
        doc.setTextColor(220, 38, 38);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`+ ${formatPrice(row.debe)}`, colX.debe, y + 5, { align: "right" });
      }

      // Haber (green)
      if (row.haber > 0) {
        doc.setTextColor(22, 163, 74);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.text(`- ${formatPrice(row.haber)}`, colX.haber, y + 5, { align: "right" });
      }

      // Saldo
      doc.setTextColor(55, 65, 81);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(formatPrice(row.saldo), colX.saldo, y + 5, { align: "right" });

      y += rowH;
    }

    // Summary bar at bottom
    y += 3;
    doc.setFillColor(251, 161, 71);
    doc.rect(10, y, pageW - 20, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255);
    doc.text(`SALDO ACTUAL: ${formatPrice(prov.saldo)}`, pageW - 14, y + 5.5, { align: "right" });
    const totalDebe = rows.reduce((s, r) => s + r.debe, 0);
    const totalHaber = rows.reduce((s, r) => s + r.haber, 0);
    doc.setFontSize(8);
    doc.text(`Total compras: ${formatPrice(totalDebe)}   |   Total pagos: ${formatPrice(totalHaber)}   |   ${rows.length} movimientos`, 14, y + 5.5);

    drawFooter();

    const blob = doc.output("blob");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cuenta_${prov.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${filterDesde}_${filterHasta}.pdf`;
    a.click();
  }

  function exportCSV(prov: Proveedor) {
    const rows = buildMovements(prov);
    const header = "Fecha,Tipo,Detalle,Debe,Haber,Saldo\n";
    const csv = header + rows.map((r) =>
      `"${r.fecha}","${r.tipo}","${r.detalle}",${r.debe || ""},${r.haber || ""},${r.saldo}`
    ).join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cuenta_${prov.nombre.replace(/[^a-zA-Z0-9]/g, "_")}_${filterDesde}_${filterHasta}.csv`;
    a.click();
  }

  const filtered = (() => {
    let list = filter.trim()
      ? proveedores.filter((p) => p.nombre.toLowerCase().includes(filter.toLowerCase()))
      : proveedores.slice();
    if (soloConDeuda && soloSaldoAFavor) {
      // Both ticked = include positive AND negative saldos, drop only zeros
      list = list.filter((p) => p.saldo !== 0);
    } else if (soloConDeuda) {
      list = list.filter((p) => p.saldo > 0);
    } else if (soloSaldoAFavor) {
      list = list.filter((p) => p.saldo < 0);
    }
    if (sortBy === "saldo") {
      list.sort((a, b) => b.saldo - a.saldo);
    } else {
      list.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
    return list;
  })();

  return (
    <PageTransition className="max-w-3xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
          <button
            onClick={() => setShowAdd(!showAdd)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-brand-400 rounded-xl hover:bg-brand-500 transition-colors ${springBtn}`}
          >
            <HiOutlinePlus className="w-4 h-4" />
            Nuevo proveedor
          </button>
        </div>
      </Stagger>

      {/* Add form */}
      {showAdd && (
        <Stagger delay={50} y={6}>
          <div className="bg-gray-50 rounded-xl border shadow-sm p-4 mb-4">
            <div className="flex flex-wrap gap-3 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre del proveedor"
                  className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CUIT (opcional)
                </label>
                <input
                  type="text"
                  value={newCuit}
                  onChange={(e) => setNewCuit(e.target.value)}
                  placeholder="20-12345678-9"
                  maxLength={14}
                  className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alias (opcional)
                </label>
                <input
                  type="text"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                  placeholder="alias.del.banco"
                  maxLength={40}
                  className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  CBU (opcional)
                </label>
                <input
                  type="text"
                  value={newCbu}
                  onChange={(e) => setNewCbu(e.target.value)}
                  placeholder="22 digitos"
                  maxLength={22}
                  className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm font-mono focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                />
              </div>
              <button
                onClick={handleAdd}
                disabled={saving}
                className={`px-4 py-2 text-sm text-white bg-brand-400 rounded-xl hover:bg-brand-500 disabled:opacity-50 transition-colors ${springBtn}`}
              >
                {saving ? "Guardando..." : "Guardar"}
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewName(""); setError(""); }}
                disabled={saving}
                className={`px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors ${springBtn}`}
              >
                Cancelar
              </button>
            </div>
            {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
          </div>
        </Stagger>
      )}

      {/* Payment form */}
      {payingProv && (
        <Stagger delay={50} y={6}>
          <div className="bg-green-50 rounded-xl border border-green-200 shadow-sm p-4 mb-4">
            <h3 className="text-sm font-medium text-gray-900 mb-2">
              Registrar pago a: <span className="text-green-700">{payingProv.nombre}</span>
            </h3>
            <p className="text-xs text-gray-500 mb-3">
              Saldo actual: <span className="font-medium text-red-600">{formatPrice(payingProv.saldo)}</span>
            </p>
            <div className="flex gap-3 items-end flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="block text-xs text-gray-500 mb-1">Monto</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={payMonto}
                  onChange={(e) => {
                    // Accept digits, comma and dot
                    const val = e.target.value.replace(/[^0-9.,]/g, "");
                    setPayMonto(val);
                  }}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                />
              </div>
              <div className="flex-1 min-w-[150px]">
                <label className="block text-xs text-gray-500 mb-1">Forma de pago</label>
                <select
                  value={payConcepto}
                  onChange={(e) => { setPayConcepto(e.target.value); if (e.target.value !== "Efectivo") { setPayImagenFiles([]); setPayImagenPreviews([]); } }}
                  className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 bg-white"
                >
                  <option value="">Seleccionar...</option>
                  <option value="Efectivo">Efectivo</option>
                  <option value="Transferencia">Transferencia</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <button
                onClick={handlePayment}
                disabled={payingSaving}
                className={`px-4 py-2 text-sm text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors ${springBtn}`}
              >
                {payingSaving ? "Registrando..." : "Registrar pago"}
              </button>
              <button
                onClick={() => { setPayingProv(null); setPayMonto(""); setPayConcepto(""); setPayError(""); setPayImagenFiles([]); setPayImagenPreviews([]); }}
                disabled={payingSaving}
                className={`px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-colors ${springBtn}`}
              >
                Cancelar
              </button>
            </div>
            {payConcepto === "Efectivo" && (
              <div className="mt-3 flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-2 px-3 py-2 text-sm text-green-700 bg-white border border-green-300 rounded-xl cursor-pointer hover:bg-green-100">
                  <span>{payImagenFiles.length > 0 ? `Agregar mas (${payImagenFiles.length} cargada${payImagenFiles.length === 1 ? "" : "s"})` : "Subir foto/s del remito (opcional)"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const newFiles = Array.from(e.target.files || []);
                      if (newFiles.length === 0) return;
                      setPayImagenFiles((prev) => [...prev, ...newFiles]);
                      newFiles.forEach((f) => {
                        const r = new FileReader();
                        r.onload = (ev) => setPayImagenPreviews((prev) => [...prev, String(ev.target?.result || "")]);
                        r.readAsDataURL(f);
                      });
                      e.target.value = ""; // allow reselect of same file
                    }}
                  />
                </label>
                {payImagenPreviews.map((url, idx) => (
                  <div key={idx} className="relative">
                    <img src={url} alt={`preview ${idx + 1}`} className="w-20 h-20 object-cover rounded border" />
                    <button
                      type="button"
                      onClick={() => {
                        setPayImagenFiles((prev) => prev.filter((_, i) => i !== idx));
                        setPayImagenPreviews((prev) => prev.filter((_, i) => i !== idx));
                      }}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full text-xs leading-none flex items-center justify-center"
                      aria-label="Quitar"
                    >
                      ×
                    </button>
                  </div>))}
              </div>
            )}
            {payError && <p className="text-sm text-red-600 mt-2">{payError}</p>}
          </div>
        </Stagger>
      )}

      {/* Filter + sort + solo con deuda */}
      <Stagger delay={80} y={6}>
        <div className="flex flex-wrap gap-2 items-center mb-4">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filtrar proveedores..."
            className="flex-1 min-w-[200px] px-4 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as "nombre" | "saldo")}
            className="px-3 py-2 border border-brand-400 rounded-xl text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 bg-white"
          >
            <option value="nombre">Orden: Nombre</option>
            <option value="saldo">Orden: Mayor deuda</option>
          </select>
          {isAdmin && (
            <>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={soloConDeuda}
                  onChange={(e) => setSoloConDeuda(e.target.checked)}
                  className="accent-brand-500"
                />
                Solo con deuda
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={soloSaldoAFavor}
                  onChange={(e) => setSoloSaldoAFavor(e.target.checked)}
                  className="accent-brand-500"
                />
                Con saldo a favor
              </label>
            </>
          )}
          <span className="text-xs text-gray-400 ml-auto">{filtered.length} proveedores</span>
        </div>
      </Stagger>

      {loading ? (
        <LoadingCenter text="Cargando proveedores..." />
      ) : (
        <Stagger delay={150} y={8}>
          <div className="bg-white rounded-xl border shadow-sm divide-y max-h-[60vh] overflow-y-auto">
            {filtered.map((p, idx) => {
              const isOpen = expandedProv === p.cod;
              return (
              <div key={p.cod} className={isOpen ? "bg-brand-50 border-l-4 border-l-brand-500 rounded-xl shadow-md my-1" : "bg-white border rounded-xl shadow-sm"} style={staggerStyle(dataReady, idx)}>
                <button
                  onClick={() => toggleProvEntries(p.cod)}
                  className={`w-full px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-left ${hoverRow} ${isOpen ? "bg-brand-50" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0 w-full sm:w-auto flex-wrap">
                    <HiOutlineChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? "rotate-0 text-brand-600" : "-rotate-90 text-gray-400"}`} />
                    <span className={`text-sm font-medium truncate ${isOpen ? "text-brand-700" : "text-gray-900"}`}>{p.nombre}</span>
                    <span className="text-xs text-gray-400 shrink-0">#{p.cod}</span>
                    {p.cuit && (
                      <span className="text-xs text-gray-500 font-mono shrink-0">CUIT {p.cuit}</span>
                    )}
                    {p.alias && (
                      <span className="text-xs text-gray-500 shrink-0">Alias {p.alias}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 shrink-0 pl-6 sm:pl-0 flex-wrap">
                    {isAdmin && (
                      <span
                        className={`text-sm font-medium ${
                          p.saldo > 0 ? "text-red-600" : p.saldo < 0 ? "text-green-700" : "text-gray-400"
                        }`}
                        title={p.saldo < 0 ? "Saldo a favor (cuenta de Distrialma)" : undefined}
                      >
                        {p.saldo > 0
                          ? formatPrice(p.saldo)
                          : p.saldo < 0
                          ? `A favor ${formatPrice(Math.abs(p.saldo))}`
                          : "\u2014"}
                      </span>
                    )}
                    {isAdmin && p.saldo > 0 && (
                      <span
                        onClick={(e) => { e.stopPropagation(); setPayingProv(p); setPayMonto(""); setPayConcepto(""); setPayError(""); }}
                        className={`flex items-center gap-1 px-2 py-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-xl hover:bg-green-100 transition-colors cursor-pointer ${springBtn}`}
                      >
                        <HiOutlineCash className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Pago rapido</span>
                        <span className="sm:hidden">Pago</span>
                      </span>
                    )}
                    {hasRecibos && (
                      <span
                        onClick={(e) => { e.stopPropagation(); router.push(`/admin/proveedores/recibo/${p.cod}`); }}
                        className={`flex items-center gap-1 px-2 py-1 text-xs text-brand-600 bg-brand-50 border border-brand-200 rounded-xl hover:bg-brand-100 transition-colors cursor-pointer ${springBtn}`}
                        title="Generar recibo con cheques / efectivo / transferencia"
                      >
                        <HiOutlineReceiptTax className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Nuevo recibo</span>
                        <span className="sm:hidden">Recibo</span>
                      </span>
                    )}
                  </div>
                </button>

                {/* Supplier history (entries + payments) */}
                <CollapsiblePanel open={isOpen}>
                  <div className="bg-brand-50/50 px-4 py-2 border-t border-brand-200">
                    {/* Datos del proveedor — CUIT / Alias / CBU, editable inline */}
                    {hasCosteo && (() => {
                      const fields: Array<{ key: "cuit" | "alias" | "cbu"; label: string; value: string; placeholder: string; max: number; mono: boolean }> = [
                        { key: "cuit",  label: "CUIT",  value: p.cuit  || "", placeholder: "20-12345678-9",   max: 14, mono: true },
                        { key: "alias", label: "Alias", value: p.alias || "", placeholder: "alias.del.banco", max: 40, mono: false },
                        { key: "cbu",   label: "CBU",   value: p.cbu   || "", placeholder: "22 digitos",      max: 22, mono: true },
                      ];
                      return (
                        <div className="flex flex-col gap-1 mb-2 text-xs">
                          {fields.map((f) => {
                            const isEditing = editingField?.cod === p.cod && editingField.field === f.key;
                            return (
                              <div key={f.key} className="flex items-center gap-2 flex-wrap">
                                <span className="text-gray-500 w-12 shrink-0">{f.label}:</span>
                                {isEditing ? (
                                  <>
                                    <input
                                      type="text"
                                      value={editingVal}
                                      onChange={(e) => setEditingVal(e.target.value)}
                                      placeholder={f.placeholder}
                                      maxLength={f.max}
                                      className={`px-2 py-1 border border-brand-400 rounded text-xs focus:outline-none focus:border-brand-600 ${f.mono ? "font-mono" : ""}`}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") saveField(p.cod, f.key);
                                        if (e.key === "Escape") { setEditingField(null); setEditingVal(""); }
                                      }}
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => saveField(p.cod, f.key)}
                                      disabled={savingEdit}
                                      className="px-2 py-1 rounded bg-brand-500 text-white hover:bg-brand-600 disabled:opacity-50"
                                    >
                                      {savingEdit ? "Guardando..." : "Guardar"}
                                    </button>
                                    <button
                                      onClick={() => { setEditingField(null); setEditingVal(""); }}
                                      disabled={savingEdit}
                                      className="px-2 py-1 rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                                    >
                                      Cancelar
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className={`${f.mono ? "font-mono" : ""} text-gray-800 break-all`}>
                                      {f.value || <span className="italic text-gray-400 font-sans">sin cargar</span>}
                                    </span>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); setEditingField({ cod: p.cod, field: f.key }); setEditingVal(f.value); }}
                                      className="text-brand-600 hover:underline"
                                    >
                                      {f.value ? "Editar" : "Cargar"}
                                    </button>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                    {/* Ajuste manual de saldo — admin only */}
                    {isAdmin && (
                      <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-baseline justify-between mb-2 flex-wrap gap-1">
                          <h4 className="text-xs font-medium text-amber-800">Ajuste manual de saldo</h4>
                          <span className="text-xs text-amber-700">+ suma al saldo, − resta. Para arreglar saldos historicos mal cargados.</span>
                        </div>
                        <div className="flex flex-wrap gap-2 items-end text-xs">
                          <div>
                            <label className="block text-amber-700 mb-0.5">Monto (con signo)</label>
                            <input
                              type="text"
                              inputMode="decimal"
                              value={ajusteDelta}
                              onChange={(e) => setAjusteDelta(e.target.value.replace(/[^0-9.,-]/g, ""))}
                              placeholder="-1500 o 1500"
                              className="px-2 py-1 border border-amber-300 rounded w-32"
                            />
                          </div>
                          <div className="flex-1 min-w-[180px]">
                            <label className="block text-amber-700 mb-0.5">Motivo</label>
                            <input
                              value={ajusteMotivo}
                              onChange={(e) => setAjusteMotivo(e.target.value)}
                              placeholder="Ej: error puntotouch / saldo arrastrado"
                              className="w-full px-2 py-1 border border-amber-300 rounded"
                            />
                          </div>
                          <button
                            onClick={() => aplicarAjuste(p.cod, p.saldo)}
                            disabled={ajusteSaving}
                            className="px-3 py-1.5 bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50"
                          >
                            {ajusteSaving ? "..." : "Aplicar"}
                          </button>
                          {p.saldo !== 0 && (
                            <button
                              onClick={() => aplicarAjuste(p.cod, p.saldo, "zero")}
                              disabled={ajusteSaving}
                              className="px-3 py-1.5 border border-amber-400 text-amber-800 bg-white rounded hover:bg-amber-100 disabled:opacity-50"
                              title={`Aplica un ajuste de ${p.saldo > 0 ? "-" : "+"}${Math.abs(p.saldo).toFixed(2)} para llevar el saldo a 0`}
                            >
                              Llevar a 0
                            </button>
                          )}
                        </div>
                        {ajusteError && <p className="text-xs text-red-600 mt-1">{ajusteError}</p>}
                      </div>
                    )}
                    {/* Marcas asociadas — admin only.  Manual override for the recibo PDF logos. */}
                    {isAdmin && (
                      <div className="mb-3 p-3 bg-white border border-gray-200 rounded-lg">
                        <div className="flex items-baseline justify-between gap-2 mb-2 flex-wrap">
                          <h4 className="text-xs font-medium text-gray-700">Marcas asociadas (logos del recibo)</h4>
                          <button
                            type="button"
                            onClick={() => { setMarcaModalCod(p.cod); loadMarcasAssoc(p.cod); }}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            Editar
                          </button>
                        </div>
                        {(() => {
                          const list = marcasByCod[p.cod];
                          if (list === undefined) return <p className="text-xs text-gray-400">Cargando…</p>;
                          if (list.length === 0) return <p className="text-xs text-gray-400">Sin marcas asociadas manualmente — uso el cruce automatico con productos para los logos del recibo.</p>;
                          return (
                            <div className="flex items-center flex-wrap gap-2">
                              {list.map((m) => (
                                <span key={m.marcaCod} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-50 border border-brand-200 text-xs text-brand-700">
                                  {m.logoUrl && <img src={m.logoUrl} alt={m.nombre} className="w-5 h-5 object-contain" />}
                                  {m.nombre}
                                </span>
                              ))}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {/* Date range filter + movements — admin only */}
                    {isAdmin && (<>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <label className="text-xs text-gray-500">Desde:</label>
                      <input
                        type="date"
                        value={filterDesde}
                        onChange={(e) => setFilterDesde(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-brand-600"
                      />
                      <label className="text-xs text-gray-500">Hasta:</label>
                      <input
                        type="date"
                        value={filterHasta}
                        onChange={(e) => setFilterHasta(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-brand-600"
                      />
                      <button
                        onClick={() => exportPDF(p)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100 ${springBtn}`}
                      >
                        <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                        PDF
                      </button>
                      <button
                        onClick={() => exportCSV(p)}
                        className={`flex items-center gap-1 px-2 py-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded hover:bg-green-100 ${springBtn}`}
                      >
                        <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                        Excel
                      </button>
                    </div>
                    {loadingEntries ? (
                      <LoadingCenter text="Cargando movimientos..." />
                    ) : provEntries.length === 0 && provPayments.length === 0 ? (
                      <p className="text-xs text-gray-400 py-1">Sin movimientos registrados</p>
                    ) : (() => {
                      // Merge, filter by date, sort desc
                      const desdeDate = filterDesde ? new Date(filterDesde + "T00:00:00") : null;
                      const hastaDate = filterHasta ? new Date(filterHasta + "T23:59:59") : null;
                      const allMovements = [
                        ...provEntries.map((e) => ({ type: "entry" as const, date: e.createdAt, data: e })),
                        ...provPayments.map((pay) => ({ type: "payment" as const, date: pay.createdAt, data: pay })),
                      ]
                        .filter((item) => {
                          const d = new Date(item.date);
                          if (desdeDate && d < desdeDate) return false;
                          if (hastaDate && d > hastaDate) return false;
                          return true;
                        })
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                      // Calculate running balance going backwards from current saldo
                      // Current saldo is after all movements. Going desc (newest first):
                      // balance[0] = p.saldo (after newest movement)
                      // For each movement going down: if entry (Compra +$), the balance BEFORE it was balance - total
                      // if payment (Pago -$), the balance BEFORE it was balance + monto
                      let runningBal = p.saldo;
                      // We need all movements (not just filtered) to calculate correct balances
                      const allMovsFull = [
                        ...provEntries.map((e) => ({ type: "entry" as const, date: e.createdAt, data: e })),
                        ...provPayments.map((pay) => ({ type: "payment" as const, date: pay.createdAt, data: pay })),
                      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                      const balanceMap = new Map<string, number>();
                      for (const item of allMovsFull) {
                        const key = `${item.type}-${(item.data as { id: number }).id}`;
                        balanceMap.set(key, runningBal);
                        if (item.type === "entry") {
                          runningBal -= (item.data as ProvEntry).total;
                        } else {
                          const pay = item.data as ProvPayment;
                          if (!pay.anuladoAt) {
                            runningBal += pay.monto;
                          }
                        }
                      }

                      if (allMovements.length === 0) {
                        return <p className="text-xs text-gray-400 py-1">Sin movimientos en el rango seleccionado</p>;
                      }

                      return (
                        <div className="space-y-1">
                          {allMovements.map((item, movIdx) => {
                            const key = `${item.type}-${(item.data as { id: number }).id}`;
                            const saldoAfter = balanceMap.get(key) ?? 0;

                            if (item.type === "entry") {
                              const entry = item.data as ProvEntry;
                              return (
                                <a
                                  key={`e-${entry.id}`}
                                  href={`/admin/compras/${entry.id}`}
                                  className={`flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-100 transition-colors`}
                                  style={staggerStyle(true, movIdx, 50, 20)}
                                >
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-500">
                                      {new Date(entry.createdAt).toLocaleDateString("es-AR")}
                                    </span>
                                    <span className="text-xs px-1.5 py-0.5 rounded bg-blue-100 text-blue-700">Compra</span>
                                    <span className="text-xs text-gray-600">
                                      {entry.itemCount} {entry.itemCount === 1 ? "producto" : "productos"}
                                    </span>
                                    <span
                                      className={`text-xs px-1.5 py-0.5 rounded ${
                                        entry.estado === "pendiente"
                                          ? "bg-yellow-100 text-yellow-700"
                                          : "bg-green-100 text-green-700"
                                      }`}
                                    >
                                      {entry.estado}
                                    </span>
                                    {entry.nroFactura && (
                                      <span className="text-xs text-blue-600">Fact: {entry.nroFactura}</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    {hasCosteo && entry.total > 0 && (
                                      <span className="text-xs font-medium text-red-600">+ {formatPrice(entry.total)}</span>
                                    )}
                                    {hasCosteo && (
                                      <span className="text-xs text-gray-400">Saldo: {formatPrice(saldoAfter)}</span>
                                    )}
                                  </div>
                                </a>
                              );
                            } else {
                              const payment = item.data as ProvPayment;
                              const isAnulado = !!payment.anuladoAt;
                              return (
                                <div
                                  key={`p-${payment.id}`}
                                  className={`flex items-center justify-between py-1.5 px-2 rounded ${isAnulado ? "bg-red-50/50" : ""}`}
                                  style={staggerStyle(true, movIdx, 50, 20)}
                                >
                                  <div className={`flex items-center gap-2 flex-wrap ${isAnulado ? "line-through opacity-70" : ""}`}>
                                    <span className="text-xs text-gray-500">
                                      {new Date(payment.createdAt).toLocaleDateString("es-AR")}
                                    </span>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${payment.tipoPago && payment.tipoPago !== "legacy" ? "bg-brand-100 text-brand-700" : "bg-green-100 text-green-700"}`}>
                                      {payment.tipoPago && payment.tipoPago !== "legacy" ? "Recibo" : "Pago"}
                                    </span>
                                    {isAnulado && (
                                      <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-medium" title={payment.anuladoBy ? `Anulado por ${payment.anuladoBy}` : "Anulado"}>
                                        ANULADO
                                      </span>
                                    )}
                                    {payment.concepto && (
                                      <span className="text-xs text-gray-500">{payment.concepto}</span>
                                    )}
                                    <span className="text-xs text-gray-400">por {payment.usuario}</span>
                                    {(payment.efectivoImagenes || []).map((url, idx) => (
                                      <a key={idx} href={url} target="_blank" rel="noopener noreferrer" title={`Ver foto ${idx + 1} del pago`}>
                                        <img src={url} alt={`foto ${idx + 1}`} className="w-8 h-8 object-cover rounded border" />
                                      </a>
                                    ))}
                                    {payment.tipoPago && payment.tipoPago !== "legacy" && (
                                      <a
                                        href={`/api/admin/proveedores/recibos/${payment.id}/pdf`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                                      >
                                        PDF
                                      </a>
                                    )}
                                    {payment.driveUrl && (
                                      <a
                                        href={payment.driveUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200 hover:bg-blue-100"
                                      >
                                        Drive
                                      </a>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-xs font-medium ${isAnulado ? "text-gray-400 line-through" : "text-green-600"}`}>- {formatPrice(payment.monto)}</span>
                                    {hasCosteo && (
                                      <span className="text-xs text-gray-400">Saldo: {formatPrice(saldoAfter)}</span>
                                    )}
                                    {hasRecibos && !isAnulado && (
                                      <button
                                        onClick={() => { setAnularError(""); setAnularTarget({ id: payment.id, monto: payment.monto, tipoPago: payment.tipoPago || null, cod: p.cod }); }}
                                        className="text-xs px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 border border-gray-200 hover:bg-red-50 hover:text-red-600 hover:border-red-200"
                                        title="Anular este recibo y revertir el saldo"
                                      >
                                        Anular
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            }
                          })}
                        </div>
                      );
                    })()}
                    </>
                    )}
                  </div>
                </CollapsiblePanel>
              </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-gray-400">Sin resultados</p>
            )}
          </div>
        </Stagger>
      )}

      <ConfirmModal
        open={!!anularTarget}
        message={
          anularError
            ? `Error: ${anularError}`
            : anularTarget
            ? `Anular este ${anularTarget.tipoPago && anularTarget.tipoPago !== "legacy" ? "recibo" : "pago"} de ${formatPrice(anularTarget.monto)}? El saldo del proveedor se va a revertir y los cheques vinculados se marcan como anulados. No se borra del historial.`
            : ""
        }
        confirmLabel="Si, anular"
        confirmColor="bg-red-500 hover:bg-red-600"
        loading={anularLoading}
        onConfirm={confirmAnular}
        onCancel={() => { setAnularTarget(null); setAnularError(""); }}
      />

      {/* Marcas asociadas — picker modal */}
      {marcaModalCod && (
        <>
          <div className="fixed inset-0 bg-black/50 z-50" onClick={() => setMarcaModalCod(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-xl shadow-xl p-5 w-[640px] max-w-[95vw] max-h-[85vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-800 mb-1">Marcas asociadas</h3>
            <p className="text-xs text-gray-500 mb-3">Eligi las marcas que querés que aparezcan como logos en el PDF del recibo. Si dejas todo vacio, vuelvo al cruce automatico por productos.</p>
            <input
              type="text"
              value={marcaFilter}
              onChange={(e) => setMarcaFilter(e.target.value)}
              placeholder="Buscar marca..."
              className="w-full mb-3 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            />
            {marcasLoading ? (
              <p className="text-sm text-gray-400">Cargando…</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4 max-h-[50vh] overflow-y-auto pr-1">
                {marcaAvailable
                  .filter((m) => !marcaFilter || m.nombre.toLowerCase().includes(marcaFilter.toLowerCase()))
                  .map((m) => {
                    const checked = marcaSelected.includes(m.cod);
                    return (
                      <label
                        key={m.cod}
                        className={`flex items-center gap-2 px-2 py-1.5 border rounded-lg cursor-pointer text-xs ${checked ? "bg-brand-50 border-brand-300" : "bg-white border-gray-200 hover:border-brand-200"}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setMarcaSelected((prev) => prev.includes(m.cod) ? prev : [...prev, m.cod]);
                            } else {
                              setMarcaSelected((prev) => prev.filter((c) => c !== m.cod));
                            }
                          }}
                          className="accent-brand-500"
                        />
                        {m.logoUrl ? (
                          <img src={m.logoUrl} alt={m.nombre} className="w-6 h-6 object-contain shrink-0" />
                        ) : (
                          <span className="w-6 h-6 inline-flex items-center justify-center text-[10px] text-gray-400 shrink-0">·</span>
                        )}
                        <span className="truncate">{m.nombre}</span>
                      </label>
                    );
                  })}
              </div>
            )}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-xs text-gray-500">{marcaSelected.length} seleccionadas</span>
              <div className="flex gap-2">
                <button onClick={() => setMarcaModalCod(null)} disabled={marcasSaving} className="px-3 py-1.5 text-sm border rounded-lg text-gray-600 hover:bg-gray-50">Cancelar</button>
                <button onClick={saveMarcasAssoc} disabled={marcasSaving} className="px-4 py-1.5 text-sm text-white bg-brand-500 rounded-lg hover:bg-brand-600 disabled:opacity-50">
                  {marcasSaving ? "Guardando…" : "Guardar"}
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </PageTransition>
  );
}
