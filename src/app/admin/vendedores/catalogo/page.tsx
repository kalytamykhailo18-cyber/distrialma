"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { HiOutlineArrowLeft, HiOutlineDocumentDownload } from "react-icons/hi";
import { PageTransition, Stagger, springBtn } from "@/components/AnimateIn";

interface Product {
  sku: string;
  name: string;
  rubro: string;
  marca: string;
  barcode: string;
  mayorista: number;
  precioVenta: number;
  stock: number;
  image: string | null;
}

interface Option {
  cod: string;
  nombre: string;
}

function formatPrice(n: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(n);
}

// Load image as base64 for jsPDF
function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const maxSize = 200;
        let w = img.width, h = img.height;
        if (w > h) {
          if (w > maxSize) { h = h * (maxSize / w); w = maxSize; }
        } else {
          if (h > maxSize) { w = w * (maxSize / h); h = maxSize; }
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) { resolve(null); return; }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        resolve({ dataUrl: canvas.toDataURL("image/jpeg", 0.7), w, h });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export default function CatalogoPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [rubros, setRubros] = useState<Option[]>([]);
  const [marcas, setMarcas] = useState<Option[]>([]);
  const [selectedRubros, setSelectedRubros] = useState<Set<string>>(new Set());
  const [selectedMarcas, setSelectedMarcas] = useState<Set<string>>(new Set());
  const [markup, setMarkup] = useState(3);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [includeImages, setIncludeImages] = useState(true);
  const [conStock, setConStock] = useState(true);
  const [compactMode, setCompactMode] = useState(false);
  const [showPrices, setShowPrices] = useState(true);
  const [lista, setLista] = useState<"vendedor" | "mayorista" | "especial">("vendedor");
  const [rubroSearch, setRubroSearch] = useState("");
  const [marcaSearch, setMarcaSearch] = useState("");
  const [disclaimer, setDisclaimer] = useState(
    "Precios con entrega incluida. Sujetos a disponibilidad de stock y a confirmación final del pedido."
  );

  const loadData = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (selectedRubros.size > 0) params.set("rubros", Array.from(selectedRubros).join(","));
    if (selectedMarcas.size > 0) params.set("marcas", Array.from(selectedMarcas).join(","));
    if (conStock) params.set("conStock", "1");
    params.set("lista", lista);

    fetch(`/api/admin/vendedores/catalogo?${params}`)
      .then((r) => r.json())
      .then((data) => {
        setProducts(data.products || []);
        setRubros(data.rubros || []);
        setMarcas(data.marcas || []);
        setMarkup(data.markup || 3);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [selectedRubros, selectedMarcas, conStock, lista]);

  useEffect(() => { loadData(); }, [loadData]);

  function toggleRubro(cod: string) {
    setSelectedRubros((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod); else next.add(cod);
      return next;
    });
  }

  function toggleMarca(cod: string) {
    setSelectedMarcas((prev) => {
      const next = new Set(prev);
      if (next.has(cod)) next.delete(cod); else next.add(cod);
      return next;
    });
  }

  async function generatePDF() {
    if (products.length === 0) return;
    setGenerating(true);
    setProgress(0);

    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();

    // Load logo
    let logoB64: string | null = null;
    try {
      const logoRes = await fetch("/logo-pdf.txt");
      const txt = await logoRes.text();
      if (txt && txt.length > 100) logoB64 = txt;
    } catch { /* ignore */ }

    // Cover page
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, h, "F");
    if (logoB64) {
      try {
        doc.addImage(`data:image/png;base64,${logoB64}`, "PNG", w / 2 - 30, 50, 60, 42);
      } catch { /* ignore */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(28);
    doc.setFont("helvetica", "bold");
    doc.text("DISTRIALMA", w / 2, 110, { align: "center" });
    doc.setFontSize(18);
    doc.text("Catálogo de Productos", w / 2, 122, { align: "center" });
    doc.setFontSize(12);
    doc.setFont("helvetica", "normal");
    doc.text(`${products.length} productos`, w / 2, 138, { align: "center" });
    if (showPrices) {
      const listaLabel = lista === "vendedor" ? `Precios Vendedor (Mayorista + ${markup}%)` : lista === "mayorista" ? "Precios Mayorista" : "Precios Especial";
      doc.text(listaLabel, w / 2, 146, { align: "center" });
    } else {
      doc.text("Catálogo sin precios", w / 2, 146, { align: "center" });
    }
    doc.text(new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" }), w / 2, 154, { align: "center" });

    // Group by rubro
    const grouped = new Map<string, Product[]>();
    for (const p of products) {
      const key = p.rubro;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(p);
    }

    let total = 0;
    for (const ps of Array.from(grouped.values())) total += ps.length;

    let processed = 0;

    // Layout config based on compact mode
    const cols = includeImages ? 2 : (compactMode ? 2 : 1);
    const colWidth = (w - 28) / cols;
    const rowHeight = includeImages ? (compactMode ? 30 : 36) : (compactMode ? 10 : 12);
    const imgSize = compactMode ? 24 : 28;
    const nameFontSize = compactMode ? 8 : 8;
    const skuFontSize = compactMode ? 7 : 7;
    const priceFontSize = compactMode ? 10 : 11;

    // Start first page
    doc.addPage();
    let col = 0;
    let rowY = 15;
    let isFirstRubro = true;

    const drawPageHeader = (rubroLabel: string, withCount?: number) => {
      doc.setFillColor(251, 154, 71);
      doc.rect(0, 0, w, 14, "F");
      if (logoB64) {
        try {
          doc.addImage(`data:image/png;base64,${logoB64}`, "PNG", 4, 2, 16, 11);
        } catch { /* ignore */ }
      }
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text(rubroLabel, 24, 9);
      if (withCount !== undefined) {
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text(`${withCount} productos`, w - 14, 9, { align: "right" });
      }
    };

    const drawRubroSeparator = (rubroName: string, count: number, atY: number): number => {
      doc.setFillColor(251, 154, 71);
      doc.rect(8, atY, w - 16, 7, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(rubroName, 12, atY + 5);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(`${count} productos`, w - 12, atY + 5, { align: "right" });
      return atY + 10;
    };

    for (const [rubro, items] of Array.from(grouped.entries())) {
      // First rubro: full page header. Otherwise: inline separator (only if room).
      if (isFirstRubro) {
        drawPageHeader(rubro, items.length);
        rowY = 18;
        col = 0;
        isFirstRubro = false;
      } else {
        // Need to start a new row for the separator
        if (col !== 0) {
          rowY += rowHeight;
          col = 0;
        }
        // If no room for separator + at least 1 product, new page
        if (rowY + rowHeight + 10 > h - 15) {
          doc.addPage();
          drawPageHeader(rubro, items.length);
          rowY = 18;
        } else {
          rowY = drawRubroSeparator(rubro, items.length, rowY);
        }
      }

      for (const p of items) {
        if (rowY + rowHeight > h - 15) {
          doc.addPage();
          drawPageHeader(rubro + " (cont.)");
          rowY = 18;
          col = 0;
        }

        const xCol = 14 + col * colWidth;

        // Card background
        doc.setDrawColor(230, 230, 230);
        doc.setLineWidth(0.2);
        doc.rect(xCol, rowY, colWidth - 3, rowHeight - 2);

        if (includeImages && p.image) {
          try {
            const img = await loadImage(p.image);
            if (img) {
              doc.addImage(img.dataUrl, "JPEG", xCol + 1.5, rowY + 1.5, imgSize, imgSize);
            }
          } catch { /* ignore */ }
        }

        // Text
        const textX = includeImages ? xCol + imgSize + 4 : xCol + 2;
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(nameFontSize);
        doc.setFont("helvetica", "bold");

        // Compute max chars that fit on ONE line (avoid wrapping that overlaps SKU)
        const availTextW = colWidth - (includeImages ? imgSize + 8 : 4);
        const charWidth = nameFontSize * 0.18; // approx mm per char for helvetica bold
        const maxNameLen = Math.floor(availTextW / charWidth);
        const name = p.name.length > maxNameLen ? p.name.substring(0, maxNameLen - 1) + "…" : p.name;
        doc.text(name, textX, rowY + (compactMode ? 7 : 9));

        doc.setFontSize(skuFontSize);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(120, 120, 120);
        const skuText = `SKU: ${p.sku}${p.marca ? "  •  " + p.marca : ""}`;
        doc.text(skuText, textX, rowY + (compactMode ? 13 : 16));

        // Price (only if enabled)
        if (showPrices) {
          doc.setFontSize(priceFontSize);
          doc.setFont("helvetica", "bold");
          doc.setTextColor(251, 154, 71);
          const priceY = compactMode
            ? (includeImages ? rowY + 23 : rowY + 8)
            : (includeImages ? rowY + 28 : rowY + 10);
          doc.text(formatPrice(p.precioVenta), textX, priceY);
        }

        col++;
        if (col >= cols) {
          col = 0;
          rowY += rowHeight;
        }

        processed++;
        if (processed % 20 === 0) {
          setProgress(Math.round((processed / total) * 100));
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }

    // Add disclaimer page
    doc.addPage();
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 18, "F");
    if (logoB64) {
      try {
        doc.addImage(`data:image/png;base64,${logoB64}`, "PNG", 4, 2, 20, 14);
      } catch { /* ignore */ }
    }
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("Información importante", 28, 12);

    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(disclaimer, w - 28);
    doc.text(lines, 14, 30);

    let dy = 30 + lines.length * 5 + 10;
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 120);
    doc.text("Para realizar tu pedido contactanos:", 14, dy);
    dy += 8;
    doc.setFontSize(11);
    doc.setTextColor(30, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.text("WhatsApp Mayorista: +54 9 11 5413-7677", 14, dy);
    dy += 6;
    doc.text("WhatsApp Distribuidora: +54 9 11 5020-2134", 14, dy);
    dy += 12;
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120, 120, 120);
    doc.text(`Catálogo generado el ${new Date().toLocaleDateString("es-AR")}`, 14, dy);

    // Page numbers (skip cover and disclaimer)
    const pageCount = doc.getNumberOfPages();
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    for (let p = 1; p <= pageCount; p++) {
      doc.setPage(p);
      doc.text(`${p}/${pageCount}`, w - 10, h - 5, { align: "right" });
    }

    doc.save(`Catalogo-Distrialma-${new Date().toISOString().slice(0, 10)}.pdf`);
    setGenerating(false);
    setProgress(0);
  }

  return (
    <PageTransition className="max-w-6xl mx-auto px-4 py-6">
      <Stagger delay={0} y={-8}>
        <div className="flex items-center gap-3 mb-6">
          <Link href="/admin/vendedores" className="p-2 hover:bg-gray-100 rounded-lg">
            <HiOutlineArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">Catálogo PDF para vendedores</h1>
        </div>
      </Stagger>

      <Stagger delay={50} y={10}>
      <div className={`bg-white border rounded-xl shadow-sm p-4 mb-4 ${!showPrices ? "opacity-50 pointer-events-none" : ""}`}>
        <label className="block text-sm font-medium text-gray-700 mb-2">Lista de precios</label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            onClick={() => setLista("vendedor")}
            className={`px-3 py-2 text-sm rounded-lg border text-left transition-colors ${springBtn} ${
              lista === "vendedor"
                ? "border-brand-400 bg-brand-50 text-brand-600 font-medium"
                : "border-gray-200 hover:border-gray-300 text-gray-700"
            }`}
          >
            <div className="font-medium">Vendedor</div>
            <div className="text-xs text-gray-500">Mayorista + {markup}% markup</div>
          </button>
          <button
            onClick={() => setLista("mayorista")}
            className={`px-3 py-2 text-sm rounded-lg border text-left transition-colors ${springBtn} ${
              lista === "mayorista"
                ? "border-brand-400 bg-brand-50 text-brand-600 font-medium"
                : "border-gray-200 hover:border-gray-300 text-gray-700"
            }`}
          >
            <div className="font-medium">Mayorista</div>
            <div className="text-xs text-gray-500">Lista 2 — sin markup</div>
          </button>
          <button
            onClick={() => setLista("especial")}
            className={`px-3 py-2 text-sm rounded-lg border text-left transition-colors ${springBtn} ${
              lista === "especial"
                ? "border-brand-400 bg-brand-50 text-brand-600 font-medium"
                : "border-gray-200 hover:border-gray-300 text-gray-700"
            }`}
          >
            <div className="font-medium">Especial</div>
            <div className="text-xs text-gray-500">Lista 3 — solo prods con precio</div>
          </button>
        </div>
      </div>
      </Stagger>

      {/* Filters */}
      <Stagger delay={100} y={10}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <div className="bg-white border rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Rubros ({selectedRubros.size > 0 ? `${selectedRubros.size} seleccionados` : "todos"})
            </h3>
            {selectedRubros.size > 0 && (
              <button onClick={() => setSelectedRubros(new Set())} className="text-xs text-red-500 hover:underline">
                Limpiar
              </button>
            )}
          </div>
          <input
            type="text"
            value={rubroSearch}
            onChange={(e) => setRubroSearch(e.target.value)}
            placeholder="Buscar rubro..."
            className="w-full px-3 py-1.5 mb-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {rubros
              .filter((r) => !rubroSearch || r.nombre.toLowerCase().includes(rubroSearch.toLowerCase()))
              .map((r) => (
                <label key={r.cod} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedRubros.has(r.cod)}
                    onChange={() => toggleRubro(r.cod)}
                    className="rounded border-brand-400"
                  />
                  {r.nombre}
                </label>
              ))}
          </div>
        </div>

        <div className="bg-white border rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Marcas ({selectedMarcas.size > 0 ? `${selectedMarcas.size} seleccionadas` : "todas"})
            </h3>
            {selectedMarcas.size > 0 && (
              <button onClick={() => setSelectedMarcas(new Set())} className="text-xs text-red-500 hover:underline">
                Limpiar
              </button>
            )}
          </div>
          <input
            type="text"
            value={marcaSearch}
            onChange={(e) => setMarcaSearch(e.target.value)}
            placeholder="Buscar marca..."
            className="w-full px-3 py-1.5 mb-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
          />
          <div className="max-h-60 overflow-y-auto space-y-1">
            {marcas
              .filter((m) => !marcaSearch || m.nombre.toLowerCase().includes(marcaSearch.toLowerCase()))
              .map((m) => (
                <label key={m.cod} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-2 py-1 rounded">
                  <input
                    type="checkbox"
                    checked={selectedMarcas.has(m.cod)}
                    onChange={() => toggleMarca(m.cod)}
                    className="rounded border-brand-400"
                  />
                  {m.nombre}
                </label>
              ))}
          </div>
        </div>
      </div>
      </Stagger>

      {/* Disclaimer + options */}
      <Stagger delay={150} y={10}>
      <div className="bg-white border rounded-xl shadow-sm p-4 mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Texto al final del catálogo
        </label>
        <textarea
          value={disclaimer}
          onChange={(e) => setDisclaimer(e.target.value)}
          rows={3}
          className="w-full px-3 py-2 border border-brand-400 rounded-lg text-sm focus:outline-none focus:border-brand-600 focus:ring-1 focus:ring-brand-600"
        />
        <label className="flex items-center gap-2 mt-3 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={conStock}
            onChange={(e) => setConStock(e.target.checked)}
            className="rounded border-brand-400"
          />
          Solo productos con stock
        </label>
        <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(e) => setIncludeImages(e.target.checked)}
            className="rounded border-brand-400"
          />
          Incluir imágenes (más lento, PDF más grande)
        </label>
        <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={compactMode}
            onChange={(e) => setCompactMode(e.target.checked)}
            className="rounded border-brand-400"
          />
          Modo compacto (más productos por página)
        </label>
        <label className="flex items-center gap-2 mt-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={!showPrices}
            onChange={(e) => setShowPrices(!e.target.checked)}
            className="rounded border-brand-400"
          />
          Sin precios (para compartir con clientes)
        </label>
      </div>

      {/* Action */}
      <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-xl shadow-sm p-4">
        <div>
          <p className="text-sm font-medium text-gray-700">
            {loading ? "Cargando..." : `${products.length} productos para incluir`}
          </p>
          {generating && (
            <p className="text-xs text-gray-500 mt-1">
              Generando PDF... {progress}%
            </p>
          )}
        </div>
        <button
          onClick={generatePDF}
          disabled={loading || generating || products.length === 0}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-400 rounded-lg hover:bg-brand-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${springBtn}`}
        >
          <HiOutlineDocumentDownload className="w-5 h-5" />
          {generating ? "Generando..." : "Generar PDF"}
        </button>
      </div>
      </Stagger>
    </PageTransition>
  );
}
