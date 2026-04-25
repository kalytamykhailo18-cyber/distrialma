import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// GET: preview, POST: send notifications
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const data = await getFacturadosHoy();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Reparto facturado error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let secret = searchParams.get("secret");
  if (!secret) {
    try { const body = await req.json(); secret = body.secret; } catch { /* */ }
  }
  const isCron = secret === CRON_SECRET;
  const isStaff = !isCron && !!(await requireStaff());
  if (!isCron && !isStaff) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { clientes } = await getFacturadosHoy();
    if (clientes.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No hay facturados hoy" });
    }

    // Check dedup — don't send twice in same day
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    todayStart.setHours(todayStart.getHours() + 3);
    const todayStr = now.getFullYear().toString() + String(now.getMonth() + 1).padStart(2, "0") + String(now.getDate()).padStart(2, "0") + "000000";
    const fecha = `${now.getDate()}/${now.getMonth() + 1}`;
    const alreadySent = await prisma.notificationLog.findMany({
      where: { tipo: "facturado_reparto", ok: true, createdAt: { gte: todayStart } },
      select: { clientId: true },
    });
    const sentSet = new Set(alreadySent.map((r) => r.clientId));

    let sent = 0;
    for (const cliente of clientes) {
      if (sentSet.has(cliente.cod)) continue;

      const chatId = toWaChatId(cliente.telefono);
      if (!chatId) continue;

      const firstName = cliente.nombre.split(" ")[0];
      const msg = `Hola ${firstName}, te informamos que hoy se facturaron tus pedidos por un total de ${formatPrice(cliente.total)}.\n\nPodes ver el detalle en distrialma.com.ar/mis-pedidos\n\nEste es un mensaje automatico (s.e.u.o.)`;

      try {
        // Send text message
        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg }),
        });

        // Send PDF with boletas detail
        if (res.ok) {
          try {
            const pdfRes = await fetch(`http://127.0.0.1:3000/api/admin/reparto-facturado/pdf?cliente=${encodeURIComponent(cliente.cod)}&desde=${todayStr}&secret=${CRON_SECRET}`);
            if (pdfRes.ok) {
              const pdfData = await pdfRes.json();
              if (pdfData.pdf) {
                await fetch("http://127.0.0.1:3099/send", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chatId, mediaBase64: pdfData.pdf, mediaMime: "application/pdf", mediaFilename: `Boletas-${firstName}.pdf`, mediaCaption: `Boletas ${firstName} - ${fecha}` }),
                });
              }
            }
          } catch { /* PDF send failed, text was already sent */ }
        }
        if (res.ok) {
          sent++;
          await prisma.notificationLog.create({
            data: { clientId: cliente.cod, tipo: "facturado_reparto", mensaje: msg, telefono: cliente.telefono, enviadoPor: "sistema", ok: true },
          });
        }
      } catch { /* */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log(`[REPARTO-FACTURADO] Sent ${sent}/${clientes.length} invoice notifications`);
    return NextResponse.json({ ok: true, sent, total: clientes.length });
  } catch (error) {
    console.error("Reparto facturado error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

async function getFacturadosHoy() {
  const pool = await getPool();
  const dbTransas = getDbName("transas");
  const dbClientes = getDbName("clientes");

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const todayStr = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, "0")
    + String(now.getDate()).padStart(2, "0") + "000000";

  const result = await pool.request().input("desde", todayStr).query(`
    SELECT LTRIM(RTRIM(t.Cliente)) AS clienteCod,
      LTRIM(RTRIM(c.Nombre)) AS nombre,
      LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono,
      SUM(t.Total) AS total,
      COUNT(DISTINCT t.Boleta) AS boletas
    FROM [${dbTransas}].dbo.Transas t
    INNER JOIN [${dbClientes}].dbo.Clientes c ON c.Cod = t.Cliente
    WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
      AND LTRIM(RTRIM(t.Sucursal)) = '7'
      AND t.Fechora >= @desde
      AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
      AND (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
    GROUP BY LTRIM(RTRIM(t.Cliente)), LTRIM(RTRIM(c.Nombre)),
      LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, ''))))
    ORDER BY SUM(t.Total) DESC
  `);

  const clientes = result.recordset.map((r: { clienteCod: string; nombre: string; telefono: string; total: number; boletas: number }) => ({
    cod: r.clienteCod,
    nombre: r.nombre,
    telefono: r.telefono,
    total: Number(r.total),
    boletas: Number(r.boletas),
  }));

  return { clientes, fecha: `${now.getDate()}/${now.getMonth() + 1}` };
}
