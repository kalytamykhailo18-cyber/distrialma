"use client";

import { useEffect, useState } from "react";
import { formatPrice } from "@/lib/utils";
import { HiSearch, HiPlus, HiTrash, HiChevronDown, HiOutlineDocumentDownload } from "react-icons/hi";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { PageTransition, Stagger, staggerStyle, springBtn, hoverRow, LoadingCenter, useDataReady, CollapsiblePanel } from "@/components/AnimateIn";

interface Proveedor { cod: string; nombre: string }
interface Mapping { id: number; sku: string; productName: string; proveedorCod: string; proveedorName: string }
interface RepoProduct { sku: string; nombre: string; unidad: string; stockActual: number; ventaSemanal: number; sugerido: number; costoUnit: number; costoTotal: number }
interface RepoProveedor { cod: string; nombre: string; totalSugerido: number; productos: RepoProduct[] }
interface ProvSummary { cod: string; nombre: string; cantProductos: number }
interface SugProduct { sku: string; nombre: string; unidad: string; stock: number; costo: number; ventaSemanal: number; coberturaDias: number; sugerido: number; proveedor: string }

const fmt = (n: number) => formatPrice(n);
const fmtK = (n: number) => n >= 1000000 ? `${(n / 1000000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(0)}K` : String(Math.round(n));

