import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

interface Recipient {
  cod: string;
  nombre: string;
  email: string;
  ultimaCompra: string;
  cantCompras: number;
  totalHistorico: number;
}

// GET: list clients who have a valid email
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const dias = parseInt(searchParams.get("dias") || "0"); // 0 = all
  const minCompras = parseInt(searchParams.get("minCompras") || "1");

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");

    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const floor = new Date(now);
    floor.setMonth(floor.getMonth() - 12);
    const floorStr = floor.getUTCFullYear().toString()
      + String(floor.getUTCMonth() + 1).padStart(2, "0")
      + String(floor.getUTCDate()).padStart(2, "0") + "000000";

    const inactivityClause = dias > 0
      ? `AND (cs.ultimaCompra IS NULL OR cs.ultimaCompra < '${
          (() => {
            const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - dias);
            return cutoff.getUTCFullYear().toString() + String(cutoff.getUTCMonth() + 1).padStart(2, "0") + String(cutoff.getUTCDate()).padStart(2, "0") + "000000";
          })()
        }')`
      : "";

    const result = await pool.request().query(`
      WITH ClientStats AS (
        SELECT
          LTRIM(RTRIM(t.Cliente)) AS cod,
          MAX(LTRIM(RTRIM(t.Fechora))) AS ultimaCompra,
          COUNT(DISTINCT t.Boleta) AS cantCompras,
          SUM(t.Impo) AS totalHistorico
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND LTRIM(RTRIM(t.Cliente)) <> ''
          AND t.Fechora >= '${floorStr}'
        GROUP BY LTRIM(RTRIM(t.Cliente))
      )
      SELECT
        LTRIM(RTRIM(c.Cod)) AS cod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        LTRIM(RTRIM(c.Email)) AS email,
        ISNULL(cs.ultimaCompra, '') AS ultimaCompra,
        ISNULL(cs.cantCompras, 0) AS cantCompras,
        ISNULL(cs.totalHistorico, 0) AS totalHistorico
      FROM [${dbClientes}].dbo.Clientes c
      LEFT JOIN ClientStats cs ON cs.cod COLLATE Modern_Spanish_CI_AS = LTRIM(RTRIM(c.Cod)) COLLATE Modern_Spanish_CI_AS
      WHERE (c.DeBaja = 0 OR c.DeBaja IS NULL)
        AND c.Email IS NOT NULL
        AND LTRIM(RTRIM(c.Email)) LIKE '%@%.%'
        AND ISNULL(cs.cantCompras, 0) >= ${Math.max(0, minCompras)}
        ${inactivityClause}
      ORDER BY ISNULL(cs.totalHistorico, 0) DESC
    `);

    const recipients: Recipient[] = result.recordset.map((r: { cod: string; nombre: string; email: string; ultimaCompra: string; cantCompras: number; totalHistorico: number }) => ({
      cod: r.cod,
      nombre: r.nombre,
      email: r.email,
      ultimaCompra: r.ultimaCompra,
      cantCompras: Number(r.cantCompras),
      totalHistorico: Number(r.totalHistorico),
    }));

    return NextResponse.json({ recipients, total: recipients.length });
  } catch (e) {
    console.error("email-difusion GET error:", e);
    return NextResponse.json({ error: "Error al cargar destinatarios" }, { status: 500 });
  }
}

interface SendBody {
  recipients: string[]; // cliente cods
  subject: string;
  bodyHtml: string;
  testEmail?: string;
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as SendBody;
    const { recipients, subject, bodyHtml, testEmail } = body;

    if (!subject || !bodyHtml) {
      return NextResponse.json({ error: "Asunto y cuerpo son obligatorios" }, { status: 400 });
    }

    const resendKey = process.env.RESEND_API_KEY || "";
    if (!resendKey) {
      return NextResponse.json({ error: "Resend no configurado" }, { status: 500 });
    }
    const resend = new Resend(resendKey);
    const from = process.env.RESEND_FROM || "Distrialma <onboarding@resend.dev>";

    // Test mode: send to a single email, no DB lookup
    if (testEmail) {
      const html = bodyHtml.replace(/\{nombre\}/g, "Test");
      const result = await resend.emails.send({ from, to: testEmail, subject, html });
      return NextResponse.json({ ok: true, testMode: true, result });
    }

    if (!Array.isArray(recipients) || recipients.length === 0) {
      return NextResponse.json({ error: "Sin destinatarios" }, { status: 400 });
    }

    // Fetch the recipients' email + nombre
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const codList = recipients.map((c) => `'${String(c).replace(/'/g, "''")}'`).join(",");
    const data = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre, LTRIM(RTRIM(Email)) AS email
      FROM [${dbClientes}].dbo.Clientes
      WHERE LTRIM(RTRIM(Cod)) IN (${codList})
        AND Email IS NOT NULL AND LTRIM(RTRIM(Email)) LIKE '%@%.%'
    `);

    const user = (session.user as { name?: string }).name || "admin";

    let sent = 0, failed = 0;
    const errors: string[] = [];
    for (const r of data.recordset) {
      const personalHtml = bodyHtml.replace(/\{nombre\}/g, r.nombre || "cliente");
      try {
        await resend.emails.send({
          from,
          to: r.email,
          subject: subject.replace(/\{nombre\}/g, r.nombre || "cliente"),
          html: personalHtml,
        });
        sent++;
        await prisma.notificationLog.create({
          data: {
            clientId: r.cod,
            tipo: "email_difusion",
            mensaje: subject.substring(0, 400),
            telefono: r.email.substring(0, 20),
            enviadoPor: user.substring(0, 60),
            ok: true,
          },
        }).catch(() => {});
        // Throttle to ~ 2 req/sec (Resend limit)
        await new Promise((res) => setTimeout(res, 500));
      } catch (e) {
        failed++;
        const msg = (e as Error).message || "unknown";
        if (errors.length < 10) errors.push(`${r.cod} (${r.email}): ${msg}`);
      }
    }

    return NextResponse.json({ ok: true, sent, failed, errors });
  } catch (e) {
    console.error("email-difusion POST error:", e);
    return NextResponse.json({ error: "Error al enviar" }, { status: 500 });
  }
}
