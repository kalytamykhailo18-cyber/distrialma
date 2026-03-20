import jsPDF from "jspdf";
import bwipjs from "bwip-js";

export type LabelFormat = "gondola" | "nevera" | "rack";

export interface LabelProduct {
  sku: string;
  name: string;
  barcode: string;
  unit: string;
  cantidadPorCaja: number;
  precioMinorista: number;
  precioMayorista: number;
  precioCajaCerrada: number;
  quantity: number;
}

const FORMATS: Record<
  LabelFormat,
  { w: number; h: number; cols: number; rows: number }
> = {
  gondola: { w: 100, h: 40, cols: 2, rows: 7 },
  nevera: { w: 80, h: 30, cols: 2, rows: 9 },
  rack: { w: 150, h: 50, cols: 1, rows: 5 },
};

const FORMAT_LABELS: Record<LabelFormat, string> = {
  gondola: "Góndola (100×40mm)",
  nevera: "Nevera (80×30mm)",
  rack: "Rack (150×50mm)",
};

export { FORMAT_LABELS };

function formatPrice(price: number): string {
  if (!price || price === 0) return "-";
  return "$" + price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen - 2) + ".." : text;
}

async function renderBarcode(code: string, height: number): Promise<string | null> {
  if (!code || !code.trim()) return null;
  try {
    const canvas = document.createElement("canvas");
    const bcid = /^\d{13}$/.test(code) ? "ean13" : /^\d{8}$/.test(code) ? "ean8" : "code128";
    bwipjs.toCanvas(canvas, {
      bcid,
      text: code,
      scale: 2,
      height,
      includetext: false,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

export async function generateLabelPdf(
  format: LabelFormat,
  products: LabelProduct[]
): Promise<jsPDF> {
  const f = FORMATS[format];
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const marginX = (pageW - f.cols * f.w) / 2;
  const marginY = (pageH - f.rows * f.h) / 2;

  // Pre-render all barcodes
  const barcodeH = format === "nevera" ? 8 : format === "gondola" ? 10 : 14;
  const barcodeCache: Record<string, string | null> = {};
  for (const p of products) {
    if (p.barcode && !barcodeCache[p.barcode]) {
      barcodeCache[p.barcode] = await renderBarcode(p.barcode, barcodeH);
    }
  }

  // Expand products by quantity
  const labels: LabelProduct[] = [];
  for (const p of products) {
    for (let i = 0; i < p.quantity; i++) {
      labels.push(p);
    }
  }

  let labelIdx = 0;

  while (labelIdx < labels.length) {
    if (labelIdx > 0) doc.addPage();

    for (let row = 0; row < f.rows && labelIdx < labels.length; row++) {
      for (let col = 0; col < f.cols && labelIdx < labels.length; col++) {
        const p = labels[labelIdx];
        const x = marginX + col * f.w;
        const y = marginY + row * f.h;

        if (format === "rack") {
          drawRackLabel(doc, p, x, y, f, barcodeCache[p.barcode] || null);
        } else if (format === "gondola") {
          drawGondolaLabel(doc, p, x, y, f, barcodeCache[p.barcode] || null);
        } else {
          drawNeveraLabel(doc, p, x, y, f, barcodeCache[p.barcode] || null);
        }
        labelIdx++;
      }
    }
  }

  return doc;
}

// =========================
// GÓNDOLA — 100×40mm
// =========================
function drawGondolaLabel(
  doc: jsPDF,
  p: LabelProduct,
  x: number,
  y: number,
  f: { w: number; h: number },
  barcodeImg: string | null
) {
  const pad = 2;

  // Border with rounded feel
  doc.setDrawColor(100);
  doc.setLineWidth(0.4);
  doc.rect(x, y, f.w, f.h);

  // Header bar
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 6, "F");

  // Product name in header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(truncate(p.name, 40), x + pad, y + 4.2);
  doc.setTextColor(0);

  // SKU + Unit row
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(100);
  const unitBadge = p.unit || "UN";
  const cajaTxt = p.cantidadPorCaja > 0 ? `  |  Caja x${p.cantidadPorCaja}` : "";
  doc.text(`SKU: ${p.sku}  |  ${unitBadge}${cajaTxt}`, x + pad, y + 9.5);
  doc.setTextColor(0);

  // Barcode (left side)
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, y + 11, 38, 4);
    doc.setFontSize(5.5);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, y + 16.5);
    doc.setTextColor(0);
  }

  // Prices section (right side, stacked)
  const priceX = x + 52;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(120);

  // Minorista
  doc.text("Minorista", priceX, y + 12);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(0);
  doc.text(formatPrice(p.precioMinorista), priceX, y + 15.5);

  // Mayorista
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(120);
  doc.text("Mayorista", priceX, y + 19);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX, y + 23);
  doc.setTextColor(0);

  // Caja Cerrada
  if (p.precioCajaCerrada > 0 && p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(5.5);
    doc.setTextColor(120);
    doc.text("Caja Cerrada", priceX, y + 26.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX, y + 30);
    doc.setTextColor(0);
  }

  // Separator line
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(x + 50, y + 7, x + 50, y + f.h - 2);

  // Bottom line with brand accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y + f.h - 1.2, f.w, 1.2, "F");
}

