import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { cierreId } = await req.json();
  if (!cierreId) return NextResponse.json({ error: "cierreId requerido" }, { status: 400 });

  try {
    const cierre = await prisma.cierreCaja.findUnique({ where: { id: Number(cierreId) } });
    if (!cierre) return NextResponse.json({ error: "Cierre no encontrado" }, { status: 404 });

    const emailSetting = await prisma.setting.findUnique({ where: { key: "cierre_email" } });
    const emailTo = cierre.emailTo || emailSetting?.value || "";
    if (!emailTo) return NextResponse.json({ error: "No hay email configurado" }, { status: 400 });

    const resendKey = process.env.RESEND_API_KEY || "";
    if (!resendKey) return NextResponse.json({ error: "Resend API key no configurada" }, { status: 500 });

    // Try to find the PDF from PrintJob
    const printJob = await prisma.printJob.findFirst({
      where: {
        tipo: "cierre",
        sucursal: cierre.sucursal,
        createdAt: {
          gte: new Date(cierre.createdAt.getTime() - 60000),
          lte: new Date(cierre.createdAt.getTime() + 60000),
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const f = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
    const fecha = cierre.createdAt.toLocaleDateString("es-AR");
    const suc = cierre.sucursal;
    const diferencia = Number(cierre.diferencia);
    const diffLabel = diferencia >= 0 ? "Sobrante" : "Faltante";
    const diffColor = diferencia >= 0 ? "#16a34a" : "#dc2626";

    const html = `
      <h2>Cierre de Caja — Sucursal ${suc} (Reenviado)</h2>
      <p><strong>Fecha:</strong> ${fecha}</p>
      <p><strong>Responsable:</strong> ${cierre.usuario}</p>
      <table style="border-collapse:collapse;width:100%;max-width:400px">
        <tr><td>Ventas:</td><td style="text-align:right"><strong>${cierre.cantVentas}</strong></td></tr>
        <tr><td>Total ventas:</td><td style="text-align:right">${f(Number(cierre.totalVentas))}</td></tr>
        <tr><td>Efectivo:</td><td style="text-align:right">${f(Number(cierre.efectivo))}</td></tr>
        <tr><td>Tarjeta:</td><td style="text-align:right">${f(Number(cierre.tarjeta))}</td></tr>
        <tr><td>Retiros:</td><td style="text-align:right"><strong>${f(Number(cierre.retiros))}</strong></td></tr>
      </table>
      <hr>
      <table style="border-collapse:collapse;width:100%;max-width:400px">
        <tr><td>Total efectivo en caja:</td><td style="text-align:right">${f(Number(cierre.totalCaja))}</td></tr>
        <tr><td>Inicio de caja siguiente:</td><td style="text-align:right">${f(Number(cierre.nuevoInicio))}</td></tr>
        <tr style="color:${diffColor}"><td><strong>${diffLabel}:</strong></td><td style="text-align:right"><strong>${f(Math.abs(diferencia))}</strong></td></tr>
      </table>
      ${printJob ? '<p>Ver detalle completo en el PDF adjunto.</p>' : '<p style="color:#999">PDF no disponible para reenvio.</p>'}
      <hr>
      <p style="color: #999; font-size: 12px;">Reenviado automáticamente por distrialma.com.ar</p>
    `;

    const attachments: Array<{ filename: string; content: string }> = [];
    if (printJob?.pdfBase64) {
      attachments.push({
        filename: `CierreCaja-Suc${suc}-${cierre.createdAt.toISOString().slice(0, 10)}.pdf`,
        content: printJob.pdfBase64,
      });
    }

    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM || "Distrialma <onboarding@resend.dev>",
      to: emailTo,
      subject: `Cierre de Caja — Sucursal ${suc} — ${fecha} (Reenviado)`,
      html,
      attachments,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error.message }, { status: 500 });
    }

    await prisma.cierreCaja.update({
      where: { id: cierre.id },
      data: { emailSent: true },
    });

    return NextResponse.json({ ok: true, emailTo });
  } catch (error) {
    console.error("Cierre resend error:", error);
    return NextResponse.json({ error: "Error al reenviar email" }, { status: 500 });
  }
}
