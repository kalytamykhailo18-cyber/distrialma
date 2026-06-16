import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { readFileSync } from "fs";
import { join } from "path";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

const SUC_NAMES: Record<string, string> = {
  "1": "Minorista",
  "2": "Mayorista",
  "6": "Pontevedra",
  "7": "Distribuidora",
  "10": "Reventa",
  "11": "PedidosYa",
};

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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const boleta = (searchParams.get("boleta") || "").trim();
  if (!boleta) {
    return NextResponse.json({ error: "boleta requerida" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");

    const dbEmpleados = getDbName("empleados");
    const headerRes = await pool.request().input("boleta", boleta.padStart(9, " ")).query(`
      SELECT LTRIM(RTRIM(t.Boleta)) AS boleta,
        LTRIM(RTRIM(t.Sucursal)) AS sucursal,
        LTRIM(RTRIM(t.Fechora)) AS fechora,
        LTRIM(RTRIM(ISNULL(t.Nombre, ''))) AS clienteNombre,
        LTRIM(RTRIM(ISNULL(t.CUIT, ''))) AS cuit,
        LTRIM(RTRIM(ISNULL(t.Calle, ''))) AS calle,
        LTRIM(RTRIM(ISNULL(t.Nume, ''))) AS nume,
        LTRIM(RTRIM(ISNULL(t.Localidad, ''))) AS localidad,
        LTRIM(RTRIM(ISNULL(t.Empleado, ''))) AS empleadoCod,
        LTRIM(RTRIM(ISNULL(e.Nombre, ''))) AS empleadoNombre,
        t.Cant AS cant,
        t.Total AS total
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbEmpleados}].dbo.Empleados e
        ON LTRIM(RTRIM(e.Cod)) COLLATE Modern_Spanish_CI_AS = LTRIM(RTRIM(t.Empleado)) COLLATE Modern_Spanish_CI_AS
      WHERE LTRIM(RTRIM(t.Boleta)) = LTRIM(RTRIM(@boleta)) AND t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
    `);
    if (headerRes.recordset.length === 0) {
      return NextResponse.json({ error: "Boleta no encontrada" }, { status: 404 });
    }
    const h = headerRes.recordset[0];

    const itemsRes = await pool.request().input("boleta", boleta.padStart(9, " ")).query(`
      SELECT LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
        LTRIM(RTRIM(t.Producto)) AS sku,
        UPPER(LTRIM(RTRIM(ISNULL(p.Unidad, '')))) AS unidad,
        LTRIM(RTRIM(ISNULL(p.Palabra2, ''))) AS pesoMayorista,
        LTRIM(RTRIM(ISNULL(p.Palabra3, ''))) AS cantidadPorCaja,
        t.Cant AS cantidad, t.Precio AS precio, t.Impo AS impo
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos p ON p.Cod = t.Producto
      WHERE LTRIM(RTRIM(t.Boleta)) = LTRIM(RTRIM(@boleta)) AND t.Tipo = 'I'
      ORDER BY CAST(t.Itm AS INT)
    `);
    const items = itemsRes.recordset;

    // For the ~Unid. column: only filled for productos pesables (Unidad = KG),
    // where it estimates the number of hormas/piezas (cantidad / peso por horma).
    const aproxUnid = (unidad: string, pesoMayoristaRaw: string, cantidad: number): string => {
      if (unidad !== "KG") return "";
      const peso = parseFloat(pesoMayoristaRaw) || 0;
      if (peso <= 0) return "";
      const n = cantidad / peso;
      return `~${n < 10 ? Math.round(n * 10) / 10 : Math.round(n)}`;
    };

    // Generate PDF
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 8;

    // Header band
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 28, "F");

    // Logo
    const logoB64 = loadLogoBase64();
    if (logoB64 && logoB64.length > 100) {
      try { doc.addImage(`data:image/png;base64,${logoB64}`, "PNG", 10, 4, 30, 21); } catch { /* ignore */ }
    }

    // Title + subtitle in header
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma", 46, 13);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Boleta de uso interno — no valida como factura", 46, 19);
    doc.text("La factura esta disponible en la venta final.", 46, 23);

    // Boleta # + sucursal + fecha on right
    const sucNombre = SUC_NAMES[h.sucursal] || `Suc ${h.sucursal}`;
    const fechaStr = h.fechora.length >= 12
      ? `${h.fechora.slice(6, 8)}/${h.fechora.slice(4, 6)}/${h.fechora.slice(0, 4)} ${h.fechora.slice(8, 10)}:${h.fechora.slice(10, 12)}`
      : "";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(`Boleta N° ${h.boleta}`, w - 10, 13, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(sucNombre, w - 10, 19, { align: "right" });
    doc.text(fechaStr, w - 10, 23, { align: "right" });
    y = 34;

    // "Comprobante X" marker — Argentine convention for non-fiscal vouchers.
    // White square with bold X, placed below the header band on the right side.
    const xSize = 11;
    const xPad = 8;
    const xX = w - xPad - xSize;
    const xY = y;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.rect(xX, xY, xSize, xSize, "FD");
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("X", xX + xSize / 2, xY + xSize - 2.5, { align: "center" });
    doc.setLineWidth(0.2);

    // Cliente block
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(h.clienteNombre || "Consumidor final", 12, y);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    y += 5;
    const dirParts = [h.calle, h.nume].filter(Boolean).join(" ");
    if (dirParts) { doc.text(dirParts + (h.localidad ? `, ${h.localidad}` : ""), 12, y); y += 4; }
    if (h.cuit) { doc.text(`CUIT/DNI: ${h.cuit}`, 12, y); y += 4; }
    if (h.empleadoNombre) { doc.text(`Usted fue atendido por: ${h.empleadoNombre}`, 12, y); y += 4; }
    y += 4;

    // Items table header
    // Columns: Cant. | ~Unid. | Producto | P. Unit. | Importe
    const colCant = 12;
    const colUnid = 26;
    const colProd = 40;
    const colPrecio = w - 50;
    const colImporte = w - 12;
    doc.setDrawColor(220, 220, 220);
    doc.setFillColor(245, 245, 245);
    doc.rect(10, y - 3, w - 20, 7, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(80, 80, 80);
    doc.text("Cant.", colCant, y + 2);
    doc.text("~Unid.", colUnid, y + 2);
    doc.text("Producto", colProd, y + 2);
    doc.text("P. Unit.", colPrecio, y + 2, { align: "right" });
    doc.text("Importe", colImporte, y + 2, { align: "right" });
    y += 8;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(40, 40, 40);

    let computedTotal = 0;
    for (const it of items) {
      if (y > pageH - 30) {
        doc.addPage();
        y = 15;
      }
      const cant = Number(it.cantidad);
      const cantStr = cant % 1 === 0 ? String(Math.round(cant)) : cant.toFixed(2);
      const precio = Number(it.precio) || 0;
      const impo = Number(it.impo) || precio * cant;
      computedTotal += impo;
      const nombre = (it.nombre || `SKU ${it.sku}`).substring(0, 55);
      const unidLabel = it.unidad === "KG" ? `${cantStr} kg` : cantStr;
      const aprox = aproxUnid(it.unidad || "", it.pesoMayorista || "", cant);
      doc.setTextColor(40, 40, 40);
      doc.text(unidLabel, colCant, y);
      if (aprox) {
        doc.setTextColor(70, 110, 180);
        doc.text(aprox, colUnid, y);
        doc.setTextColor(40, 40, 40);
      }
      doc.text(nombre, colProd, y);
      doc.text(formatPrice(precio), colPrecio, y, { align: "right" });
      doc.text(formatPrice(impo), colImporte, y, { align: "right" });
      y += 5;
    }

    // Total row
    y += 2;
    doc.setDrawColor(180, 180, 180);
    doc.line(10, y, w - 10, y);
    y += 6;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(20, 20, 20);
    doc.text("Total", w - 50, y, { align: "right" });
    doc.text(formatPrice(Number(h.total) || computedTotal), w - 12, y, { align: "right" });

    // Footer
    y = pageH - 14;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Boleta de uso interno generada automaticamente — Distrialma — s.e.u.o.", w / 2, y, { align: "center" });

    if (searchParams.get("format") === "file") {
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="Boleta-${h.boleta.trim()}.pdf"`,
        },
      });
    }
    const pdfBase64 = doc.output("datauristring").split(",")[1];
    return NextResponse.json({
      pdf: pdfBase64,
      boleta: h.boleta,
      clienteNombre: h.clienteNombre,
      sucursal: sucNombre,
      total: Number(h.total) || computedTotal,
    });
  } catch (error) {
    console.error("Boleta PDF error:", error);
    return NextResponse.json({ error: "Error generando PDF" }, { status: 500 });
  }
}