export default function ProveedoresProductosPage() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [puntouchMappings, setPuntouchMappings] = useState<Array<{ sku: string; nombre: string }>>([]);
  const [marcas, setMarcas] = useState<Array<{ cod: string; nombre: string }>>([]);
  const [rubros, setRubros] = useState<Array<{ cod: string; nombre: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProv, setSelectedProv] = useState("");
  const [tab, setTab] = useState<"proveedores" | "resumen" | "asignar" | "sugerido">("proveedores");
  const [semanas, setSemanas] = useState(4);

  // Assign
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Array<{ sku: string; name: string }>>([]);
  const [bulkMarca, setBulkMarca] = useState("");
  const [bulkRubro, setBulkRubro] = useState("");
  const [saving, setSaving] = useState(false);

  // Proveedores tab
  const [provSummary, setProvSummary] = useState<ProvSummary[]>([]);
  const [expandedProv, setExpandedProv] = useState<string | null>(null);
  const [provDetail, setProvDetail] = useState<RepoProveedor | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [repoSort, setRepoSort] = useState<{ field: string; dir: "asc" | "desc" }>({ field: "sugerido", dir: "desc" });
  // Manual quantity overrides — persisted per proveedor+sku in sessionStorage
  const [qtyOverrides, setQtyOverrides] = useState<Record<string, number>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = sessionStorage.getItem("reposicion_qty_overrides");
    if (saved) try { setQtyOverrides(JSON.parse(saved)); } catch {}
  }, []);

  function setOverride(provCod: string, sku: string, qty: number) {
    const key = `${provCod}|${sku}`;
    setQtyOverrides((prev) => {
      const next = { ...prev };
      if (qty === 0 || isNaN(qty)) delete next[key]; else next[key] = qty;
      if (typeof window !== "undefined") sessionStorage.setItem("reposicion_qty_overrides", JSON.stringify(next));
      return next;
    });
  }

  function clearOverrides(provCod: string) {
    setQtyOverrides((prev) => {
      const next: Record<string, number> = {};
      for (const k of Object.keys(prev)) {
        if (!k.startsWith(provCod + "|")) next[k] = prev[k];
      }
      if (typeof window !== "undefined") sessionStorage.setItem("reposicion_qty_overrides", JSON.stringify(next));
      return next;
    });
  }

  // Resumen tab
  const [resumenData, setResumenData] = useState<RepoProveedor[]>([]);
  const [resumenLoading, setResumenLoading] = useState(false);

  // Proveedores filter/pagination
  const [provSearch, setProvSearch] = useState("");
  const [provPage, setProvPage] = useState(0);
  const PROV_PAGE_SIZE = 20;

  // Sugerido auto tab
  const [sugProducts, setSugProducts] = useState<SugProduct[]>([]);
  const [sugLoading, setSugLoading] = useState(false);
  const [sugProv, setSugProv] = useState("");
  const [sugSemanas, setSugSemanas] = useState(2);
  const [sugSearch, setSugSearch] = useState("");
  const [sugOverrides, setSugOverrides] = useState<Record<string, number>>({});
  const [sugProvList, setSugProvList] = useState<string[]>([]);

  // Asignar mappings filter/pagination
  const [mapSearch, setMapSearch] = useState("");
  const [mapPage, setMapPage] = useState(0);
  const MAP_PAGE_SIZE = 30;

  const dataReady = useDataReady(!loading && provSummary);

  async function loadData() {
    setLoading(true);
    try {
      const [mapRes, sumRes] = await Promise.all([
        fetch("/api/admin/producto-proveedor").then((r) => r.json()),
        fetch(`/api/admin/reposicion?semanas=${semanas}`).then((r) => r.json()),
      ]);
      setProveedores(mapRes.proveedores || []);
      setMappings(mapRes.mappings || []);
      setPuntouchMappings(mapRes.puntouchMappings || []);
      setMarcas(mapRes.marcas || []);
      setRubros(mapRes.rubros || []);
      if (sumRes.mode === "summary") setProvSummary(sumRes.proveedores || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function exportExcel(prov: RepoProveedor) {
    // Apply manual overrides to products
    const products = prov.productos.map((p) => {
      const key = `${prov.cod}|${p.sku}`;
      if (key in qtyOverrides) {
        const qty = qtyOverrides[key];
        return { ...p, sugerido: qty, costoTotal: qty * p.costoUnit };
      }
      return p;
    });
    const adjustedTotal = products.reduce((s, p) => s + (p.sugerido > 0 ? p.costoTotal : 0), 0);
    const effectiveProv = { ...prov, productos: products, totalSugerido: adjustedTotal };

    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(effectiveProv.nombre.substring(0, 31));

    // Title row
    ws.mergeCells("A1:F1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `Reposición — ${effectiveProv.nombre}`;
    titleCell.font = { bold: true, size: 14 };
    titleCell.alignment = { horizontal: "left" };

    ws.mergeCells("A2:F2");
    ws.getCell("A2").value = `${semanas} semanas — Total: $${effectiveProv.totalSugerido.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`;
    ws.getCell("A2").font = { size: 10, color: { argb: "FF666666" } };

    // Headers
    const headerRow = ws.addRow(["SKU", "Producto", "Unidad", "Stock", "Venta/sem", "Sugerido", "Costo unit.", "Costo total"]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFB9A47" } };
      cell.alignment = { horizontal: "center" };
      cell.border = { bottom: { style: "thin", color: { argb: "FFDDDDDD" } } };
    });

    // Column widths
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 45;
    ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 12;
    ws.getColumn(6).width = 12;
    ws.getColumn(7).width = 14;
    ws.getColumn(8).width = 14;

    // Data
    const sorted = [...effectiveProv.productos].sort((a, b) => b.sugerido - a.sugerido);
    for (const p of sorted) {
      const row = ws.addRow([
        p.sku,
        p.nombre,
        p.unidad === "KG" ? "KG" : "UN",
        p.stockActual,
        p.ventaSemanal,
        p.sugerido,
        p.costoUnit,
        p.costoTotal,
      ]);
      // Right-align numbers
      for (let c = 4; c <= 8; c++) {
        row.getCell(c).alignment = { horizontal: "right" };
        if (c >= 7) row.getCell(c).numFmt = "#,##0.00";
      }
      // Highlight rows that need restock
      if (p.sugerido > 0) {
        row.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0F0" } };
        });
      }
      row.border = { bottom: { style: "thin", color: { argb: "FFEEEEEE" } } };
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Reposicion-${effectiveProv.nombre.replace(/[^a-zA-Z0-9]/g, "_")}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadProvDetail(provCod: string) {
    if (expandedProv === provCod) { setExpandedProv(null); setProvDetail(null); return; }
    setDetailLoading(true);
    setExpandedProv(provCod);
    try {
      const res = await fetch(`/api/admin/reposicion?semanas=${semanas}&proveedor=${provCod}`);
      const d = await res.json();
      if (d.proveedores?.length > 0) setProvDetail(d.proveedores[0]);
      else setProvDetail(null);
    } catch {}
    setDetailLoading(false);
  }

  async function loadResumen() {
    setResumenLoading(true);
    try {
      const res = await fetch(`/api/admin/reposicion?semanas=${semanas}&all=1`);
      const d = await res.json();
      setResumenData((d.proveedores || []).sort((a: RepoProveedor, b: RepoProveedor) => b.totalSugerido - a.totalSugerido));
    } catch {}
    setResumenLoading(false);
  }

  async function loadSugerido(prov?: string) {
    setSugLoading(true);
    try {
      const params = new URLSearchParams({ semanas: String(sugSemanas) });
      if (prov) params.set("proveedor", prov);
      const res = await fetch(`/api/admin/pedidos-sugeridos?${params}`);
      const d = await res.json();
      const products: SugProduct[] = d.products || [];
      setSugProducts(products);
      // Extract unique proveedores
      const provs = Array.from(new Set(products.map((p) => p.proveedor).filter(Boolean))).sort();
      setSugProvList(provs);
    } catch {}
    setSugLoading(false);
  }

  function setSugOverride(sku: string, qty: number) {
    setSugOverrides((prev) => {
      const next = { ...prev };
      if (isNaN(qty) || qty < 0) delete next[sku]; else next[sku] = qty;
      return next;
    });
  }

  async function exportSugExcel() {
    const filtered = getFilteredSugProducts();
    if (filtered.length === 0) return;
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Pedido Sugerido");

    ws.mergeCells("A1:G1");
    const titleCell = ws.getCell("A1");
    titleCell.value = `Pedido Sugerido${sugProv ? ` — ${sugProv}` : ""} — ${sugSemanas} semanas`;
    titleCell.font = { bold: true, size: 14 };

    const headerRow = ws.addRow(["SKU", "Producto", "Unidad", "Stock", "Venta/sem", "Cobertura dias", "Pedir", "Costo est."]);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFB9A47" } };
      cell.alignment = { horizontal: "center" };
    });
    ws.getColumn(1).width = 10; ws.getColumn(2).width = 45; ws.getColumn(3).width = 8;
    ws.getColumn(4).width = 12; ws.getColumn(5).width = 12; ws.getColumn(6).width = 14;
    ws.getColumn(7).width = 12; ws.getColumn(8).width = 14;

    for (const p of filtered) {
      const qty = p.sku in sugOverrides ? sugOverrides[p.sku] : p.sugerido;
      if (qty <= 0) continue;
      const row = ws.addRow([p.sku, p.nombre, p.unidad, p.stock, p.ventaSemanal, p.coberturaDias, qty, qty * p.costo]);
      for (let c = 4; c <= 8; c++) row.getCell(c).alignment = { horizontal: "right" };
    }

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `Pedido-Sugerido${sugProv ? `-${sugProv}` : ""}.xlsx`; a.click();
    URL.revokeObjectURL(url);
  }

  function exportSugWhatsApp() {
    const filtered = getFilteredSugProducts();
    const lines: string[] = [`*Pedido${sugProv ? ` ${sugProv}` : ""}* (${sugSemanas} sem)\n`];
    for (const p of filtered) {
      const qty = p.sku in sugOverrides ? sugOverrides[p.sku] : p.sugerido;
      if (qty <= 0) continue;
      lines.push(`• ${p.nombre} — ${qty} ${p.unidad}`);
    }
    const text = lines.join("\n");
    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, "_blank");
  }

  function getFilteredSugProducts() {
    let list = sugProducts;
    if (sugProv) list = list.filter((p) => p.proveedor === sugProv);
    if (sugSearch) list = list.filter((p) => p.nombre.toLowerCase().includes(sugSearch.toLowerCase()) || p.sku.includes(sugSearch));
    return list;
  }

  async function searchProducts(q: string) {
    if (q.length < 2) { setSearchResults([]); return; }
    try {
      const res = await fetch(`/api/admin/stock-entries/search-products?q=${encodeURIComponent(q)}`);
      const d = await res.json();
      setSearchResults(d.products || []);
    } catch {}
  }

  async function addMapping(sku: string) {
    if (!selectedProv) return;
    const prov = proveedores.find((p) => p.cod === selectedProv);
    if (!prov) return;
    const product = searchResults.find((p) => p.sku === sku);
    setSaving(true);
    try {
      await fetch("/api/admin/producto-proveedor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", sku, productName: product?.name || "", proveedorCod: prov.cod, proveedorName: prov.nombre }),
      });
      await loadData();
    } catch {}
    setSaving(false);
  }

  async function bulkAssign() {
    if (!selectedProv || (!bulkMarca && !bulkRubro)) return;
    const prov = proveedores.find((p) => p.cod === selectedProv);
    if (!prov) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/producto-proveedor", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "bulk", proveedorCod: prov.cod, proveedorName: prov.nombre, marcaCod: bulkMarca || undefined, rubroCod: bulkRubro || undefined }),
      });
      const d = await res.json();
      alert(`Asignados: ${d.created || 0} productos`);
      await loadData();
      setBulkMarca(""); setBulkRubro("");
    } catch {}
    setSaving(false);
  }

  async function removeMapping(sku: string, proveedorCod: string) {
    try {
      await fetch("/api/admin/producto-proveedor", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sku, proveedorCod }),
      });
      await loadData();
    } catch {}
  }

  const filteredMappings = selectedProv ? mappings.filter((m) => m.proveedorCod === selectedProv) : mappings;
  const totalResumen = resumenData.reduce((s, p) => s + p.totalSugerido, 0);
  const totalProductosPedir = resumenData.reduce((s, p) => s + p.productos.filter((x) => x.sugerido > 0).length, 0);

  return (
    <PageTransition className="max-w-5xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Proveedores y Productos</h1>
        <p className="text-sm text-gray-500 mb-4">Asocia productos a proveedores y calcula la reposicion semanal.</p>
      </Stagger>

      {/* Top tabs */}
      <Stagger delay={60} y={6}>
        <div className="flex flex-wrap gap-1 mb-4 border-b pb-3">
          {[
            { key: "proveedores" as const, label: "Proveedores" },
            { key: "sugerido" as const, label: "Sugerido Auto" },
            { key: "resumen" as const, label: "Resumen" },
            { key: "asignar" as const, label: "Asignar" },
          ].map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "resumen" && resumenData.length === 0) loadResumen(); if (t.key === "sugerido" && sugProducts.length === 0) loadSugerido(); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium ${springBtn} ${tab === t.key ? "bg-brand-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {t.label}
            </button>
          ))}
          <select value={semanas} onChange={(e) => setSemanas(Number(e.target.value))}
            className="ml-auto px-3 py-2 border rounded-xl text-sm">
            <option value={2}>2 semanas</option>
            <option value={4}>4 semanas</option>
            <option value={8}>8 semanas</option>
          </select>
        </div>
      </Stagger>

      {loading ? <LoadingCenter /> : (
        <>
          {/* ═══ PROVEEDORES TAB ═══ */}
          {tab === "proveedores" && (() => {
            const filtered = provSearch
              ? provSummary.filter((p) => p.nombre.toLowerCase().includes(provSearch.toLowerCase()) || p.cod.includes(provSearch))
              : provSummary;
            const totalPages = Math.ceil(filtered.length / PROV_PAGE_SIZE);
            const paged = filtered.slice(provPage * PROV_PAGE_SIZE, (provPage + 1) * PROV_PAGE_SIZE);
            return (
            <Stagger delay={150} y={8}>
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2 mb-2 items-center">
                  <div className="relative flex-1 min-w-[200px]">
                    <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" value={provSearch} onChange={(e) => { setProvSearch(e.target.value); setProvPage(0); }}
                      placeholder="Buscar proveedor..."
                      className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                  </div>
                  <span className="text-xs text-gray-400">{filtered.length} proveedores</span>
                  {totalPages > 1 && (
                    <div className="flex items-center gap-1">
                      <button onClick={() => setProvPage((p) => Math.max(0, p - 1))} disabled={provPage === 0}
                        className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>&#8592;</button>
                      <span className="text-xs text-gray-500">{provPage + 1}/{totalPages}</span>
                      <button onClick={() => setProvPage((p) => Math.min(totalPages - 1, p + 1))} disabled={provPage >= totalPages - 1}
                        className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>&#8594;</button>
                    </div>
                  )}
                </div>
                {paged.length === 0 ? (
                  <p className="text-gray-400">No hay proveedores.</p>
                ) : paged.map((prov, idx) => {
                  const isOpen = expandedProv === prov.cod;
                  const detail = isOpen ? provDetail : null;
                  const todos = detail?.productos || [];
                  return (
                    <div key={prov.cod} className={`bg-white border rounded-xl overflow-hidden shadow-sm ${isOpen ? "border-brand-400 shadow-md" : ""}`}
                      style={staggerStyle(dataReady, idx)}>
                      <button onClick={() => loadProvDetail(prov.cod)}
                        className={`w-full px-4 py-3 flex items-center justify-between text-left ${springBtn} ${isOpen ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                        <div>
                          <h3 className={`text-sm font-bold ${isOpen ? "text-brand-700" : "text-gray-700"}`}>{prov.nombre}</h3>
                          <span className="text-xs text-gray-400">{prov.cantProductos} productos</span>
                        </div>
                        <div className="flex items-center gap-2">
                          {detail && (
                            <button
                              onClick={(e) => { e.stopPropagation(); exportExcel(detail); }}
                              className={`p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors ${springBtn}`}
                              title="Descargar Excel"
                            >
                              <HiOutlineDocumentDownload className="w-5 h-5" />
                            </button>
                          )}
                          {detail && (() => {
                            const adjTotal = detail.productos.reduce((s, p) => {
                              const key = `${prov.cod}|${p.sku}`;
                              const qty = key in qtyOverrides ? qtyOverrides[key] : p.sugerido;
                              return s + (qty > 0 ? qty * p.costoUnit : 0);
                            }, 0);
                            return <span className="text-sm font-bold text-brand-600">{fmt(adjTotal)}</span>;
                          })()}
                          <HiChevronDown className={`w-4 h-4 transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${isOpen ? "rotate-180 text-brand-600" : "text-gray-400"}`} />
                        </div>
                      </button>
                      <CollapsiblePanel open={isOpen}>
                        {detailLoading ? (
                          <div className="px-4 py-3 border-t"><LoadingCenter text="Cargando..." /></div>
                        ) : detail && (
                          <>
                          {(() => {
                            const overrideCount = Object.keys(qtyOverrides).filter((k) => k.startsWith(prov.cod + "|")).length;
                            if (overrideCount === 0) return null;
                            return (
                              <div className="flex items-center justify-between px-4 py-2 bg-blue-50 border-t border-blue-200 text-xs">
                                <span className="text-blue-700 font-medium">{overrideCount} cantidad{overrideCount === 1 ? "" : "es"} modificada{overrideCount === 1 ? "" : "s"} manualmente</span>
                                <button onClick={() => clearOverrides(prov.cod)} className={`text-blue-600 hover:text-red-600 font-medium ${springBtn}`}>
                                  Restablecer sugeridos
                                </button>
                              </div>
                            );
                          })()}
                          <div className="overflow-x-auto max-h-[400px] overflow-y-auto border-t">
                            <table className="w-full text-sm">
                              <thead className="sticky top-0">
                                <tr className="bg-gray-100 text-xs text-gray-500">
                                  <th className="text-left p-2 pl-4">Producto</th>
                                  {[
                                    { key: "stockActual", label: "Stock" },
                                    { key: "ventaSemanal", label: "Venta/sem" },
                                    { key: "sugerido", label: "Sugerido" },
                                    { key: "costoTotal", label: "Costo est." },
                                  ].map((col) => (
                                    <th key={col.key}
                                      onClick={() => setRepoSort((prev) => ({ field: col.key, dir: prev.field === col.key && prev.dir === "desc" ? "asc" : "desc" }))}
                                      className={`text-right p-2 cursor-pointer hover:bg-gray-200 select-none ${springBtn}`}>
                                      {col.label} {repoSort.field === col.key ? (repoSort.dir === "desc" ? "\u2193" : "\u2191") : ""}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y">
                                {todos.sort((a, b) => {
                                  const av = (a as unknown as Record<string, number>)[repoSort.field] || 0;
                                  const bv = (b as unknown as Record<string, number>)[repoSort.field] || 0;
                                  return repoSort.dir === "desc" ? bv - av : av - bv;
                                }).map((p, rowIdx) => {
                                  const overrideKey = `${prov.cod}|${p.sku}`;
                                  const hasOverride = overrideKey in qtyOverrides;
                                  const effectiveQty = hasOverride ? qtyOverrides[overrideKey] : p.sugerido;
                                  const effectiveCost = effectiveQty * p.costoUnit;
                                  return (
                                  <tr key={p.sku} className={`${hoverRow} ${effectiveQty > 0 ? (hasOverride ? "bg-blue-50/50 hover:bg-blue-50" : "bg-red-50/50 hover:bg-red-50") : ""}`}
                                    style={staggerStyle(true, rowIdx, 50, 15)}>
                                    <td className="p-2 pl-4">
                                      <span className="text-gray-400 text-xs font-mono mr-1">{p.sku}</span>
                                      <span className="text-gray-900">{p.nombre}</span>
                                    </td>
                                    <td className={`text-right p-2 ${p.stockActual <= 0 ? "text-red-600 font-bold" : "text-gray-600"}`}>{p.stockActual.toLocaleString("es-AR", { maximumFractionDigits: 1 })} {p.unidad === "KG" ? "kg" : "u"}</td>
                                    <td className="text-right p-2 text-blue-600 font-medium">{p.ventaSemanal.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</td>
                                    <td className="text-right p-2">
                                      <input
                                        type="number"
                                        min="0"
                                        step={p.unidad === "KG" ? "0.1" : "1"}
                                        value={hasOverride ? effectiveQty : (p.sugerido > 0 ? p.sugerido : "")}
                                        onChange={(e) => setOverride(prov.cod, p.sku, parseFloat(e.target.value) || 0)}
                                        placeholder="0"
                                        className={`w-20 text-right px-2 py-1 border rounded text-sm font-bold focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 ${hasOverride ? "border-blue-400 text-blue-700 bg-blue-50" : "border-gray-300 text-brand-600"}`}
                                      />
                                    </td>
                                    <td className="text-right p-2 pr-4 text-gray-700">{effectiveQty > 0 ? fmt(effectiveCost) : ""}</td>
                                  </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                          </>
                        )}
                      </CollapsiblePanel>
                    </div>
                  );
                })}
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button onClick={() => setProvPage((p) => Math.max(0, p - 1))} disabled={provPage === 0}
                      className={`px-3 py-1 rounded text-sm border disabled:opacity-30 ${springBtn}`}>Anterior</button>
                    <span className="text-xs text-gray-500">{provPage + 1} / {totalPages}</span>
                    <button onClick={() => setProvPage((p) => Math.min(totalPages - 1, p + 1))} disabled={provPage >= totalPages - 1}
                      className={`px-3 py-1 rounded text-sm border disabled:opacity-30 ${springBtn}`}>Siguiente</button>
                  </div>
                )}
              </div>
            </Stagger>
            );
          })()}

          {/* ═══ SUGERIDO AUTO TAB ═══ */}
          {tab === "sugerido" && (
            <Stagger delay={150} y={8}>
              <div className="space-y-3">
                {/* Controls */}
                <div className="flex flex-wrap gap-2 items-center">
                  <select value={sugProv} onChange={(e) => setSugProv(e.target.value)}
                    className="px-3 py-2 border rounded-xl text-sm min-w-[180px]">
                    <option value="">Todos los proveedores</option>
                    {sugProvList.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={sugSemanas} onChange={(e) => { setSugSemanas(Number(e.target.value)); }}
                    className="px-3 py-2 border rounded-xl text-sm">
                    <option value={1}>1 semana</option>
                    <option value={2}>2 semanas</option>
                    <option value={3}>3 semanas</option>
                    <option value={4}>4 semanas</option>
                  </select>
                  <button onClick={() => { setSugOverrides({}); loadSugerido(sugProv || undefined); }}
                    className={`px-3 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium ${springBtn}`}>
                    Calcular
                  </button>
                  <div className="relative flex-1 min-w-[150px]">
                    <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input type="text" value={sugSearch} onChange={(e) => setSugSearch(e.target.value)}
                      placeholder="Filtrar producto..."
                      className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm focus:outline-none focus:border-brand-500" />
                  </div>
                </div>

                {/* Export buttons */}
                <div className="flex gap-2">
                  <button onClick={exportSugExcel} disabled={sugLoading || sugProducts.length === 0}
                    className={`px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-medium disabled:opacity-50 flex items-center gap-1 ${springBtn}`}>
                    <HiOutlineDocumentDownload className="w-4 h-4" /> Excel
                  </button>
                  <button onClick={exportSugWhatsApp} disabled={sugLoading || sugProducts.length === 0}
                    className={`px-3 py-2 bg-green-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 ${springBtn}`}>
                    WhatsApp
                  </button>
                  {Object.keys(sugOverrides).length > 0 && (
                    <button onClick={() => setSugOverrides({})}
                      className={`px-3 py-2 text-blue-600 border border-blue-300 rounded-xl text-sm font-medium ${springBtn}`}>
                      Restablecer ({Object.keys(sugOverrides).length})
                    </button>
                  )}
                  <span className="ml-auto text-xs text-gray-400 self-center">
                    {getFilteredSugProducts().filter((p) => (p.sku in sugOverrides ? sugOverrides[p.sku] : p.sugerido) > 0).length} productos a pedir
                  </span>
                </div>

                {/* Table */}
                {sugLoading ? <LoadingCenter text="Calculando sugeridos..." /> : (
                  <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                    <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="sticky top-0">
                          <tr className="bg-gray-100 text-xs text-gray-500">
                            <th className="text-left p-2 pl-4">Producto</th>
                            <th className="text-right p-2">Stock</th>
                            <th className="text-right p-2">Venta/sem</th>
                            <th className="text-right p-2">Cobertura</th>
                            <th className="text-right p-2">Pedir</th>
                            <th className="text-right p-2 pr-4">Costo est.</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {getFilteredSugProducts().map((p, idx) => {
                            const hasOverride = p.sku in sugOverrides;
                            const qty = hasOverride ? sugOverrides[p.sku] : p.sugerido;
                            const cobColor = p.coberturaDias <= 3 ? "text-red-600 font-bold" : p.coberturaDias <= 7 ? "text-orange-600 font-medium" : "text-gray-600";
                            return (
                              <tr key={p.sku} className={`${hoverRow} ${hasOverride ? "bg-blue-50/50" : qty > 0 ? "bg-red-50/30" : ""}`}
                                style={staggerStyle(true, idx, 50, 10)}>
                                <td className="p-2 pl-4">
                                  <span className="text-gray-400 text-xs font-mono mr-1">{p.sku}</span>
                                  <span className="text-gray-900">{p.nombre}</span>
                                  {p.proveedor && <span className="text-xs text-gray-400 ml-1">({p.proveedor})</span>}
                                </td>
                                <td className={`text-right p-2 ${p.stock <= 0 ? "text-red-600 font-bold" : "text-gray-600"}`}>
                                  {p.stock.toLocaleString("es-AR", { maximumFractionDigits: 1 })} {p.unidad === "KG" ? "kg" : "u"}
                                </td>
                                <td className="text-right p-2 text-blue-600 font-medium">
                                  {p.ventaSemanal.toLocaleString("es-AR", { maximumFractionDigits: 1 })}
                                </td>
                                <td className={`text-right p-2 ${cobColor}`}>
                                  {p.coberturaDias >= 999 ? "∞" : `${p.coberturaDias}d`}
                                </td>
                                <td className="text-right p-2">
                                  <input type="number" min="0" step={p.unidad === "KG" ? "0.1" : "1"}
                                    value={hasOverride ? qty : (p.sugerido > 0 ? p.sugerido : "")}
                                    onChange={(e) => setSugOverride(p.sku, parseFloat(e.target.value) || 0)}
                                    placeholder="0"
                                    className={`w-20 text-right px-2 py-1 border rounded text-sm font-bold focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600 ${hasOverride ? "border-blue-400 text-blue-700 bg-blue-50" : "border-gray-300 text-brand-600"}`} />
                                </td>
                                <td className="text-right p-2 pr-4 text-gray-700">
                                  {qty > 0 ? fmt(qty * p.costo) : ""}
                                </td>
                              </tr>
                            );
                          })}
                          {getFilteredSugProducts().length === 0 && (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-400">No hay productos que necesiten reposicion.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </Stagger>
          )}

          {/* ═══ RESUMEN TAB ═══ */}
          {tab === "resumen" && (
            <Stagger delay={150} y={8}>
              <div className="space-y-4">
                {resumenLoading ? (
                  <LoadingCenter text="Cargando resumen de todos los proveedores..." />
                ) : resumenData.length === 0 ? (
                  <button onClick={loadResumen} className={`px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium ${springBtn}`}>
                    Cargar resumen completo
                  </button>
                ) : (
                  <>
                    {/* Summary cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div className="bg-white border rounded-xl shadow-sm p-3 text-center">
                        <div className="text-lg font-bold text-gray-900">{resumenData.length}</div>
                        <div className="text-xs text-gray-500">Proveedores</div>
                      </div>
                      <div className="bg-white border rounded-xl shadow-sm p-3 text-center">
                        <div className="text-lg font-bold text-blue-600">{totalProductosPedir}</div>
                        <div className="text-xs text-gray-500">Productos a pedir</div>
                      </div>
                      <div className="bg-white border rounded-xl shadow-sm p-3 text-center">
                        <div className="text-lg font-bold text-brand-600">{fmt(totalResumen)}</div>
                        <div className="text-xs text-gray-500">Costo total estimado</div>
                      </div>
                    </div>

                    {/* Chart */}
                    <div className="bg-white border rounded-xl shadow-sm p-4 overflow-hidden">
                      <h3 className="text-sm font-bold text-gray-700 mb-3">Costo estimado por proveedor</h3>
                      <ResponsiveContainer width="100%" height={Math.max(200, resumenData.filter((p) => p.totalSugerido > 0).length * 30)}>
                        <BarChart data={resumenData.filter((p) => p.totalSugerido > 0)} layout="vertical" margin={{ left: 10, right: 10 }}>
                          <XAxis type="number" tickFormatter={fmtK} tick={{ fontSize: 11 }} />
                          <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 10 }} />
                          <Tooltip formatter={(v) => fmt(Number(v))} wrapperStyle={{ zIndex: 10, maxWidth: "90vw" }} />
                          <Bar dataKey="totalSugerido" name="Costo estimado" fill="#f97316" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </>
                )}
              </div>
            </Stagger>
          )}

          {/* ═══ ASIGNAR TAB ═══ */}
          {tab === "asignar" && (
            <Stagger delay={150} y={8}>
              <>
                {/* Proveedor selector */}
                <div className="mb-4">
                  <select value={selectedProv} onChange={(e) => { setSelectedProv(e.target.value); loadData(); }}
                    className="w-full px-3 py-2 border border-brand-400 rounded-xl text-sm">
                    <option value="">Seleccionar proveedor...</option>
                    {proveedores.map((p) => (
                      <option key={p.cod} value={p.cod}>{p.nombre}</option>
                    ))}
                  </select>
                </div>

                {selectedProv && (
                  <>
                    {/* Bulk assign */}
                    <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
                      <h3 className="text-sm font-bold text-gray-700 mb-3">Asignacion masiva a {proveedores.find((p) => p.cod === selectedProv)?.nombre}</h3>
                      <div className="flex flex-wrap gap-3">
                        <select value={bulkMarca} onChange={(e) => setBulkMarca(e.target.value)} className="px-3 py-2 border rounded-xl text-sm flex-1 min-w-[150px]">
                          <option value="">Por marca...</option>
                          {marcas.map((m) => <option key={m.cod} value={m.cod}>{m.nombre}</option>)}
                        </select>
                        <select value={bulkRubro} onChange={(e) => setBulkRubro(e.target.value)} className="px-3 py-2 border rounded-xl text-sm flex-1 min-w-[150px]">
                          <option value="">Por rubro...</option>
                          {rubros.map((r) => <option key={r.cod} value={r.cod}>{r.nombre}</option>)}
                        </select>
                        <button onClick={bulkAssign} disabled={saving || (!bulkMarca && !bulkRubro)}
                          className={`px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-medium disabled:opacity-50 ${springBtn}`}>
                          {saving ? "Asignando..." : "Asignar todos"}
                        </button>
                      </div>
                    </div>

                    {/* Single assign */}
                    <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
                      <h3 className="text-sm font-bold text-gray-700 mb-3">Asignar producto individual</h3>
                      <div className="relative">
                        <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input type="text" value={searchQuery}
                          onChange={(e) => { setSearchQuery(e.target.value); searchProducts(e.target.value); }}
                          placeholder="Buscar producto por nombre o SKU..."
                          className="w-full pl-9 pr-3 py-2 border rounded-xl text-sm" />
                      </div>
                      {searchResults.length > 0 && (
                        <div className="mt-2 border rounded-xl divide-y max-h-48 overflow-y-auto">
                          {searchResults.map((p, idx) => {
                            const alreadyPt = puntouchMappings.some((m) => m.sku === p.sku);
                            const alreadyWeb = filteredMappings.some((m) => m.sku === p.sku);
                            const already = alreadyPt || alreadyWeb;
                            return (
                              <button key={p.sku} onClick={() => { if (!already) { addMapping(p.sku); setSearchQuery(""); setSearchResults([]); } }}
                                disabled={already}
                                className={`w-full px-3 py-2 flex items-center justify-between text-left text-sm ${springBtn} ${already ? "bg-gray-50 opacity-60" : "hover:bg-brand-50"}`}
                                style={staggerStyle(true, idx, 30, 20)}>
                                <span><span className="text-gray-400 font-mono mr-2">{p.sku}</span>{p.name}</span>
                                {already ? (
                                  <span className="text-xs text-green-600 font-medium">{alreadyPt ? "PunTouch" : "Asignado"}</span>
                                ) : (
                                  <HiPlus className="w-4 h-4 text-brand-500" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Current mappings */}
                {(() => {
                  const allMaps = [
                    ...puntouchMappings.map((m) => ({ ...m, source: "pt" as const, id: `pt-${m.sku}` })),
                    ...filteredMappings.map((m) => ({ sku: m.sku, nombre: m.productName || m.sku, source: "web" as const, id: String(m.id), proveedorCod: m.proveedorCod })),
                  ];
                  const filteredMaps = mapSearch
                    ? allMaps.filter((m) => m.nombre.toLowerCase().includes(mapSearch.toLowerCase()) || m.sku.includes(mapSearch))
                    : allMaps;
                  const mapTotalPages = Math.ceil(filteredMaps.length / MAP_PAGE_SIZE);
                  const pagedMaps = filteredMaps.slice(mapPage * MAP_PAGE_SIZE, (mapPage + 1) * MAP_PAGE_SIZE);
                  return (
                <div className="bg-white border rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-gray-700">
                      Productos ({allMaps.length})
                    </h3>
                    <div className="relative flex-1 min-w-[150px]">
                      <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
                      <input type="text" value={mapSearch} onChange={(e) => { setMapSearch(e.target.value); setMapPage(0); }}
                        placeholder="Filtrar..."
                        className="w-full pl-8 pr-3 py-1.5 border rounded-xl text-xs focus:outline-none focus:border-brand-500" />
                    </div>
                    {mapTotalPages > 1 && (
                      <div className="flex items-center gap-1">
                        <button onClick={() => setMapPage((p) => Math.max(0, p - 1))} disabled={mapPage === 0}
                          className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>&#8592;</button>
                        <span className="text-xs text-gray-500">{mapPage + 1}/{mapTotalPages}</span>
                        <button onClick={() => setMapPage((p) => Math.min(mapTotalPages - 1, p + 1))} disabled={mapPage >= mapTotalPages - 1}
                          className={`px-2 py-1 rounded text-xs border disabled:opacity-30 ${springBtn}`}>&#8594;</button>
                      </div>
                    )}
                  </div>
                  <div className="divide-y max-h-[400px] overflow-y-auto">
                    {pagedMaps.length === 0 ? (
                      <p className="px-4 py-8 text-center text-gray-400 text-sm">
                        {selectedProv ? "No hay productos asignados a este proveedor." : "Selecciona un proveedor para ver sus productos."}
                      </p>
                    ) : (
                      <>
                        {pagedMaps.map((m, idx) => (
                          <div key={m.id} className={`px-4 py-2 flex items-center justify-between ${hoverRow}`}
                            style={staggerStyle(true, idx, 50, 15)}>
                            <div>
                              <span className="text-xs text-gray-400 font-mono mr-2">{m.sku}</span>
                              <span className="text-sm text-gray-900">{m.nombre}</span>
                            </div>
                            {m.source === "pt" ? (
                              <span className="text-xs text-green-600">PunTouch</span>
                            ) : (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">Web</span>
                                <button onClick={() => removeMapping(m.sku, (m as { proveedorCod: string }).proveedorCod)} className={`text-red-400 hover:text-red-600 ${springBtn}`}>
                                  <HiTrash className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
                  );
                })()}
              </>
            </Stagger>
          )}
        </>
      )}
    </PageTransition>
  );
}
