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
  { w: number; h: number; cols: number; rows: number; fontSize: number; barcodeH: number }
> = {
  gondola: { w: 100, h: 40, cols: 2, rows: 7, fontSize: 8, barcodeH: 10 },
  nevera: { w: 80, h: 30, cols: 2, rows: 9, fontSize: 7, barcodeH: 8 },
  rack: { w: 150, h: 50, cols: 1, rows: 5, fontSize: 11, barcodeH: 14 },
};

const FORMAT_LABELS: Record<LabelFormat, string> = {
  gondola: "Góndola (100×40mm)",
  nevera: "Nevera (80×30mm)",
  rack: "Rack (150×50mm)",
};

export { FORMAT_LABELS };

function formatPrice(price: number): string {
  return "$" + price.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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
  const barcodeCache: Record<string, string | null> = {};
  for (const p of products) {
    if (p.barcode && !barcodeCache[p.barcode]) {
      barcodeCache[p.barcode] = await renderBarcode(p.barcode, f.barcodeH);
    }
  }

  // Expand products by quantity
  const labels: LabelProduct[] = [];
  for (const p of products) {
    for (let i = 0; i < p.quantity; i++) {
      labels.push(p);
    }
  }

  const labelsPerPage = f.cols * f.rows;
  let labelIdx = 0;

  while (labelIdx < labels.length) {
    if (labelIdx > 0) doc.addPage();

    for (let row = 0; row < f.rows && labelIdx < labels.length; row++) {
      for (let col = 0; col < f.cols && labelIdx < labels.length; col++) {
        const p = labels[labelIdx];
        const x = marginX + col * f.w;
        const y = marginY + row * f.h;

        drawLabel(doc, p, x, y, f, barcodeCache[p.barcode] || null);
        labelIdx++;
      }
    }
  }

  return doc;
}

function drawLabel(
  doc: jsPDF,
  p: LabelProduct,
  x: number,
  y: number,
  f: { w: number; h: number; fontSize: number; barcodeH: number },
  barcodeImg: string | null
) {
  const pad = 2;
  const innerW = f.w - pad * 2;

  // Border
  doc.setDrawColor(180);
  doc.setLineWidth(0.3);
  doc.rect(x, y, f.w, f.h);

  // Product name
  const nameMaxLen = f.w <= 80 ? 28 : f.w <= 100 ? 38 : 55;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(f.fontSize);
  doc.text(truncate(p.name, nameMaxLen), x + pad, y + pad + f.fontSize * 0.35);

  // SKU + Unit + Qty per box
  const infoY = y + pad + f.fontSize * 0.35 + f.fontSize * 0.45;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(f.fontSize - 2);
  const unitBadge = p.unit || "UN";
  const cajaTxt = p.cantidadPorCaja > 0 ? ` | x${p.cantidadPorCaja} caja` : "";
  doc.text(`SKU: ${p.sku}  |  ${unitBadge}${cajaTxt}`, x + pad, infoY);

  // Barcode
  const barcodeY = infoY + 1.5;
  const barcodeW = innerW * 0.6;
  const barcodePrintH = f.barcodeH * 0.35;

  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, barcodeY, barcodeW, barcodePrintH);
    doc.setFontSize(f.fontSize - 3);
    doc.text(p.barcode, x + pad, barcodeY + barcodePrintH + f.fontSize * 0.25);
  } else {
    doc.setFontSize(f.fontSize - 3);
    doc.setTextColor(150);
    doc.text("SIN CODIGO", x + pad, barcodeY + barcodePrintH * 0.5);
    doc.setTextColor(0);
  }

  // Prices row at bottom
  const priceY = y + f.h - pad - 0.5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(f.fontSize - 1);

  const priceSpacing = innerW / 3;
  // Minorista
  doc.text(`Min ${formatPrice(p.precioMinorista)}`, x + pad, priceY);
  // Mayorista
  doc.text(`May ${formatPrice(p.precioMayorista)}`, x + pad + priceSpacing, priceY);
  // Caja Cerrada
  doc.text(`Caja ${formatPrice(p.precioCajaCerrada)}`, x + pad + priceSpacing * 2, priceY);
}
