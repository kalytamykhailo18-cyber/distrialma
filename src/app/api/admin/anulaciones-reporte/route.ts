import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
const SUC_NAMES: Record<string, string> = { "1": "Minorista", "2": "Mayorista", "6": "Pontevedra", "7": "Distribuidora", "8": "Caja 8", "10": "Reventas" };

interface Anulacion {
  boleta: string;
  sucursal: string;
  cliente: string;
  total: number;
  fechora: string;
  usuario: string;
  empleado: string;
}

async function getAnulaciones(fecha: string): Promise<{ anulaciones: Anulacion[]; totalMonto: number }> {
  const pool = await getPool();
  const dbTransas = getDbName("transas");
  const dbEmpleados = getDbName("empleados");

  const desde = `${fecha}000000`;
  const hasta = `${fecha}235959`;

  const result = await pool.request()
    .input("desde", desde)
    .input("hasta", hasta)
    .query(`
      SELECT
        LTRIM(RTRIM(t.Boleta)) AS boleta,
        LTRIM(RTRIM(t.Sucursal)) AS sucursal,
        LTRIM(RTRIM(ISNULL(t.Nombre, ''))) AS cliente,
        ISNULL(t.Total, 0) AS total,
        LTRIM(RTRIM(t.Fechora)) AS fechora,
        LTRIM(RTRIM(ISNULL(eu.Nombre, t.Usuario))) AS usuario,
        LTRIM(RTRIM(ISNULL(ee.Nombre, t.Empleado))) AS empleado
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbEmpleados}].dbo.Empleados eu ON eu.Cod COLLATE Modern_Spanish_CI_AS = t.Usuario COLLATE Modern_Spanish_CI_AS
      LEFT JOIN [${dbEmpleados}].dbo.Empleados ee ON ee.Cod COLLATE Modern_Spanish_CI_AS = t.Empleado COLLATE Modern_Spanish_CI_AS
      WHERE t.Tipo = 'V'
        AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
        AND t.Fechora BETWEEN @desde AND @hasta
        AND t.Anulado IS NOT NULL AND LTRIM(RTRIM(t.Anulado)) != '' AND t.Anulado != ' '
        AND ISNULL(t.Total, 0) > 0
      ORDER BY t.Fechora ASC
    `);

  const anulaciones: Anulacion[] = result.recordset.map((r: { boleta: string; sucursal: string; cliente: string; total: number; fechora: string; usuario: string; empleado: string }) => ({
    boleta: r.boleta,
    sucursal: r.sucursal,
    cliente: r.cliente,
    total: Number(r.total),
    fechora: r.fechora,
    usuario: r.usuario,
    empleado: r.empleado,
  }));

  const totalMonto = anulaciones.reduce((s, a) => s + a.total, 0);
  return { anulaciones, totalMonto };
}

function formatFechora(f: string): string {
  if (f.length < 12) return f;
  return `${f.slice(6, 8)}/${f.slice(4, 6)} ${f.slice(8, 10)}:${f.slice(10, 12)}`;
}

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

// GET: preview anulaciones for a date
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const fecha = new URL(req.url).searchParams.get("fecha");
  if (!fecha) return NextResponse.json({ error: "fecha requerida (YYYYMMDD)" }, { status: 400 });

  const data = await getAnulaciones(fecha);
  return NextResponse.json(data);
}

