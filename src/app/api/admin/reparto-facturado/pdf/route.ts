import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const clienteCod = searchParams.get("cliente") || "";
  const desde = searchParams.get("desde") || "";
  if (!clienteCod || !desde) {
    return NextResponse.json({ error: "cliente y desde requeridos" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");
    const dbClientes = getDbName("clientes");

    // Get client name
    const clienteRes = await pool.request().input("cod", clienteCod.padStart(7, " ")).query(`
      SELECT LTRIM(RTRIM(Nombre)) AS nombre FROM [${dbClientes}].dbo.Clientes WHERE Cod = @cod
    `);
    const clienteNombre = clienteRes.recordset[0]?.nombre || clienteCod;

    // Get boletas (headers)
    const boletas = await pool.request().input("cod", clienteCod.padStart(7, " ")).input("desde", desde).query(`
      SELECT LTRIM(RTRIM(t.Boleta)) AS boleta, t.Total, LTRIM(RTRIM(t.Fechora)) AS fechora
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Cliente = @cod AND t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND LTRIM(RTRIM(t.Sucursal)) = '7' AND t.Fechora >= @desde
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
      ORDER BY t.Fechora
    `);

    if (boletas.recordset.length === 0) {
      return NextResponse.json({ error: "No hay boletas" }, { status: 404 });
    }

    // Get items for all boletas
    const boletaNums = boletas.recordset.map((b: { boleta: string }) => `'${b.boleta.padStart(9, " ")}'`).join(",");
    const items = await pool.request().query(`
      SELECT LTRIM(RTRIM(t.Boleta)) AS boleta, LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
        t.Cant AS cantidad, t.Precio AS precio, t.Impo AS impo
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos p ON p.Cod = t.Producto
      WHERE t.Boleta IN (${boletaNums}) AND t.Tipo = 'I'
      ORDER BY t.Boleta, CAST(t.Itm AS INT)
    `);

    // Group items by boleta
    const itemsByBoleta = new Map<string, Array<{ nombre: string; cantidad: number; precio: number; impo: number }>>();
    for (const item of items.recordset) {
      const list = itemsByBoleta.get(item.boleta) || [];
      list.push({ nombre: item.nombre, cantidad: Number(item.cantidad), precio: Number(item.precio), impo: Number(item.impo) });
      itemsByBoleta.set(item.boleta, list);
    }

    // Generate PDF
    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    let y = 15;

    // Header
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 22, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — Detalle de Facturacion", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const fecha = desde.length >= 8 ? `${desde.slice(6, 8)}/${desde.slice(4, 6)}/${desde.slice(0, 4)}` : "";
    doc.text(`${clienteNombre} — ${fecha}`, w - 14, 14, { align: "right" });
    y = 28;

    let grandTotal = 0;

    for (const boleta of boletas.recordset) {
      const boletaItems = itemsByBoleta.get(boleta.boleta) || [];
      const total = Number(boleta.Total);
      grandTotal += total;

      if (y + 20 + boletaItems.length * 5 > pageH - 20) {
        doc.addPage();
        y = 15;
      }

      // Boleta header
      doc.setFillColor(245, 245, 245);
      doc.rect(14, y, w - 28, 7, "F");
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text(`Boleta #${boleta.boleta}`, 16, y + 5);
      doc.text(formatPrice(total), w - 16, y + 5, { align: "right" });
      y += 9;

      // Items
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(50, 50, 50);
      for (const item of boletaItems) {
        if (y > pageH - 15) { doc.addPage(); y = 15; }
        const cant = item.cantidad % 1 === 0 ? String(Math.round(item.cantidad)) : item.cantidad.toFixed(1);
        doc.text(`${cant}x ${item.nombre}`, 18, y);
        doc.text(formatPrice(item.impo), w - 16, y, { align: "right" });
        y += 4.5;
      }
      y += 3;
    }

    // Grand total
    y += 3;
    doc.setDrawColor(80, 80, 80);
    doc.line(14, y, w - 14, y);
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Total:", 14, y);
    doc.text(formatPrice(grandTotal), w - 14, y, { align: "right" });

    // Footer
    y += 10;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Este es un comprobante automatico (s.e.u.o.) — Distrialma", w / 2, y, { align: "center" });

    if (searchParams.get("format") === "file") {
      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      return new NextResponse(pdfBuffer, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Boletas-${clienteNombre.replace(/[^a-zA-Z0-9]/g, "_")}.pdf"` },
      });
    }
    const pdfBase64 = doc.output("datauristring").split(",")[1];
    return NextResponse.json({ pdf: pdfBase64 });
  } catch (error) {
    console.error("Reparto facturado PDF error:", error);
    return NextResponse.json({ error: "Error generando PDF" }, { status: 500 });
  }
}
