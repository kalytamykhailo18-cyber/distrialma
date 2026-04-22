import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: generate and return PDF for a cierre
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cierreId = req.nextUrl.searchParams.get("id");
  if (!cierreId) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  try {
    const cierre = await prisma.cierreCaja.findUnique({ where: { id: Number(cierreId) } });
    if (!cierre) return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = doc.internal.pageSize.getWidth();
    const fmt = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
    let y = 15;

    const suc = cierre.sucursal;

    // Header
    doc.setFillColor(251, 154, 71);
    doc.rect(0, 0, w, 24, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Distrialma — Cierre de Caja", 14, 14);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`Sucursal ${suc} — Desde: ${cierre.desde}`, w - 14, 14, { align: "right" });
    doc.text(`Responsable: ${cierre.usuario} — ${cierre.createdAt.toLocaleString("es-AR")}`, w - 14, 20, { align: "right" });
    y = 32;

    // Cards
    const cards: Array<{ l: string; v: string; c: [number, number, number] }> = [
      { l: "Ventas", v: String(cierre.cantVentas), c: [232, 245, 233] },
      { l: "Efectivo", v: fmt(Number(cierre.efectivo)), c: [232, 245, 233] },
      { l: "Tarjeta", v: fmt(Number(cierre.tarjeta)), c: [255, 243, 224] },
      { l: "Cta. Cte.", v: fmt(Number(cierre.deuda)), c: [255, 235, 238] },
    ];
    const cw = (w - 28 - 9) / 4;
    cards.forEach((c, i) => {
      const x = 14 + i * (cw + 3);
      doc.setFillColor(...c.c);
      doc.roundedRect(x, y, cw, 18, 2, 2, "F");
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(8);
      doc.text(c.l, x + cw / 2, y + 6, { align: "center" });
      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(c.v, x + cw / 2, y + 14, { align: "center" });
      doc.setFont("helvetica", "normal");
    });
    y += 24;

    // Total ventas
    doc.setFillColor(41, 50, 60);
    doc.roundedRect(14, y, w - 28, 8, 1, 1, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL VENTAS", 18, y + 6);
    doc.text(fmt(Number(cierre.totalVentas)), w - 18, y + 6, { align: "right" });
    y += 12;

    // Details
    doc.setTextColor(60, 60, 60);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    const lines: [string, string][] = [
      ["Inicio de caja:", fmt(Number(cierre.inicioCaja))],
      ["Ventas en efectivo:", fmt(Number(cierre.efectivo))],
      ["Retiros:", fmt(Number(cierre.retiros))],
      ["Ingresos:", fmt(Number(cierre.ingresos))],
      ["Pagos proveedores:", fmt(Number(cierre.pagos))],
      ["TOTAL EFECTIVO EN CAJA:", fmt(Number(cierre.totalCaja))],
    ];
    for (const line of lines) {
      doc.text(line[0], 18, y);
      doc.text(line[1], 90, y, { align: "right" });
      y += 5;
    }
    y += 4;

    // Total general
    doc.setFillColor(255, 243, 224);
    doc.roundedRect(14, y, w - 28, 10, 2, 2, "F");
    doc.setTextColor(200, 100, 0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("TOTAL GENERAL", 18, y + 7);
    doc.text(fmt(Number(cierre.totalCaja)), w - 18, y + 7, { align: "right" });
    y += 14;

    // Diferencia
    const dif = Number(cierre.diferencia);
    doc.setFillColor(dif >= 0 ? 232 : 255, dif >= 0 ? 245 : 235, dif >= 0 ? 233 : 238);
    doc.roundedRect(14, y, w - 28, 8, 2, 2, "F");
    doc.setTextColor(dif >= 0 ? 22 : 220, dif >= 0 ? 163 : 38, dif >= 0 ? 74 : 38);
    doc.setFontSize(10);
    doc.text(dif >= 0 ? "SOBRANTE" : "FALTANTE", 18, y + 6);
    doc.text((dif >= 0 ? "+" : "") + fmt(Math.abs(dif)), w - 18, y + 6, { align: "right" });
    y += 12;

    // Inicio siguiente
    doc.setFillColor(251, 154, 71);
    doc.roundedRect(14, y, w - 28, 10, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("INICIO DE CAJA SIGUIENTE", 18, y + 7);
    doc.text(fmt(Number(cierre.nuevoInicio)), w - 18, y + 7, { align: "right" });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="CierreCaja-Suc${suc}-${cierre.createdAt.toISOString().slice(0, 10)}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Cierre PDF error:", error);
    return NextResponse.json({ error: "Error al generar PDF" }, { status: 500 });
  }
}
