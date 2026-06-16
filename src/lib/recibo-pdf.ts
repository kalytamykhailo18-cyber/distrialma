import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { readFileSync } from "fs";
import { join } from "path";
import { numeroEnLetras } from "@/lib/numeroEnLetras";

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function loadLogoBase64(): string | null {
  try {
    return readFileSync(join(process.cwd(), "public", "logo-pdf.txt"), "utf8").trim();
  } catch {
    return null;
  }
}

async function fetchImageDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    const mime = res.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

/**
 * Genera el PDF del recibo de pago. Devuelve el buffer.
 * No realiza upload a Drive — eso es responsabilidad del caller.
 */
export async function generateReciboPdf(paymentId: number): Promise<Buffer> {
  const payment = await prisma.supplierPayment.findUnique({
    where: { id: paymentId },
    include: { cheques: { orderBy: { fechaCobro: "asc" } } },
  });
  if (!payment) throw new Error("Recibo no encontrado");

  // Datos del proveedor desde PunTouch
  let cuit = "";
  let direccion = "";
  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const r = await pool
      .request()
      .input("cod", String(payment.proveedorCod).padStart(7, " "))
      .query(`
        SELECT LTRIM(RTRIM(ISNULL(CUIT, ''))) AS cuit,
               LTRIM(RTRIM(ISNULL(Calle, ''))) AS calle,
               LTRIM(RTRIM(ISNULL(Nume, ''))) AS nume,
               LTRIM(RTRIM(ISNULL(Localidad, ''))) AS localidad
        FROM [${dbProd}].dbo.Proveedores
        WHERE Cod = @cod
      `);
    if (r.recordset[0]) {
      cuit = r.recordset[0].cuit || "";
      const dirParts = [r.recordset[0].calle, r.recordset[0].nume].filter(Boolean).join(" ");
      direccion = dirParts + (r.recordset[0].localidad ? `, ${r.recordset[0].localidad}` : "");
    }
  } catch (e) {
    console.error("[RECIBO-PROV-LOOKUP]", (e as Error).message);
  }

  // Each cheque may have 0..N photos stored as a JSON array in `fotoUrls`.
  const chequePhotos: string[][] = await Promise.all(
    payment.cheques.map(async (c) => {
      if (!c.fotoUrls) return [];
      let urls: string[] = [];
      try {
        const parsed = JSON.parse(c.fotoUrls);
        if (Array.isArray(parsed)) urls = parsed.filter((s) => typeof s === "string");
      } catch {
        urls = [c.fotoUrls];
      }
      const dataUris = await Promise.all(urls.map((u) => fetchImageDataUri(u)));
      return dataUris.filter((d): d is string => !!d);
    })
  );
  // efectivoImagenes is a TEXT column containing a JSON array of URLs
  const efectivoUrls: string[] = (() => {
    if (!payment.efectivoImagenes) return [];
    try {
      const arr = JSON.parse(payment.efectivoImagenes);
      return Array.isArray(arr) ? arr.filter((s) => typeof s === "string") : [];
    } catch {
      return [payment.efectivoImagenes];
    }
  })();
  const efectivoPhotos: (string | null)[] = await Promise.all(
    efectivoUrls.map((u) => fetchImageDataUri(u))
  );

  // Marca logos of the proveedor.  Prefer explicit ProveedorMarca rows
  // (admin-curated) over the implicit Stock×Productos cross-query.
  const marcaLogoDataUris: string[] = await (async () => {
    try {
      const explicit = await prisma.proveedorMarca.findMany({
        where: { proveedorCod: String(payment.proveedorCod) },
        orderBy: { position: "asc" },
        take: 4,
      });
      let codes: string[] = explicit.map((e) => e.marcaCod);

      if (codes.length === 0) {
        // Fall back to inferred chain when no explicit assoc exists
        const pool = await getPool();
        const dbProd = getDbName("productos");
        const marcasQ = await pool
          .request()
          .input("prov", String(payment.proveedorCod).padStart(7, " "))
          .query(`
            SELECT TOP 4 LTRIM(RTRIM(p.Marca)) AS marcaCod, COUNT(*) AS n
            FROM [${dbProd}].dbo.Productos p
            JOIN [${dbProd}].dbo.Stock s ON LTRIM(RTRIM(s.CodProducto)) = LTRIM(RTRIM(p.Cod))
            WHERE LTRIM(RTRIM(p.Marca)) <> ''
              AND (
                LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) = LTRIM(RTRIM(@prov))
                OR LTRIM(RTRIM(ISNULL(s.Proveedor2,''))) = LTRIM(RTRIM(@prov))
                OR LTRIM(RTRIM(ISNULL(s.Proveedor3,''))) = LTRIM(RTRIM(@prov))
              )
            GROUP BY LTRIM(RTRIM(p.Marca))
            ORDER BY COUNT(*) DESC
          `);
        codes = marcasQ.recordset.map((r: { marcaCod: string }) => r.marcaCod);
      }
      if (codes.length === 0) return [];

      const skus = codes.map((c) => `brand-${c}`);
      const images = await prisma.productImage.findMany({
        where: { sku: { in: skus } },
        orderBy: { position: "asc" },
      });
      // De-dup: one logo per brand, keep order from codes
      const firstBySku = new Map<string, string>();
      for (const img of images) {
        if (!firstBySku.has(img.sku)) firstBySku.set(img.sku, img.filename);
      }
      const urls = codes.map((c) => firstBySku.get(`brand-${c}`)).filter((u): u is string => !!u);
      const dataUris = await Promise.all(urls.map((u) => fetchImageDataUri(u)));
      return dataUris.filter((d): d is string => !!d);
    } catch (e) {
      console.error("[RECIBO-MARCA-LOGOS]", (e as Error).message);
      return [];
    }
  })();

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 8;

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
  doc.text("Recibo de pago a proveedor", 46, 19);
  doc.text("Documento interno para firma del proveedor", 46, 23);
  const fechaStr = payment.createdAt.toLocaleDateString("es-AR");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(`Recibo N° ${payment.id}`, w - 10, 13, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Fecha: ${fechaStr}`, w - 10, 19, { align: "right" });
  doc.setFontSize(8);
  doc.text(`Registrado por: ${payment.usuario || "—"}`, w - 10, 24, { align: "right" });

  // Marca logos centered in the empty slot between "Distrialma" block and the
  // "Recibo N° / Fecha" right-side block. Each logo gets a white pill so it
  // reads against the orange band regardless of logo background.
  if (marcaLogoDataUris.length > 0) {
    const slotLeft = 120;
    const slotRight = w - 65;
    const slotWidth = slotRight - slotLeft;
    const slotMid = (slotLeft + slotRight) / 2;
    const logoH = 13;
    const logoW = 18;
    const gap = 3;
    const totalW = marcaLogoDataUris.length * logoW + (marcaLogoDataUris.length - 1) * gap;
    if (totalW <= slotWidth) {
      let x = slotMid - totalW / 2;
      const y0 = 14 - logoH / 2 + 7; // center vertically within 28mm header
      for (const data of marcaLogoDataUris) {
        // White rounded background so logos with dark / transparent backgrounds remain legible
        doc.setFillColor(255, 255, 255);
        doc.roundedRect(x - 0.5, y0 - 0.5, logoW + 1, logoH + 1, 1.5, 1.5, "F");
        try { doc.addImage(data, "PNG", x, y0, logoW, logoH); } catch { /* ignore */ }
        x += logoW + gap;
      }
    }
  }

  y = 36;

  // Estado anulado: banner
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anuladoAt = (payment as any).anuladoAt as Date | null | undefined;
  if (anuladoAt) {
    doc.setFillColor(254, 226, 226);
    doc.setDrawColor(220, 50, 50);
    doc.rect(10, y, w - 20, 10, "FD");
    doc.setTextColor(180, 30, 30);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(`ANULADO — ${anuladoAt.toLocaleDateString("es-AR")}`, w / 2, y + 7, { align: "center" });
    y += 14;
  }

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Proveedor:", 12, y);
  doc.setFont("helvetica", "normal");
  doc.text(payment.proveedorName, 36, y);
  y += 5;
  if (cuit) { doc.setFontSize(8); doc.text(`CUIT: ${cuit}`, 12, y); y += 4; }
  if (direccion) { doc.setFontSize(8); doc.text(direccion, 12, y); y += 4; }
  y += 4;

  const total = Number(payment.monto);
  const totalLetras = numeroEnLetras(total);
  doc.setFillColor(247, 248, 250);
  doc.setDrawColor(220, 220, 220);
  doc.rect(10, y, w - 20, 22, "FD");
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);
  doc.setFont("helvetica", "normal");
  doc.text("Recibi de DISTRIALMA la suma de:", 14, y + 5);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(20, 20, 20);
  const letrasLines = doc.splitTextToSize(totalLetras, w - 28);
  doc.text(letrasLines, 14, y + 11);
  doc.setFontSize(13);
  doc.setTextColor(180, 60, 0);
  doc.text(formatPrice(total), w - 14, y + 17, { align: "right" });
  y += 26;

  if (payment.concepto) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text(`Concepto: ${payment.concepto}`, 12, y);
    y += 5;
  }

  if (payment.cheques.length > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text(`Cheques (${payment.cheques.length})`, 12, y);
    y += 5;
    doc.setFillColor(245, 245, 245);
    doc.rect(10, y - 3, w - 20, 6, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(80, 80, 80);
    doc.text("Tipo", 12, y + 1);
    doc.text("Banco", 28, y + 1);
    doc.text("N°", 70, y + 1);
    doc.text("Emision", 96, y + 1);
    doc.text("Cobro", 120, y + 1);
    doc.text("Importe", w - 12, y + 1, { align: "right" });
    y += 7;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);
    for (let i = 0; i < payment.cheques.length; i++) {
      const c = payment.cheques[i];
      if (y > pageH - 50) { doc.addPage(); y = 15; }
      doc.text(c.tipo === "propio" ? "Propio" : "3ero", 12, y);
      doc.text(c.banco.substring(0, 22), 28, y);
      doc.text(c.numero, 70, y);
      doc.text(c.fechaEmision.toLocaleDateString("es-AR"), 96, y);
      doc.text(c.fechaCobro.toLocaleDateString("es-AR"), 120, y);
      doc.setFont("helvetica", "bold");
      doc.text(formatPrice(Number(c.monto)), w - 12, y, { align: "right" });
      doc.setFont("helvetica", "normal");
      y += 5;
      if (c.tipo === "tercero" && c.librador) {
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        doc.text(`Librador: ${c.librador}${c.cuitLibrador ? " (" + c.cuitLibrador + ")" : ""}`, 28, y);
        doc.setFontSize(8);
        doc.setTextColor(40, 40, 40);
        y += 4;
      }
    }
    y += 3;
    const thumbW = (w - 24 - 6) / 2;
    const thumbH = thumbW / 2.35;
    let drawnInRow = 0;
    for (let i = 0; i < payment.cheques.length; i++) {
      const photos = chequePhotos[i] || [];
      for (let j = 0; j < photos.length; j++) {
        if (y + thumbH > pageH - 50) { doc.addPage(); y = 15; drawnInRow = 0; }
        const x = 12 + drawnInRow * (thumbW + 6);
        try {
          doc.addImage(photos[j], "JPEG", x, y, thumbW, thumbH);
        } catch { /* ignore bad images */ }
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        const label = photos.length > 1 ? `#${payment.cheques[i].numero} (${j + 1}/${photos.length})` : `#${payment.cheques[i].numero}`;
        doc.text(label, x, y + thumbH + 3);
        drawnInRow++;
        if (drawnInRow === 2) {
          y += thumbH + 6;
          drawnInRow = 0;
        }
      }
    }
    if (drawnInRow > 0) {
      y += thumbH + 6;
    }
  }

  if (Number(payment.montoEfectivo) > 0) {
    if (y > pageH - 60) { doc.addPage(); y = 15; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text("Efectivo", 12, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Monto: ${formatPrice(Number(payment.montoEfectivo))}`, 12, y);
    y += 6;
    // Render all efectivo photos (multiple remitos per payment, 2 per row)
    const efectivoFiltered = efectivoPhotos.filter((p): p is string => !!p);
    if (efectivoFiltered.length > 0) {
      const ew = (w - 24 - 6) / 2;
      const eh = ew * 0.7;
      let drawn = 0;
      for (let i = 0; i < efectivoFiltered.length; i++) {
        if (y + eh > pageH - 40) { doc.addPage(); y = 15; drawn = 0; }
        const x = 12 + drawn * (ew + 6);
        try { doc.addImage(efectivoFiltered[i], "JPEG", x, y, ew, eh); } catch { /* ignore */ }
        drawn++;
        if (drawn === 2) {
          y += eh + 4;
          drawn = 0;
        }
      }
      if (drawn > 0) y += eh + 4;
    }
  }

  if (Number(payment.montoTransferencia) > 0) {
    if (y > pageH - 40) { doc.addPage(); y = 15; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(20, 20, 20);
    doc.text("Transferencia", 12, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Monto: ${formatPrice(Number(payment.montoTransferencia))}`, 12, y);
    y += 5;
    if (payment.transferenciaRef) {
      doc.text(`Referencia: ${payment.transferenciaRef}`, 12, y);
      y += 5;
    }
    y += 2;
  }

  // Ajuste (admin) — appears above the total line, can be negative
  const ajusteAmt = Number(payment.montoAjuste);
  if (ajusteAmt !== 0) {
    if (y > pageH - 40) { doc.addPage(); y = 15; }
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(180, 100, 20);
    doc.text("Ajuste", 12, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(`Monto: ${ajusteAmt >= 0 ? "+" : ""}${formatPrice(ajusteAmt)}`, 12, y);
    y += 5;
    if (payment.ajusteMotivo) {
      doc.setFontSize(8);
      doc.setTextColor(120, 80, 30);
      doc.text(`Motivo: ${payment.ajusteMotivo}`, 12, y);
      y += 5;
    }
    y += 2;
  }

  if (y > pageH - 30) { doc.addPage(); y = 15; }
  doc.setDrawColor(180, 180, 180);
  doc.line(10, y, w - 10, y);
  y += 7;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(20, 20, 20);
  doc.text("Total", w - 50, y, { align: "right" });
  doc.text(formatPrice(total), w - 12, y, { align: "right" });
  y += 12;

  if (y > pageH - 40) { doc.addPage(); y = pageH - 40; }
  y = Math.max(y, pageH - 35);
  doc.setDrawColor(120, 120, 120);
  doc.line(20, y, w / 2 - 5, y);
  doc.line(w / 2 + 5, y, w - 20, y);
  y += 4;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(120, 120, 120);
  doc.text("Firma y aclaracion del proveedor", (20 + w / 2 - 5) / 2, y, { align: "center" });
  doc.text("Firma DISTRIALMA", (w / 2 + 5 + w - 20) / 2, y, { align: "center" });
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text("Recibo de pago — Distrialma — s.e.u.o.", w / 2, pageH - 6, { align: "center" });

  return Buffer.from(doc.output("arraybuffer"));
}
