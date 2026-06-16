import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
const SETTING_EMAILS = "recibos_semanal_emails";

function fmt(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * GET — for manual inspection (returns JSON of the report data, no email sent)
 * POST ?secret=... — sends the weekly email
 *
 * Window: last 7 days up to "now" (Fri 19:30 when cron-triggered).
 */
async function buildReport(): Promise<{
  total: number;
  windowStart: Date;
  windowEnd: Date;
  porProveedor: Array<{ proveedorName: string; total: number; cheques: number; efectivo: number; transferencia: number; ajuste: number; recibos: number }>;
  chequesPropios: Array<{ banco: string; numero: string; fechaCobro: Date; monto: number; proveedorNombre: string }>;
  cantidad: number;
}> {
  const windowEnd = new Date();
  const windowStart = new Date(windowEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

  const recibos = await prisma.supplierPayment.findMany({
    where: {
      tipoPago: { not: "legacy" },
      anuladoAt: null,
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    include: { cheques: true },
    orderBy: { createdAt: "asc" },
  });

  const total = recibos.reduce((s, r) => s + Number(r.monto), 0);

  // Group by proveedor
  const byProv = new Map<string, { proveedorName: string; total: number; cheques: number; efectivo: number; transferencia: number; ajuste: number; recibos: number }>();
  for (const r of recibos) {
    const key = r.proveedorName;
    const prev = byProv.get(key) || { proveedorName: r.proveedorName, total: 0, cheques: 0, efectivo: 0, transferencia: 0, ajuste: 0, recibos: 0 };
    prev.total += Number(r.monto);
    prev.cheques += Number(r.montoCheques);
    prev.efectivo += Number(r.montoEfectivo);
    prev.transferencia += Number(r.montoTransferencia);
    prev.ajuste += Number(r.montoAjuste);
    prev.recibos += 1;
    byProv.set(key, prev);
  }
  const porProveedor = Array.from(byProv.values()).sort((a, b) => b.total - a.total);

  // Cheques propios emitidos en la semana (tipo=propio)
  const chequesPropios: Array<{ banco: string; numero: string; fechaCobro: Date; monto: number; proveedorNombre: string }> = [];
  for (const r of recibos) {
    for (const c of r.cheques) {
      if (c.tipo === "propio") {
        chequesPropios.push({
          banco: c.banco,
          numero: c.numero,
          fechaCobro: c.fechaCobro,
          monto: Number(c.monto),
          proveedorNombre: c.proveedorNombre || r.proveedorName,
        });
      }
    }
  }
  chequesPropios.sort((a, b) => a.fechaCobro.getTime() - b.fechaCobro.getTime());

  return { total, windowStart, windowEnd, porProveedor, chequesPropios, cantidad: recibos.length };
}

function reportHtml(data: Awaited<ReturnType<typeof buildReport>>): string {
  const head = `
    <h2 style="margin:0 0 4px">Recibos a Proveedores</h2>
    <p style="margin:0 0 12px;color:#555">Semana del ${fmtDate(data.windowStart)} al ${fmtDate(data.windowEnd)}</p>
    <table style="border-collapse:collapse;margin-bottom:16px">
      <tr><td style="padding:4px 12px 4px 0">Total pagado:</td><td><strong style="font-size:18px;color:#b8520a">${fmt(data.total)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0">Cantidad de recibos:</td><td><strong>${data.cantidad}</strong></td></tr>
    </table>
  `;

  let porProv = "";
  if (data.porProveedor.length > 0) {
    const rows = data.porProveedor.map((p) => `
      <tr>
        <td style="border-bottom:1px solid #eee;padding:6px 8px">${p.proveedorName}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;text-align:right">${p.recibos}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;text-align:right;font-weight:bold">${fmt(p.total)}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;text-align:right;color:#555">${p.cheques > 0 ? fmt(p.cheques) : "—"}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;text-align:right;color:#555">${p.efectivo > 0 ? fmt(p.efectivo) : "—"}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;text-align:right;color:#555">${p.transferencia > 0 ? fmt(p.transferencia) : "—"}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;text-align:right;color:#b8520a">${p.ajuste !== 0 ? fmt(p.ajuste) : "—"}</td>
      </tr>
    `).join("");
    porProv = `
      <h3 style="margin-top:24px;color:#333">Detalle por proveedor</h3>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead><tr style="background:#fff3e6">
          <th style="text-align:left;padding:6px 8px">Proveedor</th>
          <th style="text-align:right;padding:6px 8px">N°</th>
          <th style="text-align:right;padding:6px 8px">Total</th>
          <th style="text-align:right;padding:6px 8px">Cheques</th>
          <th style="text-align:right;padding:6px 8px">Efectivo</th>
          <th style="text-align:right;padding:6px 8px">Transf.</th>
          <th style="text-align:right;padding:6px 8px">Ajuste</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  let chequesHtml = "";
  if (data.chequesPropios.length > 0) {
    const rows = data.chequesPropios.map((c) => `
      <tr>
        <td style="border-bottom:1px solid #eee;padding:6px 8px">${c.banco}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;font-family:monospace">${c.numero}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px">${fmtDate(c.fechaCobro)}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;text-align:right;font-weight:bold">${fmt(c.monto)}</td>
        <td style="border-bottom:1px solid #eee;padding:6px 8px;color:#555">${c.proveedorNombre}</td>
      </tr>
    `).join("");
    chequesHtml = `
      <h3 style="margin-top:24px;color:#333">Cheques propios emitidos en la semana</h3>
      <p style="margin:0 0 8px;color:#666;font-size:12px">Ordenados por fecha de cobro proxima.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px">
        <thead><tr style="background:#fff3e6">
          <th style="text-align:left;padding:6px 8px">Banco</th>
          <th style="text-align:left;padding:6px 8px">N°</th>
          <th style="text-align:left;padding:6px 8px">Cobro</th>
          <th style="text-align:right;padding:6px 8px">Monto</th>
          <th style="text-align:left;padding:6px 8px">Proveedor</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  if (data.cantidad === 0) {
    return `${head}<p style="color:#888">No hubo recibos a proveedores en esta semana.</p>`;
  }

  return head + porProv + chequesHtml;
}

export async function GET() {
  const data = await buildReport();
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const emailsSetting = await prisma.setting.findUnique({ where: { key: SETTING_EMAILS } });
  const raw = emailsSetting?.value || "";
  // Allow comma, semicolon, or whitespace separators
  const emails = raw.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /\S+@\S+/.test(s));
  if (emails.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: "no emails configured" });
  }

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return NextResponse.json({ ok: false, error: "RESEND_API_KEY not set" }, { status: 500 });
  }

  const data = await buildReport();
  const html = reportHtml(data);
  const fechaStr = fmtDate(data.windowEnd);

  try {
    const resend = new Resend(resendKey);
    const result = await resend.emails.send({
      from: process.env.RESEND_FROM || "Distrialma <onboarding@resend.dev>",
      to: emails,
      subject: `Recibos a Proveedores — semana al ${fechaStr}`,
      html,
    });
    if (result.error) {
      return NextResponse.json({ ok: false, error: result.error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, sent: emails.length, total: data.total, cantidad: data.cantidad });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
