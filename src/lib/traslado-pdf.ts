import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { readFileSync } from "fs";
import { join } from "path";

const DEFAULT_DEPOSITO_NAMES: Record<string, string> = {
  "0": "Distribuidora / Mayorista",
  "1": "Pontevedra",
  "2": "Minorista",
  "3": "Cervantes",
};

async function getDepositoName(cod: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key: `deposito_name_${cod}` } });
  if (s?.value) return s.value;
  return DEFAULT_DEPOSITO_NAMES[cod] || `Deposito ${cod}`;
}

function loadLogoBase64(): string | null {
  try {
    return readFileSync(join(process.cwd(), "public", "logo-pdf.txt"), "utf8").trim();
  } catch {
    return null;
  }
}

export async function generateTrasladoPdf(transferId: number): Promise<Buffer> {
  const transfer = await prisma.stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: { orderBy: { id: "asc" } } },
  });
  if (!transfer) throw new Error("Traslado no encontrado");

  const [origenName, destinoName] = await Promise.all([
    getDepositoName(transfer.depositoOrigen),
    getDepositoName(transfer.depositoDestino),
  ]);

  // Look up unidad (KG vs UN) and pesoHorma (Palabra2, avg KG per piece) per sku.
  // For KG items with a pesoHorma > 0 we can show estimated pieces.
  const productMeta = new Map<string, { unidad: string; pesoHorma: number }>();
  try {
    const skus = Array.from(new Set(transfer.items.map((i) => i.sku.padStart(7, " "))));
    if (skus.length > 0) {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      const codList = skus.map((s) => `'${s.replace(/'/g, "")}'`).join(",");
      const res = await pool.request().query(`
        SELECT
          LTRIM(RTRIM(Cod)) AS sku,
          UPPER(LTRIM(RTRIM(ISNULL(Unidad, '')))) AS unidad,
          LTRIM(RTRIM(ISNULL(Palabra2, ''))) AS pesoHorma
        FROM [${dbProd}].dbo.Productos
        WHERE Cod IN (${codList})
      `);
      for (const r of res.recordset) {
        const peso = parseFloat(String(r.pesoHorma).replace(",", "."));
        productMeta.set(r.sku, { unidad: r.unidad || "", pesoHorma: isFinite(peso) ? peso : 0 });
      }
    }
  } catch (e) {
    console.error("traslado-pdf: producto lookup failed:", (e as Error).message);
  }

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 8;

  // Header band
  doc.setFillColor(251, 154, 71);
  doc.rect(0, 0, w, 28, "F");
  const logoB64 = loadLogoBase64();
  if (logoB64 && logoB64.length > 100) {
    try { doc.addImage(`data:image/png;base64,${logoB64}`, "PNG", 10, 4, 30, 21); } catch { /* ignore */ }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("Distrialma", 46, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Remito de traslado entre sucursales", 46, 19);
  doc.text("Documento interno", 46, 23);
  const fechaStr = transfer.createdAt.toLocaleDateString("es-AR") + " " + transfer.createdAt.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Remito N° ${transfer.id}`, w - 10, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Fecha: ${fechaStr}`, w - 10, 19, { align: "right" });
  doc.setFontSize(8);
  doc.text(`Registrado por: ${transfer.usuario}`, w - 10, 24, { align: "right" });

  y = 36;

  if (transfer.estado === "anulado") {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(220, 50, 50);
    doc.rect(10, y, w - 20, 10, "FD");
    doc.setTextColor(180, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    const anuladoStr = transfer.anuladoAt ? transfer.anuladoAt.toLocaleDateString("es-AR") : "";
    doc.text(`ANULADO — ${anuladoStr}`, w / 2, y + 7, { align: "center" });
    y += 14;
  }

  // Origen / Destino blocks
  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Origen:", 12, y);
  doc.setFont("helvetica", "normal");
  doc.text(`[${transfer.depositoOrigen}] ${origenName}`, 30, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.text("Destino:", 12, y);
  doc.setFont("helvetica", "normal");
  doc.text(`[${transfer.depositoDestino}] ${destinoName}`, 30, y);
  y += 7;

  if (transfer.notas) {
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(`Notas: ${transfer.notas}`, 12, y);
    y += 5;
    doc.setFont("helvetica", "normal");
  }

  // Items table — extra column for "Piezas est." (only filled on KG items with pesoHorma)
  const piezasColX = w - 45;
  doc.setFillColor(247, 248, 250);
  doc.rect(10, y, w - 20, 7, "F");
  doc.setTextColor(80, 80, 80);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("SKU", 12, y + 5);
  doc.text("Producto", 32, y + 5);
  doc.text("Piezas est.", piezasColX, y + 5, { align: "right" });
  doc.text("Cantidad", w - 12, y + 5, { align: "right" });
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  let totalCant = 0;
  let totalPiezasEst = 0;
  for (const it of transfer.items) {
    if (y > pageH - 30) {
      doc.addPage();
      y = 20;
    }
    doc.text(it.sku, 12, y);
    const name = String(it.productName);
    const truncated = name.length > 50 ? name.substring(0, 48) + "…" : name;
    doc.text(truncated, 32, y);
    const c = Number(it.cantidad);
    totalCant += c;

    // Piezas estimadas — only meaningful for KG products with a known avg pesoHorma
    const meta = productMeta.get(it.sku.padStart(7, " "));
    if (meta && meta.unidad === "KG" && meta.pesoHorma > 0) {
      const piezas = c / meta.pesoHorma;
      totalPiezasEst += piezas;
      doc.setTextColor(110, 110, 110);
      doc.text(`${piezas.toLocaleString("es-AR", { maximumFractionDigits: 1 })} (${meta.pesoHorma.toLocaleString("es-AR", { maximumFractionDigits: 2 })} kg/pieza)`, piezasColX, y, { align: "right" });
      doc.setTextColor(40, 40, 40);
    } else {
      doc.setTextColor(180, 180, 180);
      doc.text("—", piezasColX, y, { align: "right" });
      doc.setTextColor(40, 40, 40);
    }
    doc.text(c.toLocaleString("es-AR"), w - 12, y, { align: "right" });
    y += 5;
  }

  y += 3;
  doc.setDrawColor(150, 150, 150);
  doc.line(w - 60, y, w - 10, y);
  y += 5;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Total items:", w - 62, y, { align: "right" });
  doc.text(String(transfer.items.length), w - 12, y, { align: "right" });
  y += 5;
  doc.text("Cantidad total:", w - 62, y, { align: "right" });
  doc.text(totalCant.toLocaleString("es-AR"), w - 12, y, { align: "right" });
  if (totalPiezasEst > 0) {
    y += 5;
    doc.text("Piezas estimadas:", w - 62, y, { align: "right" });
    doc.text(`~ ${totalPiezasEst.toLocaleString("es-AR", { maximumFractionDigits: 1 })}`, w - 12, y, { align: "right" });
  }

  // Signature lines at bottom
  const sigY = pageH - 35;
  doc.setDrawColor(150, 150, 150);
  doc.line(20, sigY, 90, sigY);
  doc.line(w - 90, sigY, w - 20, sigY);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text("Entrega (origen)", 55, sigY + 4, { align: "center" });
  doc.text("Recibe (destino)", w - 55, sigY + 4, { align: "center" });

  return Buffer.from(doc.output("arraybuffer") as ArrayBuffer);
}
