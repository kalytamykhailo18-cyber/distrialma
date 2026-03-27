"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { formatPrice } from "@/lib/utils";
import { HiOutlinePlus, HiOutlineCash, HiOutlineChevronDown, HiOutlineChevronRight, HiOutlineDocumentDownload } from "react-icons/hi";

interface Proveedor {
  cod: string;
  nombre: string;
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
}

export default function ProveedoresPage() {
  const { data: session } = useSession();
  const user = session?.user as { role?: string; permissions?: string[] } | undefined;
  const hasCosteo = user?.role === "admin" || (user?.permissions?.includes("costeo") ?? false);

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Payment form
  const [payingProv, setPayingProv] = useState<Proveedor | null>(null);
  const [payMonto, setPayMonto] = useState("");
  const [payConcepto, setPayConcepto] = useState("");
  const [payingSaving, setPayingSaving] = useState(false);
  const [payError, setPayError] = useState("");

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
        body: JSON.stringify({ nombre: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      setNewName("");
      setShowAdd(false);
      loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment() {
    if (!payingProv || !payMonto) return;
    const monto = parseFloat(payMonto);
    if (isNaN(monto) || monto <= 0) {
      setPayError("Monto inválido");
      return;
    }
    setPayError("");
    setPayingSaving(true);
    try {
      const res = await fetch("/api/admin/proveedores", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cod: payingProv.cod, monto, concepto: payConcepto.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error");
      const provCod = payingProv.cod;
      setPayingProv(null);
      setPayMonto("");
      setPayConcepto("");
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
      else bal += (item.data as ProvPayment).monto;
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

  const filtered = filter.trim()
    ? proveedores.filter((p) =>
        p.nombre.toLowerCase().includes(filter.toLowerCase())
      )
    : proveedores;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1.5 px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 transition-colors"
        >
          <HiOutlinePlus className="w-4 h-4" />
          Nuevo proveedor
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 rounded-lg border p-4 mb-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Nombre
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del proveedor"
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-4 py-2 text-sm text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 transition-colors"
            >
              {saving ? "Guardando..." : "Guardar"}
            </button>
            <button
              onClick={() => { setShowAdd(false); setNewName(""); setError(""); }}
              disabled={saving}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
          {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
        </div>
      )}

      {/* Payment form */}
      {payingProv && (
        <div className="bg-green-50 rounded-lg border border-green-200 p-4 mb-4">
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
                type="number"
                min="0"
                step="0.01"
                value={payMonto}
                onChange={(e) => setPayMonto(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
              />
            </div>
            <div className="flex-1 min-w-[150px]">
              <label className="block text-xs text-gray-500 mb-1">Forma de pago</label>
              <select
                value={payConcepto}
                onChange={(e) => setPayConcepto(e.target.value)}
                className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 bg-white"
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
              className="px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {payingSaving ? "Registrando..." : "Registrar pago"}
            </button>
            <button
              onClick={() => { setPayingProv(null); setPayMonto(""); setPayConcepto(""); setPayError(""); }}
              disabled={payingSaving}
              className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
          {payError && <p className="text-sm text-red-600 mt-2">{payError}</p>}
        </div>
      )}

      {/* Filter */}
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrar proveedores..."
        className="w-full px-4 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 mb-4"
      />

      {loading ? (
        <p className="text-gray-400">Cargando proveedores...</p>
      ) : (
        <div className="bg-white rounded-lg border divide-y max-h-[60vh] overflow-y-auto">
          {filtered.map((p) => (
            <div key={p.cod}>
              <div className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                <button
                  onClick={() => toggleProvEntries(p.cod)}
                  className="flex items-center gap-1 text-left min-w-0"
                >
                  {expandedProv === p.cod ? (
                    <HiOutlineChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  ) : (
                    <HiOutlineChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <span className="text-sm text-gray-900">{p.nombre}</span>
                  <span className="text-xs text-gray-400 ml-2">#{p.cod}</span>
                </button>
                <div className="flex items-center gap-3">
                  {hasCosteo && (
                    <>
                      <span
                        className={`text-sm font-medium ${
                          p.saldo > 0 ? "text-red-600" : "text-gray-400"
                        }`}
                      >
                        {p.saldo > 0 ? formatPrice(p.saldo) : "\u2014"}
                      </span>
                      {p.saldo > 0 && (
                        <button
                          onClick={() => { setPayingProv(p); setPayMonto(""); setPayConcepto(""); setPayError(""); }}
                          className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition-colors"
                        >
                          <HiOutlineCash className="w-3.5 h-3.5" />
                          Pagar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Supplier history (entries + payments) */}
              {expandedProv === p.cod && (
                <div className="bg-gray-50 px-4 py-2 border-t">
                  {/* Date range filter */}
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
                      className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 bg-red-50 border border-red-200 rounded hover:bg-red-100"
                    >
                      <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                      PDF
                    </button>
                    <button
                      onClick={() => exportCSV(p)}
                      className="flex items-center gap-1 px-2 py-1 text-xs text-green-600 bg-green-50 border border-green-200 rounded hover:bg-green-100"
                    >
                      <HiOutlineDocumentDownload className="w-3.5 h-3.5" />
                      Excel
                    </button>
                  </div>
                  {loadingEntries ? (
                    <p className="text-xs text-gray-400 py-1">Cargando movimientos...</p>
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
                        runningBal += (item.data as ProvPayment).monto;
                      }
                    }

                    if (allMovements.length === 0) {
                      return <p className="text-xs text-gray-400 py-1">Sin movimientos en el rango seleccionado</p>;
                    }

                    return (
                      <div className="space-y-1">
                        {allMovements.map((item) => {
                          const key = `${item.type}-${(item.data as { id: number }).id}`;
                          const saldoAfter = balanceMap.get(key) ?? 0;

                          if (item.type === "entry") {
                            const entry = item.data as ProvEntry;
                            return (
                              <a
                                key={`e-${entry.id}`}
                                href={`/admin/compras/${entry.id}`}
                                className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-100 transition-colors"
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
                            return (
                              <div
                                key={`p-${payment.id}`}
                                className="flex items-center justify-between py-1.5 px-2 rounded"
                              >
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-xs text-gray-500">
                                    {new Date(payment.createdAt).toLocaleDateString("es-AR")}
                                  </span>
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-green-100 text-green-700">Pago</span>
                                  {payment.concepto && (
                                    <span className="text-xs text-gray-500">{payment.concepto}</span>
                                  )}
                                  <span className="text-xs text-gray-400">por {payment.usuario}</span>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs font-medium text-green-600">- {formatPrice(payment.monto)}</span>
                                  {hasCosteo && (
                                    <span className="text-xs text-gray-400">Saldo: {formatPrice(saldoAfter)}</span>
                                  )}
                                </div>
                              </div>
                            );
                          }
                        })}
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="px-4 py-3 text-sm text-gray-400">Sin resultados</p>
          )}
        </div>
      )}
    </div>
  );
}