// =========================
// NEVERA — 80×30mm (compact)
// =========================
function drawNeveraLabel(
  doc: jsPDF,
  p: LabelProduct,
  x: number,
  y: number,
  f: { w: number; h: number },
  barcodeImg: string | null
) {
  const pad = 1.5;

  // Border
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.rect(x, y, f.w, f.h);

  // Header bar
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 5, "F");

  // Product name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text(truncate(p.name, 32), x + pad, y + 3.5);
  doc.setTextColor(0);

  // SKU
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(120);
  doc.text(`SKU: ${p.sku}  |  ${p.unit || "UN"}`, x + pad, y + 8);
  doc.setTextColor(0);

  // Barcode (small, left)
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, y + 9, 28, 3);
    doc.setFontSize(4.5);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, y + 13.5);
    doc.setTextColor(0);
  }

  // Prices (right side, compact)
  const priceX = x + 38;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  doc.setTextColor(120);
  doc.text("Min", priceX, y + 9);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(0);
  doc.text(formatPrice(p.precioMinorista), priceX + 6, y + 9);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(4.5);
  doc.setTextColor(120);
  doc.text("May", priceX, y + 13);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX + 6, y + 13);
  doc.setTextColor(0);

  if (p.precioCajaCerrada > 0 && p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.setTextColor(120);
    doc.text("Caja", priceX, y + 17);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 7, y + 17);
    doc.setTextColor(0);
  }

  // Separator
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(x + 36, y + 6, x + 36, y + f.h - 2);

  // Caja info at bottom
  if (p.cantidadPorCaja > 0) {
    doc.setFontSize(4.5);
    doc.setTextColor(120);
    doc.text(`Caja x${p.cantidadPorCaja} ${p.unit || "UN"}`, x + pad, y + f.h - 2);
    doc.setTextColor(0);
  }

  // Bottom accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y + f.h - 0.8, f.w, 0.8, "F");
}

// =========================
// RACK — 150×50mm (large)
// =========================
function drawRackLabel(
  doc: jsPDF,
  p: LabelProduct,
  x: number,
  y: number,
  f: { w: number; h: number },
  barcodeImg: string | null
) {
  const pad = 3;

  // Border
  doc.setDrawColor(80);
  doc.setLineWidth(0.5);
  doc.rect(x, y, f.w, f.h);

  // Header bar
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 8, "F");

  // Product name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(truncate(p.name, 55), x + pad, y + 5.8);
  doc.setTextColor(0);

  // SKU + Unit + Caja info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(100);
  const cajaTxt = p.cantidadPorCaja > 0 ? `  |  Caja x${p.cantidadPorCaja} ${p.unit || "UN"}` : "";
  doc.text(`SKU: ${p.sku}  |  ${p.unit || "UN"}${cajaTxt}`, x + pad, y + 12.5);
  doc.setTextColor(0);

  // Barcode (left side)
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, y + 15, 55, 6);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, y + 23);
    doc.setTextColor(0);
  }

  // Prices section (right side)
  const priceX = x + 70;

  // Minorista
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("Minorista", priceX, y + 15);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0);
  doc.text(formatPrice(p.precioMinorista), priceX + 25, y + 15);

  // Mayorista (highlighted)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("Mayorista", priceX, y + 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX + 25, y + 22.5);
  doc.setTextColor(0);

  // Caja Cerrada
  if (p.precioCajaCerrada > 0 && p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("Caja Cerrada", priceX, y + 29);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 25, y + 29);
    doc.setTextColor(0);
  }

  // Separator line
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(x + 65, y + 10, x + 65, y + f.h - 3);

  // Bottom accent bar
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y + f.h - 1.5, f.w, 1.5, "F");
}