// POST: send daily anulaciones report via WhatsApp + email
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const enabled = await prisma.setting.findUnique({ where: { key: "anulaciones_reporte_enabled" } });
    if (enabled?.value !== "true") return NextResponse.json({ ok: true, skipped: true, reason: "deshabilitado" });

    // Yesterday's date in Argentina timezone
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    now.setDate(now.getDate() - 1);
    const fecha = now.getFullYear().toString()
      + String(now.getMonth() + 1).padStart(2, "0")
      + String(now.getDate()).padStart(2, "0");
    const fechaDisplay = `${fecha.slice(6, 8)}/${fecha.slice(4, 6)}/${fecha.slice(0, 4)}`;

    const { anulaciones, totalMonto } = await getAnulaciones(fecha);

    if (anulaciones.length === 0) {
      console.log(`[ANULACIONES] ${fechaDisplay}: sin anulaciones`);
      return NextResponse.json({ ok: true, sent: false, reason: "sin anulaciones" });
    }

    // Group by employee
    const byEmpleado = new Map<string, { count: number; total: number }>();
    for (const a of anulaciones) {
      const key = a.empleado || a.usuario || "Desconocido";
      const prev = byEmpleado.get(key) || { count: 0, total: 0 };
      byEmpleado.set(key, { count: prev.count + 1, total: prev.total + a.total });
    }

    // Group by sucursal
    const bySucursal = new Map<string, { count: number; total: number }>();
    for (const a of anulaciones) {
      const key = SUC_NAMES[a.sucursal] || `Suc ${a.sucursal}`;
      const prev = bySucursal.get(key) || { count: 0, total: 0 };
      bySucursal.set(key, { count: prev.count + 1, total: prev.total + a.total });
    }

    // Build WhatsApp message
    let msg = `📋 Anulaciones ${fechaDisplay}\n${anulaciones.length} ventas anuladas por ${formatPrice(totalMonto)}\n`;

    msg += "\nPor empleado:\n";
    for (const [emp, data] of Array.from(byEmpleado.entries())) {
      msg += `• ${emp}: ${data.count} (${formatPrice(data.total)})\n`;
    }

    msg += "\nPor sucursal:\n";
    for (const [suc, data] of Array.from(bySucursal.entries())) {
      msg += `• ${suc}: ${data.count} (${formatPrice(data.total)})\n`;
    }

    msg += "\nDetalle:\n";
    for (const a of anulaciones) {
      msg += `• ${formatFechora(a.fechora)} ${SUC_NAMES[a.sucursal] || a.sucursal} ${formatPrice(a.total)} - ${a.empleado || a.usuario}${a.cliente ? ` (${a.cliente})` : ""}\n`;
    }

    // Send WhatsApp to Gaston
    const phoneSetting = await prisma.setting.findUnique({ where: { key: "anulaciones_reporte_telefono" } });
    const phone = phoneSetting?.value || "";
    if (phone) {
      let num = phone.replace(/\D/g, "");
      if (num.startsWith("0")) num = num.slice(1);
      if (!num.startsWith("549")) num = num.startsWith("54") ? "549" + num.slice(2) : "549" + num;
      const chatId = `${num}@c.us`;
      try {
        await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg, sender: "bot" }),
        });
      } catch {}
    }

    // Send email
    const emailSetting = await prisma.setting.findUnique({ where: { key: "anulaciones_reporte_email" } });
    const emailTo = emailSetting?.value || "";
    if (emailTo && process.env.RESEND_API_KEY) {
      const { Resend } = await import("resend");
      const resend = new Resend(process.env.RESEND_API_KEY);

      const empRows = Array.from(byEmpleado.entries()).map(([emp, d]) =>
        `<tr><td style="padding:4px 8px">${emp}</td><td style="padding:4px 8px;text-align:right">${d.count}</td><td style="padding:4px 8px;text-align:right">${formatPrice(d.total)}</td></tr>`
      ).join("");

      const detailRows = anulaciones.map((a) =>
        `<tr><td style="padding:4px 8px">${formatFechora(a.fechora)}</td><td style="padding:4px 8px">${SUC_NAMES[a.sucursal] || a.sucursal}</td><td style="padding:4px 8px">${a.empleado || a.usuario}</td><td style="padding:4px 8px">${a.cliente || "-"}</td><td style="padding:4px 8px;text-align:right">${formatPrice(a.total)}</td></tr>`
      ).join("");

      const html = `
        <h2>Anulaciones ${fechaDisplay}</h2>
        <p><strong>${anulaciones.length}</strong> ventas anuladas por <strong>${formatPrice(totalMonto)}</strong></p>
        <h3>Por empleado</h3>
        <table border="1" cellspacing="0" style="border-collapse:collapse;font-size:13px">
          <tr style="background:#f97316;color:white"><th style="padding:6px 8px">Empleado</th><th style="padding:6px 8px">Cant.</th><th style="padding:6px 8px">Total</th></tr>
          ${empRows}
        </table>
        <h3>Detalle</h3>
        <table border="1" cellspacing="0" style="border-collapse:collapse;font-size:13px">
          <tr style="background:#f97316;color:white"><th style="padding:6px 8px">Hora</th><th style="padding:6px 8px">Sucursal</th><th style="padding:6px 8px">Empleado</th><th style="padding:6px 8px">Cliente</th><th style="padding:6px 8px">Monto</th></tr>
          ${detailRows}
        </table>
      `;

      try {
        await resend.emails.send({
          from: process.env.RESEND_FROM || "Administracion <no-responder@alertrasadmin.com>",
          to: emailTo,
          subject: `Anulaciones ${fechaDisplay} — ${anulaciones.length} ventas (${formatPrice(totalMonto)})`,
          html,
        });
      } catch {}
    }

    console.log(`[ANULACIONES] ${fechaDisplay}: ${anulaciones.length} anulaciones, ${formatPrice(totalMonto)}`);
    return NextResponse.json({ ok: true, fecha: fechaDisplay, count: anulaciones.length, total: totalMonto });
  } catch (error) {
    console.error("Anulaciones reporte error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
