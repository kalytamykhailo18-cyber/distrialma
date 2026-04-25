import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const DAY_NAMES = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

function zoneMatchesDay(zoneName: string, dayName: string): boolean {
  return zoneName.toUpperCase().includes(dayName);
}

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

// GET: preview | POST: send email
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== "re_5wSDTNZc_3ZCp") {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sendEmail = req.nextUrl.searchParams.get("send") === "true";

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbPedidos = getDbName("pedidos");
    const dbTransas = getDbName("transas");

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));

    // Get all zones
    const zonesResult = await pool.request().query(`
      SELECT Cod AS cod, LTRIM(RTRIM([Desc])) AS nombre
      FROM [${dbClientes}].dbo.Zonas
      WHERE [Desc] IS NOT NULL AND LTRIM(RTRIM([Desc])) <> ''
    `);

    // Get day-based zones only
    const dayZones = zonesResult.recordset.filter(
      (z: { nombre: string }) => DAY_NAMES.some((d) => zoneMatchesDay(z.nombre, d))
    );

    if (dayZones.length === 0) {
      return NextResponse.json({ error: "No hay zonas con dias" }, { status: 400 });
    }

    const zoneList = dayZones.map((z: { cod: string }) => `'${z.cod}'`).join(",");

    // Get all reparto clients with phone
    const allClients = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(c.Cod)) AS cod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono,
        LTRIM(RTRIM(ISNULL(z.[Desc], ''))) AS zona
      FROM [${dbClientes}].dbo.Clientes c
      LEFT JOIN [${dbClientes}].dbo.Zonas z ON z.Cod = c.Zona
      WHERE c.Zona IN (${zoneList})
        AND (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
    `);

    // Get pending orders
    const clientCods = allClients.recordset.map((c: { cod: string }) => c.cod);
    if (clientCods.length === 0) {
      return NextResponse.json({ weekSummary: [], message: "No hay clientes de reparto" });
    }

    const codList = clientCods.map((c: string) => `'${c.padStart(7, " ")}'`).join(",");

    const pendingOrders = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cliente)) AS clienteCod,
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        p.Total AS total,
        LTRIM(RTRIM(p.Fechora)) AS fechora
      FROM [${dbPedidos}].dbo.Pedidos p
      WHERE p.Tipo = 'V'
        AND p.Cliente IN (${codList})
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
    `);

    // Get this week's invoices (suc 7)
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday
    weekStart.setHours(0, 0, 0, 0);
    const sinceStr = weekStart.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);

    const weekInvoices = await pool.request().input("since", sinceStr).query(`
      SELECT
        LTRIM(RTRIM(t.Cliente)) AS clienteCod,
        LTRIM(RTRIM(t.Boleta)) AS boleta,
        t.Total AS total,
        LTRIM(RTRIM(t.Fechora)) AS fechora
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V'
        AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
        AND t.Cliente IN (${codList})
        AND t.Fechora >= @since
        AND LTRIM(RTRIM(t.Sucursal)) = '7'
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
    `);

    // Build per-day summary
    const pendingByCli = new Map<string, { total: number; count: number }>();
    for (const p of pendingOrders.recordset) {
      const existing = pendingByCli.get(p.clienteCod) || { total: 0, count: 0 };
      existing.total += Number(p.total);
      existing.count++;
      pendingByCli.set(p.clienteCod, existing);
    }

    const invoicedByCli = new Map<string, { total: number; count: number }>();
    for (const t of weekInvoices.recordset) {
      const existing = invoicedByCli.get(t.clienteCod) || { total: 0, count: 0 };
      existing.total += Number(t.total);
      existing.count++;
      invoicedByCli.set(t.clienteCod, existing);
    }

    // Group clients by day
    const byDay: Record<string, Array<{
      cod: string; nombre: string; zona: string;
      hasPending: boolean; pendingTotal: number;
      hasInvoiced: boolean; invoicedTotal: number;
    }>> = {};

    for (const day of DAY_NAMES) {
      const dayClients = allClients.recordset.filter(
        (c: { zona: string }) => zoneMatchesDay(c.zona, day)
      );
      if (dayClients.length === 0) continue;

      byDay[day] = dayClients.map((c: { cod: string; nombre: string; zona: string }) => {
        const pending = pendingByCli.get(c.cod);
        const invoiced = invoicedByCli.get(c.cod);
        return {
          cod: c.cod,
          nombre: c.nombre,
          zona: c.zona,
          hasPending: !!pending,
          pendingTotal: pending?.total || 0,
          hasInvoiced: !!invoiced,
          invoicedTotal: invoiced?.total || 0,
        };
      });
    }

    // Build stats
    const totalClients = allClients.recordset.length;
    const clientsWithOrder = new Set([...Array.from(pendingByCli.keys()), ...Array.from(invoicedByCli.keys())]).size;
    const clientsWithout = totalClients - clientsWithOrder;
    const totalPending = Array.from(pendingByCli.values()).reduce((s, v) => s + v.total, 0);
    const totalInvoiced = Array.from(invoicedByCli.values()).reduce((s, v) => s + v.total, 0);

    const weekLabel = `Semana del ${weekStart.getDate()}/${weekStart.getMonth() + 1}/${weekStart.getFullYear()}`;

    const summary = {
      weekLabel,
      totalClients,
      clientsWithOrder,
      clientsWithout,
      totalPending: Math.round(totalPending),
      totalInvoiced: Math.round(totalInvoiced),
      byDay,
    };

    // Send email if requested
    if (sendEmail) {
      const resendKey = process.env.RESEND_API_KEY;
      if (!resendKey) {
        return NextResponse.json({ error: "Resend API key no configurada" }, { status: 500 });
      }

      // Build HTML email
      let html = `<h2>Resumen semanal de reparto — ${weekLabel}</h2>`;
      html += `<table style="border-collapse:collapse;font-family:Arial,sans-serif;font-size:14px;margin-bottom:20px">`;
      html += `<tr><td style="padding:4px 12px">Total clientes reparto:</td><td style="padding:4px 12px;font-weight:bold">${totalClients}</td></tr>`;
      html += `<tr><td style="padding:4px 12px">Pidieron esta semana:</td><td style="padding:4px 12px;font-weight:bold;color:green">${clientsWithOrder}</td></tr>`;
      html += `<tr><td style="padding:4px 12px">No pidieron:</td><td style="padding:4px 12px;font-weight:bold;color:${clientsWithout > 0 ? "red" : "green"}">${clientsWithout}</td></tr>`;
      html += `<tr><td style="padding:4px 12px">Total pendiente:</td><td style="padding:4px 12px;font-weight:bold">${formatPrice(totalPending)}</td></tr>`;
      html += `<tr><td style="padding:4px 12px">Total facturado:</td><td style="padding:4px 12px;font-weight:bold">${formatPrice(totalInvoiced)}</td></tr>`;
      html += `</table>`;

      for (const [day, clients] of Object.entries(byDay)) {
        const ordered = clients.filter((c) => c.hasPending || c.hasInvoiced);
        const notOrdered = clients.filter((c) => !c.hasPending && !c.hasInvoiced);

        html += `<h3 style="margin-top:20px;border-bottom:2px solid #f97316;padding-bottom:4px">${day} (${clients.length} clientes)</h3>`;

        if (ordered.length > 0) {
          html += `<p style="color:green;font-weight:bold;margin:8px 0 4px">Pidieron (${ordered.length}):</p>`;
          html += `<table style="border-collapse:collapse;font-size:13px;width:100%">`;
          for (const c of ordered) {
            const amount = c.hasInvoiced ? formatPrice(c.invoicedTotal) : formatPrice(c.pendingTotal);
            const status = c.hasInvoiced ? "Facturado" : "Pendiente";
            html += `<tr><td style="padding:2px 8px">${c.nombre}</td><td style="padding:2px 8px;text-align:right">${amount}</td><td style="padding:2px 8px;color:${c.hasInvoiced ? "green" : "orange"};font-size:12px">${status}</td></tr>`;
          }
          html += `</table>`;
        }

        if (notOrdered.length > 0) {
          html += `<p style="color:red;font-weight:bold;margin:8px 0 4px">No pidieron (${notOrdered.length}):</p>`;
          html += `<ul style="margin:0;padding-left:20px;font-size:13px">`;
          for (const c of notOrdered) {
            html += `<li>${c.nombre}</li>`;
          }
          html += `</ul>`;
        }
      }

      html += `<p style="margin-top:20px;font-size:12px;color:#999">Generado automaticamente — ${now.toLocaleString("es-AR")}</p>`;

      const resend = new Resend(resendKey);
      const fromEmail = process.env.RESEND_FROM || "onboarding@resend.dev";
      const toEmails = ["gdpsistemas2012@gmail.com", "gabrieldeccp@gmail.com"];

      const emailResult = await resend.emails.send({
        from: fromEmail,
        to: toEmails,
        subject: `Resumen semanal reparto — ${weekLabel}`,
        html,
      });

      if (emailResult.error) {
        return NextResponse.json({ error: emailResult.error.message, summary }, { status: 500 });
      }

      return NextResponse.json({ ok: true, emailSent: toEmails, summary });
    }

    return NextResponse.json(summary);
  } catch (error) {
    console.error("Reparto resumen error:", error);
    return NextResponse.json({ error: "Error al generar resumen" }, { status: 500 });
  }
}
