import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: generate receipt PDF for a sale
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const boleta = req.nextUrl.searchParams.get("boleta");
  const format = req.nextUrl.searchParams.get("format") || "ticket"; // ticket or a4

  if (!boleta) return NextResponse.json({ error: "boleta requerida" }, { status: 400 });

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");

    // Get sale header
    const header = await pool.request().input("bol", boleta.padStart(9, " ")).query(`
      SELECT Total, Efectivo, Tarjeta, Deuda, Cant, Vuelto,
        LTRIM(RTRIM(Sucursal)) AS sucursal, LTRIM(RTRIM(Fechora)) AS fechora,
        LTRIM(RTRIM(ISNULL(Nombre, ''))) AS clienteNombre,
        LTRIM(RTRIM(Empleado)) AS empleadoCod
      FROM [${dbTransas}].dbo.Transas WHERE Boleta = @bol AND Tipo = 'V'
    `);
    if (header.recordset.length === 0) {
      return NextResponse.json({ error: "Venta no encontrada" }, { status: 404 });
    }
    const sale = header.recordset[0];

    // Get items
    const items = await pool.request().input("bol", boleta.padStart(9, " ")).query(`
      SELECT LTRIM(RTRIM(t.Producto)) AS sku, LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
        t.Cant AS cantidad, t.Precio AS precio, t.Impo AS impo
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
      WHERE t.Boleta = @bol AND t.Tipo = 'I'
      ORDER BY CAST(t.Itm AS INT)
    `);

    // Get terminal info for the sucursal
    const terminal = await prisma.posTerminal.findFirst({
      where: { sucursal: sale.sucursal.trim() },
    });

    const fechora = sale.fechora;
    const fecha = fechora.length >= 8 ? `${fechora.slice(6, 8)}/${fechora.slice(4, 6)}/${fechora.slice(0, 4)}` : "";
    const hora = fechora.length >= 12 ? `${fechora.slice(8, 10)}:${fechora.slice(10, 12)}` : "";

    const { jsPDF } = await import("jspdf");
    const fmt = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2 });

    if (format === "a4") {
      // A4 format
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      let y = 15;

      // Header
      doc.setFillColor(251, 154, 71);
      doc.rect(0, 0, w, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(18);
      doc.setFont("helvetica", "bold");
      doc.text("Distrialma", 14, 14);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(terminal?.direccion || "", w - 14, 10, { align: "right" });
      doc.text(`CUIT: ${terminal?.cuit || ""} — ${terminal?.sucursalNombre || "Suc " + sale.sucursal}`, w - 14, 16, { align: "right" });
      doc.text(`Boleta #${boleta} — ${fecha} ${hora}`, w - 14, 22, { align: "right" });
      y = 30;

      // Customer
      if (sale.clienteNombre) {
        doc.setTextColor(60, 60, 60);
        doc.setFontSize(10);
        doc.text(`Cliente: ${sale.clienteNombre}`, 14, y);
        y += 6;
      }

      // Items table
      doc.setFillColor(245, 245, 245);
      doc.rect(14, y, w - 28, 7, "F");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.text("Cant.", 16, y + 5);
      doc.text("Producto", 35, y + 5);
      doc.text("Precio", w - 50, y + 5, { align: "right" });
      doc.text("Total", w - 16, y + 5, { align: "right" });
      y += 10;

      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(9);
      for (const item of items.recordset) {
        doc.text(String(Number(item.cantidad)), 16, y);
        doc.text((item.nombre as string).substring(0, 40), 35, y);
        doc.text(fmt(Number(item.precio)), w - 50, y, { align: "right" });
        doc.text(fmt(Number(item.impo)), w - 16, y, { align: "right" });
        doc.setDrawColor(235, 235, 235);
        doc.line(14, y + 1.5, w - 14, y + 1.5);
        y += 5;
      }

      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("TOTAL", 14, y);
      doc.text(fmt(Number(sale.Total)), w - 16, y, { align: "right" });
      y += 8;

      // Payment
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      if (Number(sale.Efectivo) > 0) { doc.text(`Efectivo: ${fmt(Number(sale.Efectivo))}`, 14, y); y += 5; }
      if (Number(sale.Tarjeta) > 0) { doc.text(`Tarjeta: ${fmt(Number(sale.Tarjeta))}`, 14, y); y += 5; }
      if (Number(sale.Deuda) > 0) { doc.text(`Cta. Cte.: ${fmt(Number(sale.Deuda))}`, 14, y); y += 5; }
      if (Number(sale.Vuelto) > 0) { doc.text(`Vuelto: ${fmt(Number(sale.Vuelto))}`, 14, y); y += 5; }

      // Footer
      y += 5;
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      if (terminal?.aliasBanco) doc.text(`Alias transferencia: ${terminal.aliasBanco}`, 14, y);
      y += 5;
      doc.text("Gracias por su compra — distrialma.com.ar", w / 2, y, { align: "center" });

      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      return new NextResponse(pdfBuffer, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Boleta-${boleta}-${fecha.replace(/\//g, "-")}.pdf"` },
      });
    } else {
      // Ticket format (80mm = ~58mm printable)
      const ticketW = 80;
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: [ticketW, 200] });
      let y = 5;

      // Header
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text("DISTRIALMA", ticketW / 2, y, { align: "center" });
      y += 5;
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(terminal?.direccion || "", ticketW / 2, y, { align: "center" });
      y += 3;
      doc.text(`CUIT: ${terminal?.cuit || ""}`, ticketW / 2, y, { align: "center" });
      y += 4;
      doc.setDrawColor(0);
      doc.line(3, y, ticketW - 3, y);
      y += 3;

      // Sale info
      doc.setFontSize(8);
      doc.text(`Boleta: #${boleta}`, 3, y);
      doc.text(`${fecha} ${hora}`, ticketW - 3, y, { align: "right" });
      y += 4;
      if (sale.clienteNombre) { doc.text(`Cliente: ${sale.clienteNombre}`, 3, y); y += 4; }
      doc.line(3, y, ticketW - 3, y);
      y += 3;

      // Items
      doc.setFontSize(7);
      for (const item of items.recordset) {
        const name = (item.nombre as string).substring(0, 28);
        doc.text(name, 3, y);
        y += 3;
        doc.text(`  ${Number(item.cantidad)} x ${fmt(Number(item.precio))}`, 3, y);
        doc.text(fmt(Number(item.impo)), ticketW - 3, y, { align: "right" });
        y += 4;
      }

      doc.line(3, y, ticketW - 3, y);
      y += 4;

      // Total
      doc.setFontSize(11);
      doc.setFont("helvetica", "bold");
      doc.text("TOTAL", 3, y);
      doc.text(fmt(Number(sale.Total)), ticketW - 3, y, { align: "right" });
      y += 5;

      // Payment
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      if (Number(sale.Efectivo) > 0) { doc.text(`Efectivo: ${fmt(Number(sale.Efectivo))}`, 3, y); y += 3; }
      if (Number(sale.Tarjeta) > 0) { doc.text(`Tarjeta: ${fmt(Number(sale.Tarjeta))}`, 3, y); y += 3; }
      if (Number(sale.Deuda) > 0) { doc.text(`Cta. Cte.: ${fmt(Number(sale.Deuda))}`, 3, y); y += 3; }
      if (Number(sale.Vuelto) > 0) { doc.text(`Vuelto: ${fmt(Number(sale.Vuelto))}`, 3, y); y += 3; }

      y += 2;
      doc.line(3, y, ticketW - 3, y);
      y += 3;

      // Footer
      doc.setFontSize(7);
      if (terminal?.aliasBanco) { doc.text(`Alias: ${terminal.aliasBanco}`, ticketW / 2, y, { align: "center" }); y += 3; }
      doc.text("Gracias por su compra", ticketW / 2, y, { align: "center" });
      y += 3;
      doc.text("distrialma.com.ar", ticketW / 2, y, { align: "center" });

      const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
      return new NextResponse(pdfBuffer, {
        headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="Ticket-${boleta}.pdf"` },
      });
    }
  } catch (error) {
    console.error("Receipt error:", error);
    return NextResponse.json({ error: "Error al generar recibo" }, { status: 500 });
  }
}
