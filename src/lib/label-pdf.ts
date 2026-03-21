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
  if (price === null || price === undefined) return "$0,00";
  return "$" + price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function truncate(text: string, maxLen: number): string {
  return text.length > maxLen ? text.substring(0, maxLen - 2) + ".." : text;
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
  const pad = 3;
  // Layout: 100w x 40h
  // Row1: name(y+2..y+8) + logo(16x16 top-right)
  // Row2: SKU(y+9..y+10)
  // Split at y+11: left=barcode+QR, right=prices

  // Border
  doc.setDrawColor(100);
  doc.setLineWidth(0.4);
  doc.rect(x, y, f.w, f.h);

  // Top accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 1.5, "F");

  // Logo (top right, 2x size = 16x16)
  if (logoImg) {
    doc.addImage(logoImg, "PNG", x + f.w - 18, y + 2, 16, 16);
  }

  // Product name (centered, leave space for logo)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(truncate(p.name, 32), x + (f.w - 18) / 2, y + 6.5, { align: "center" });

  // SKU + Unit
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(120);
  const unitBadge = p.unit || "UN";
  doc.text(`SKU: ${p.sku}  |  ${unitBadge}`, x + pad, y + 11);
  doc.setTextColor(0);

  // --- Split line at y+12 ---
  const splitY = y + 12;

  // LEFT: Barcode
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, splitY + 1, 28, 4);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, splitY + 7);
    doc.setTextColor(0);
  }

  // LEFT: QR (under barcode)
  if (qrImg) {
    doc.addImage(qrImg, "PNG", x + pad, splitY + 8, 14, 14);
  }

  // Separator
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(x + 48, splitY, x + 48, y + f.h - 2);

  // RIGHT COLUMN
  const priceX = x + 50;

  // MAYORISTA (primary)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("MAYORISTA", priceX, splitY + 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX, splitY + 9);
  doc.setTextColor(0);

  // Minorista
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("Min:", priceX, splitY + 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(formatPrice(p.precioMinorista), priceX + 8, splitY + 14);
  }

  // Caja Cerrada
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text("Caja:", priceX, splitY + 19);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 10, splitY + 19);
    doc.setTextColor(0);
  }

  // Caja quantity
  if (p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(`Caja x${p.cantidadPorCaja} ${unitBadge}`, priceX, splitY + 23);
    doc.setTextColor(0);
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
  const pad = 2;
  // Layout: 80w x 30h

  // Border
  doc.setDrawColor(100);
  doc.setLineWidth(0.3);
  doc.rect(x, y, f.w, f.h);

  // Top accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 1, "F");

  // Logo (top right, square)
  if (logoImg) {
    doc.addImage(logoImg, "PNG", x + f.w - 8, y + 1.5, 6, 6);
  }

  // Product name (centered, more padding from top)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.text(truncate(p.name, 26), x + (f.w - 8) / 2, y + 4.5, { align: "center" });

  // SKU
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(120);
  doc.text(`${p.sku} | ${p.unit || "UN"}`, x + pad, y + 7.5);
  doc.setTextColor(0);

  // Barcode
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, y + 9, 22, 3);
    doc.setFontSize(4.5);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, y + 13.5);
    doc.setTextColor(0);
  }

  // QR code (under barcode)
  if (qrImg) {
    doc.addImage(qrImg, "PNG", x + pad, y + 14.5, 10, 10);
  }

  // Separator
  const splitY = y + 8.5;
  doc.setDrawColor(220);
  doc.setLineWidth(0.2);
  doc.line(x + 38, splitY, x + 38, y + f.h - 1);

  // RIGHT COLUMN
  const priceX = x + 40;

  // MAYORISTA
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  doc.setTextColor(120);
  doc.text("MAYORISTA", priceX, splitY + 2);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX, splitY + 6.5);
  doc.setTextColor(0);

  // Minorista
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.setTextColor(120);
    doc.text("Min:", priceX, splitY + 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(0);
    doc.text(formatPrice(p.precioMinorista), priceX + 7, splitY + 10);
  }

  // Caja Cerrada
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.setTextColor(120);
    doc.text("Caja:", priceX, splitY + 13.5);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 9, splitY + 13.5);
    doc.setTextColor(0);
  }

  // Caja quantity
  if (p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(4.5);
    doc.setTextColor(120);
    doc.text(`x${p.cantidadPorCaja} ${p.unit || "UN"}`, priceX, splitY + 17);
    doc.setTextColor(0);
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
  const pad = 3;

  // Border
  doc.setDrawColor(80);
  doc.setLineWidth(0.5);
  doc.rect(x, y, f.w, f.h);

  // Top accent
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y, f.w, 1.5, "F");

  // Logo (top right)
  if (logoImg) {
    doc.addImage(logoImg, "PNG", x + f.w - 13, y + 2, 10, 10);
  }

  // Product name (centered, top — leave space for logo)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text(truncate(p.name, 52), x + (f.w - 13) / 2, y + 6.5, { align: "center" });

  // SKU + Unit (below name)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(100);
  doc.text(`SKU: ${p.sku}  |  ${p.unit || "UN"}`, x + pad, y + 11);
  doc.setTextColor(0);

  // Barcode (left, middle)
  if (barcodeImg) {
    doc.addImage(barcodeImg, "PNG", x + pad, y + 14, 50, 5.5);
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text(p.barcode, x + pad, y + 21.5);
    doc.setTextColor(0);
  }

  // QR code (under barcode)
  if (qrImg) {
    doc.addImage(qrImg, "PNG", x + pad, y + 23, 15, 15);
  }

  // Separator (starts below name+SKU)
  const splitY = y + 12;
  doc.setDrawColor(200);
  doc.setLineWidth(0.3);
  doc.line(x + 65, splitY, x + 65, y + f.h - 2);

  // RIGHT COLUMN (starts below name+SKU)
  const priceX = x + 70;

  // MAYORISTA — primary price (very large)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120);
  doc.text("MAYORISTA", priceX, splitY + 3);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.setTextColor(0, 128, 0);
  doc.text(formatPrice(p.precioMayorista), priceX, splitY + 10);
  doc.setTextColor(0);

  // Minorista
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text("Minorista", priceX, splitY + 15);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0);
    doc.text(formatPrice(p.precioMinorista), priceX + 18, splitY + 15);
  }

  // Caja Cerrada
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text("Caja Cerrada", priceX, splitY + 21);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(234, 88, 12);
    doc.text(formatPrice(p.precioCajaCerrada), priceX + 22, splitY + 21);
    doc.setTextColor(0);
  }

  // Caja quantity
  if (p.cantidadPorCaja > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(120);
    doc.text(`Caja x${p.cantidadPorCaja} ${p.unit || "UN"}`, priceX, splitY + 26);
    doc.setTextColor(0);
  }

  // Bottom accent bar
  doc.setFillColor(251, 161, 71);
  doc.rect(x, y + f.h - 1.5, f.w, 1.5, "F");
}
