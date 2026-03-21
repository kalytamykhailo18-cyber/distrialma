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
  nevera: { w: 80, h: 40, cols: 2, rows: 7 },
  rack: { w: 150, h: 50, cols: 1, rows: 5 },
};

const FORMAT_LABELS: Record<LabelFormat, string> = {
  gondola: "Góndola (100×40mm)",
  nevera: "Nevera (80×40mm)",
  rack: "Rack (150×50mm)",
};

export { FORMAT_LABELS };

function formatPrice(price: number): string {
  if (price === null || price === undefined) return "$0,00";
  return "$" + price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}


async function renderQR(url: string, size: number): Promise<string | null> {
  if (!url) return null;
  try {
    const canvas = document.createElement("canvas");
    bwipjs.toCanvas(canvas, {
      bcid: "qrcode",
      text: url,
      scale: 2,
      width: size,
      height: size,
    });
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// Draw product name with auto-wrap, returns the Y position after the name block
function drawProductName(
  doc: jsPDF, name: string, x: number, y: number, maxW: number, fontSize: number, lineH: number
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fontSize);
  const lines = doc.splitTextToSize(name, maxW);
  const displayLines = lines.slice(0, 2); // max 2 lines
  if (lines.length > 2) {
    displayLines[1] = displayLines[1].substring(0, displayLines[1].length - 2) + "..";
  }
  for (let i = 0; i < displayLines.length; i++) {
    doc.text(displayLines[i], x + maxW / 2, y + (i * lineH), { align: "center" });
  }
  return y + displayLines.length * lineH;
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

  // Load logo
  let logoImg: string | null = null;
  try {
    const logoRes = await fetch("/logo.png");
    const logoBlob = await logoRes.blob();
    logoImg = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(logoBlob);
    });
  } catch { /* no logo */ }

  // Pre-render all barcodes and QR codes
  const barcodeH = format === "nevera" ? 8 : format === "gondola" ? 10 : 14;
  const qrSize = format === "nevera" ? 6 : format === "gondola" ? 8 : 12;
  const barcodeCache: Record<string, string | null> = {};
  const qrCache: Record<string, string | null> = {};
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "https://distrialma-dev.duckdns.org";
  for (const p of products) {
    if (p.barcode && !barcodeCache[p.barcode]) {
      barcodeCache[p.barcode] = await renderBarcode(p.barcode, barcodeH);
    }
    if (!qrCache[p.sku]) {
      qrCache[p.sku] = await renderQR(`${baseUrl}/productos/${p.sku}`, qrSize);
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

        const qrImg = qrCache[p.sku] || null;
        if (format === "rack") {
          drawRackLabel(doc, p, x, y, f, barcodeCache[p.barcode] || null, qrImg, logoImg);
        } else if (format === "gondola") {
          drawGondolaLabel(doc, p, x, y, f, barcodeCache[p.barcode] || null, qrImg, logoImg);
        } else {
          drawNeveraLabel(doc, p, x, y, f, barcodeCache[p.barcode] || null, qrImg, logoImg);
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
  barcodeImg: string | null,
  qrImg: string | null,
  logoImg: string | null
) {
  const pad = 5;
  // Layout: 100w x 40h, padding 5mm

  // Border
  doc.setDrawColor(100);
  doc.setLineWidth(0.4);
  doc.rect(x, y, f.w, f.h);

  // Top accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 1.5, "F");

  // Product name (centered, auto-wrap to 2 lines)
  const nameBottom = drawProductName(doc, p.name, x + pad, y + 6, f.w - pad * 2, 13, 5);

  // SKU + Unit
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  const unitBadge = p.unit || "UN";
  doc.text(`SKU: ${p.sku}  |  ${unitBadge}`, x + pad, nameBottom + 2);
  doc.setTextColor(0);

  // --- Split below SKU ---
  const splitY = nameBottom + 3.5;

  // LEFT: Barcode
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, splitY, 25, 3.5);
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, splitY + 5);
    doc.setTextColor(0);
  }

  // LEFT: QR (under barcode, fit in remaining space)
  if (qrImg) {
    const qrTop = splitY + 6;
    const qrMax = y + f.h - pad - 1 - qrTop; // available height (minus accent+margin)
    const qrS = Math.min(12, Math.max(6, qrMax)); // clamp between 6-12mm
    if (qrS >= 6) {
      doc.addImage(qrImg, "PNG", x + pad, qrTop, qrS, qrS);
    }
  }

  // Separator
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(x + 48, splitY, x + 48, y + f.h - pad);

  // RIGHT COLUMN
  const priceX = x + 51;

  // MAYORISTA (primary) — 10mm block
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("MAYORISTA", priceX, splitY + 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX, splitY + 8.5);
  doc.setTextColor(0);

  // Minorista
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text("Min:", priceX, splitY + 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(0);
    doc.text(formatPrice(p.precioMinorista), priceX + 8, splitY + 13);
  }

  // Caja Cerrada
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text("Caja:", priceX, splitY + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 10, splitY + 18);
    doc.setTextColor(0);
  }

  // Caja quantity — 4mm block
  if (p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text(`Caja x${p.cantidadPorCaja} ${unitBadge}`, priceX, splitY + 21);
    doc.setTextColor(0);
  }

  // Logo (bottom right, with margin)
  if (logoImg) {
    doc.addImage(logoImg, "PNG", x + f.w - pad - 16, y + f.h - pad - 16, 16, 16);
  }

  // Bottom accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y + f.h - 1, f.w, 1, "F");
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
  barcodeImg: string | null,
  qrImg: string | null,
  logoImg: string | null
) {
  const pad = 4;
  // Layout: 80w x 40h

  // Border
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.rect(x, y, f.w, f.h);

  // Top accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 1, "F");

  // Product name (centered, auto-wrap to 2 lines)
  const nameBottom = drawProductName(doc, p.name, x + pad, y + 5.5, f.w - pad * 2, 11, 4.5);

  // SKU
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text(`${p.sku} | ${p.unit || "UN"}`, x + pad, nameBottom + 2);
  doc.setTextColor(0);

  // --- Split below SKU ---
  const splitY = nameBottom + 3.5;

  // Barcode
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, splitY, 22, 3.5);
    doc.setFontSize(5.5);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, splitY + 5);
    doc.setTextColor(0);
  }

  // QR (under barcode, fit in remaining space)
  if (qrImg) {
    const qrTop = splitY + 6;
    const qrMax = y + f.h - pad - 1 - qrTop;
    const qrS = Math.min(12, Math.max(5, qrMax));
    if (qrS >= 5) {
      doc.addImage(qrImg, "PNG", x + pad, qrTop, qrS, qrS);
    }
  }

  // Separator
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(x + 38, splitY, x + 38, y + f.h - pad);

  // RIGHT COLUMN
  const priceX = x + 40;

  // MAYORISTA
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(120);
  doc.text("MAYORISTA", priceX, splitY + 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX, splitY + 8);
  doc.setTextColor(0);

  // Minorista
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text("Min:", priceX, splitY + 13);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(formatPrice(p.precioMinorista), priceX + 8, splitY + 13);
  }

  // Caja Cerrada
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text("Caja:", priceX, splitY + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 10, splitY + 18);
    doc.setTextColor(0);
  }

  // Caja quantity
  if (p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text(`x${p.cantidadPorCaja} ${p.unit || "UN"}`, priceX, splitY + 22);
    doc.setTextColor(0);
  }

  // Logo (bottom right, with margin)
  if (logoImg) {
    doc.addImage(logoImg, "PNG", x + f.w - pad - 13, y + f.h - pad - 13, 13, 13);
  }

  // Bottom accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y + f.h - 0.6, f.w, 0.6, "F");
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
  barcodeImg: string | null,
  qrImg: string | null,
  logoImg: string | null
) {
  const pad = 5;

  // Border
  doc.setDrawColor(80);
  doc.setLineWidth(0.5);
  doc.rect(x, y, f.w, f.h);

  // Top accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 1.5, "F");

  // Product name (centered, auto-wrap to 2 lines)
  const nameBottom = drawProductName(doc, p.name, x + pad, y + 7, f.w - pad * 2, 16, 6);

  // SKU + Unit
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`SKU: ${p.sku}  |  ${p.unit || "UN"}`, x + pad, nameBottom + 2);
  doc.setTextColor(0);

  // --- Split below SKU ---
  const splitY = nameBottom + 4;

  // Barcode
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, splitY, 42, 6);
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, splitY + 8.5);
    doc.setTextColor(0);
  }

  // QR (under barcode, fit in remaining space)
  if (qrImg) {
    const qrTop = splitY + 10;
    const qrMax = y + f.h - pad - 2 - qrTop;
    const qrS = Math.min(18, Math.max(8, qrMax));
    if (qrS >= 8) {
      doc.addImage(qrImg, "PNG", x + pad, qrTop, qrS, qrS);
    }
  }

  // Separator
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(x + 65, splitY, x + 65, y + f.h - pad);

  // RIGHT COLUMN
  const priceX = x + 70;

  // MAYORISTA
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text("MAYORISTA", priceX, splitY + 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(24);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX, splitY + 12);
  doc.setTextColor(0);

  // Minorista
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Min:", priceX, splitY + 18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text(formatPrice(p.precioMinorista), priceX + 9, splitY + 18);
  }

  // Caja Cerrada
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Caja:", priceX, splitY + 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 11, splitY + 24);
    doc.setTextColor(0);
  }

  // Caja quantity
  if (p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text(`Caja x${p.cantidadPorCaja} ${p.unit || "UN"}`, priceX, splitY + 29);
    doc.setTextColor(0);
  }

  // Logo (bottom right, with margin)
  if (logoImg) {
    doc.addImage(logoImg, "PNG", x + f.w - pad - 20, y + f.h - pad - 20, 20, 20);
  }

  // Bottom accent bar
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y + f.h - 1.5, f.w, 1.5, "F");
}
