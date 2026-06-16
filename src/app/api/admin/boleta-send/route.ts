import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// Branches whose boletas trigger an automatic per-boleta WhatsApp PDF.
// Distribuidora (7) is handled by the daily reparto-facturado job, not here.
const ELIGIBLE_SUCURSALES = new Set(["1", "2", "6", "10"]);

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbClientes = getDbName("clientes");

    // Window: look at last ~30 min of closed boletas (NotificationLog handles dedup).
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const since = new Date(now.getTime() - 30 * 60 * 1000);
    const sinceStr = since.getFullYear().toString()
      + String(since.getMonth() + 1).padStart(2, "0")
      + String(since.getDate()).padStart(2, "0")
      + String(since.getHours()).padStart(2, "0")
      + String(since.getMinutes()).padStart(2, "0")
      + "00";

    const sucList = Array.from(ELIGIBLE_SUCURSALES).map((s) => `'${s}'`).join(",");
    const boletasRes = await pool.request().input("since", sinceStr).query(`
      SELECT LTRIM(RTRIM(t.Boleta)) AS boleta,
        LTRIM(RTRIM(t.Sucursal)) AS sucursal,
        LTRIM(RTRIM(t.Cliente)) AS clienteCod,
        LTRIM(RTRIM(ISNULL(t.Nombre, ''))) AS clienteNombre,
        t.Total AS total,
        LTRIM(RTRIM(t.Fechora)) AS fechora
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @since
        AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        AND ISNULL(t.Total, 0) > 0
        AND t.Cliente IS NOT NULL AND LTRIM(RTRIM(t.Cliente)) != '' AND LTRIM(RTRIM(t.Cliente)) != '0'
      ORDER BY t.Fechora ASC
    `);

    const candidates = boletasRes.recordset as Array<{
      boleta: string; sucursal: string; clienteCod: string; clienteNombre: string; total: number; fechora: string;
    }>;

    if (candidates.length === 0) {
      return NextResponse.json({ ok: true, total: 0, sent: 0 });
    }

    // Dedup against NotificationLog (tipo=boleta_pdf) — clientId column stores the boleta number.
    const boletaNums = candidates.map((b) => b.boleta);
    const already = await prisma.notificationLog.findMany({
      where: { tipo: "boleta_pdf", clientId: { in: boletaNums } },
      select: { clientId: true },
    });
    const sentSet = new Set(already.map((a) => a.clientId));
    const todo = candidates.filter((b) => !sentSet.has(b.boleta));
    if (todo.length === 0) {
      return NextResponse.json({ ok: true, total: candidates.length, sent: 0 });
    }

    // Per-client opt-out (default = enabled = send).
    const clienteCods = Array.from(new Set(todo.map((b) => b.clienteCod)));
    const prefs = await prisma.clientePreference.findMany({
      where: { clienteCod: { in: clienteCods } },
      select: { clienteCod: true, boletaPdfEnabled: true },
    });
    const optedOut = new Set(prefs.filter((p) => !p.boletaPdfEnabled).map((p) => p.clienteCod));

    // Lookup phone numbers (TelClave3 preferred, fallback TelClave1).
    const phoneReq = pool.request();
    clienteCods.forEach((cod, i) => phoneReq.input(`c${i}`, cod.padStart(7, " ")));
    const phonePlaceholders = clienteCods.map((_, i) => `@c${i}`).join(",");
    const phoneRes = await phoneReq.query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(ISNULL(TelClave3, ISNULL(TelClave1, '')))) AS telefono
      FROM [${dbClientes}].dbo.Clientes
      WHERE Cod IN (${phonePlaceholders})
    `);
    const phoneByCod = new Map<string, string>();
    for (const r of phoneRes.recordset) phoneByCod.set(r.cod, r.telefono);

    let sent = 0;
    let skipped = 0;
    let failed = 0;

    for (const b of todo) {
      if (optedOut.has(b.clienteCod)) {
        skipped++;
        continue;
      }
      const telefono = phoneByCod.get(b.clienteCod);
      if (!telefono || telefono.length < 6) {
        skipped++;
        continue;
      }
      const chatId = toWaChatId(telefono);
      if (!chatId) {
        skipped++;
        continue;
      }

      let ok = false;
      let errorMsg: string | null = null;
      try {
        // Render PDF
        const pdfRes = await fetch(`http://127.0.0.1:3000/api/admin/boleta-pdf?boleta=${encodeURIComponent(b.boleta)}&secret=${CRON_SECRET}`);
        if (!pdfRes.ok) {
          errorMsg = `pdf:${pdfRes.status}`;
        } else {
          const pdfData = await pdfRes.json();
          if (!pdfData.pdf) {
            errorMsg = "pdf:empty";
          } else {
            const firstName = (b.clienteNombre || "").split(/\s+/)[0] || "Cliente";
            const sendRes = await fetch("http://127.0.0.1:3099/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chatId,
                mediaBase64: pdfData.pdf,
                mediaMime: "application/pdf",
                mediaFilename: `Boleta-${b.boleta.trim()}.pdf`,
                mediaCaption: `Hola ${firstName}, te dejamos la boleta N° ${b.boleta.trim()} por tu compra de hoy en Distrialma. Este es un mensaje automatico — la factura final queda disponible en el local.`,
                sender: "bot",
              }),
            });
            if (sendRes.ok) {
              ok = true;
              sent++;
            } else {
              errorMsg = `send:${sendRes.status}`;
            }
          }
        }
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : "error";
      }

      if (!ok) failed++;

      try {
        await prisma.notificationLog.create({
          data: {
            clientId: b.boleta,
            tipo: "boleta_pdf",
            mensaje: `Boleta ${b.boleta} → ${b.clienteCod}`,
            telefono,
            enviadoPor: "auto",
            ok,
            error: errorMsg,
          },
        });
      } catch { /* ignore log errors */ }
    }

    return NextResponse.json({ ok: true, total: candidates.length, sent, skipped, failed });
  } catch (error) {
    console.error("Boleta send error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
