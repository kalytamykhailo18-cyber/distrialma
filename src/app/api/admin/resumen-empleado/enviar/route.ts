import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

// POST: generate PDFs per employee for a given month and email to contador
// Body: { mes: "2026-04", emailTo?: string, test?: boolean }
export async function POST(req: NextRequest) {
  // Auth: either staff session or cron secret
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || process.env.RESEND_API_KEY?.slice(0, 16);
  const isCron = !!secret && secret === cronSecret;

  if (!isCron && !(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    let mes: string | undefined;
    let emailTo: string | undefined;
    let test: boolean = false;

    if (isCron) {
      // Cron: use current month (we're on the last day)
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
      mes = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    } else {
      const body = await req.json();
      mes = body.mes;
      emailTo = body.emailTo;
      test = body.test;
    }
    if (!mes) return NextResponse.json({ error: "mes requerido" }, { status: 400 });

    // Get contador email from settings if not provided
    let targetEmail = emailTo;
    if (!targetEmail) {
      const setting = await prisma.setting.findUnique({ where: { key: "contador_email" } });
      targetEmail = setting?.value;
    }
    if (!targetEmail) {
      return NextResponse.json({ error: "No hay email de contador configurado" }, { status: 400 });
    }

    // Fetch summary — use localhost to avoid SSL issues with internal call
    const internalBase = "http://127.0.0.1:3000";
    const cookieHeader = req.headers.get("cookie") || "";
    const url = isCron
      ? `${internalBase}/api/admin/resumen-empleado?mes=${mes}&secret=${encodeURIComponent(cronSecret || "")}`
      : `${internalBase}/api/admin/resumen-empleado?mes=${mes}`;
    const res = await fetch(url, { headers: { cookie: cookieHeader } });
    const data = await res.json();
    if (!data.empleados || data.empleados.length === 0) {
      return NextResponse.json({ error: "No hay descuentos para el mes seleccionado" }, { status: 400 });
    }

    // Generate PDFs
    const { jsPDF } = await import("jspdf");
    const attachments: Array<{ filename: string; content: string }> = [];

    for (const emp of data.empleados) {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      let y = 20;

      // Title (NO branding — just employee name + month)
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(30, 30, 30);
      doc.text(`Descuentos del empleado`, 14, y); y += 8;
      doc.setFontSize(13);
      doc.text(emp.nombre, 14, y); y += 7;
      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      const mesNombre = new Date(mes + "-15").toLocaleDateString("es-AR", { year: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });
      doc.text(`Periodo: ${mesNombre}`, 14, y); y += 10;

      // Table header
      doc.setDrawColor(200, 200, 200);
      doc.line(14, y, w - 14, y); y += 2;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      doc.text("Fecha", 14, y);
      doc.text("Concepto", 38, y);
      doc.text("Detalle", 72, y);
      doc.text("Cargado por", 145, y);
      doc.text("Monto", w - 14, y, { align: "right" });
      y += 2;
      doc.line(14, y, w - 14, y); y += 5;

      // Rows
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      for (const d of emp.descuentos) {
        if (y > pageH - 30) { doc.addPage(); y = 20; }
        const fechaStr = new Date(d.fecha).toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
        doc.text(fechaStr, 14, y);
        doc.text(d.concepto.substring(0, 18), 38, y);
        const detalleLines = doc.splitTextToSize(d.detalle.substring(0, 150), 55);
        for (let i = 0; i < Math.min(detalleLines.length, 2); i++) {
          doc.text(detalleLines[i], 72, y + (i * 4));
        }
        doc.setTextColor(100, 100, 100);
        doc.text((d.cargadoPor || "").substring(0, 15), 145, y);
        doc.setTextColor(30, 30, 30);
        doc.setFont("helvetica", "bold");
        doc.text(`$${d.monto.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, w - 14, y, { align: "right" });
        doc.setFont("helvetica", "normal");
        y += Math.max(5, detalleLines.length * 4);
      }

      y += 3;
      doc.setDrawColor(80, 80, 80);
      doc.line(14, y, w - 14, y); y += 7;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text("Total a descontar:", 14, y);
      doc.text(`$${emp.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}`, w - 14, y, { align: "right" });

      // Filename (no Distrialma)
      const safeName = emp.nombre.replace(/[^a-zA-Z0-9]/g, "_");
      const filename = `Descuentos_${safeName}_${mes}.pdf`;
      const pdfData = doc.output("datauristring").split(",")[1];
      attachments.push({ filename, content: pdfData });
    }

    // Send email with all PDFs attached
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      return NextResponse.json({ error: "Resend API key no configurada" }, { status: 500 });
    }
    const resend = new Resend(resendKey);
    const fromEmail = process.env.RESEND_FROM || "onboarding@resend.dev";

    const emailResult = await resend.emails.send({
      from: fromEmail,
      to: targetEmail,
      subject: `Descuentos por empleado — ${mes}${test ? " (PRUEBA)" : ""}`,
      text: `Adjuntos los descuentos del mes ${mes} para cada empleado (${attachments.length} archivos).`,
      attachments,
    });

    if (emailResult.error) {
      return NextResponse.json({ error: emailResult.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      enviados: attachments.length,
      emailTo: targetEmail,
    });
  } catch (error) {
    console.error("resumen empleado enviar error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
