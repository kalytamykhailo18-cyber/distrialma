import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

async function getRanking() {
  const pool = await getPool();
  const dbTransas = getDbName("transas");
  const dbEmpleados = getDbName("empleados");

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const todayStr = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, "0")
    + String(now.getDate()).padStart(2, "0") + "000000";

  const result = await pool.request().input("desde", todayStr).query(`
    SELECT LTRIM(RTRIM(t.Empleado)) AS empCod,
      LTRIM(RTRIM(ISNULL(e.Nombre, ''))) AS nombre,
      LTRIM(RTRIM(ISNULL(e.Telefonos, ''))) AS telefono,
      SUM(t.Impo) AS totalVenta,
      COUNT(DISTINCT t.Boleta) AS tickets
    FROM [${dbTransas}].dbo.Transas t
    LEFT JOIN [${dbEmpleados}].dbo.Empleados e ON LTRIM(RTRIM(e.Cod)) COLLATE Modern_Spanish_CI_AS = LTRIM(RTRIM(t.Empleado)) COLLATE Modern_Spanish_CI_AS
    WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
      AND t.Fechora >= @desde
      AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
      AND LTRIM(RTRIM(t.Empleado)) <> ''
    GROUP BY LTRIM(RTRIM(t.Empleado)), LTRIM(RTRIM(ISNULL(e.Nombre, ''))), LTRIM(RTRIM(ISNULL(e.Telefonos, '')))
    ORDER BY SUM(t.Impo) DESC
  `);

  const ranking = result.recordset.map((r: { empCod: string; nombre: string; telefono: string; totalVenta: number; tickets: number }, i: number) => ({
    posicion: i + 1,
    empCod: r.empCod,
    nombre: r.nombre || r.empCod,
    telefono: r.telefono,
    totalVenta: Number(r.totalVenta),
    tickets: Number(r.tickets),
    ticketPromedio: Number(r.tickets) > 0 ? Number(r.totalVenta) / Number(r.tickets) : 0,
  }));

  const totalGeneral = ranking.reduce((s, r) => s + r.totalVenta, 0);
  const fecha = `${now.getDate()}/${now.getMonth() + 1}`;

  // Build ranking messages
  const medals = ["🥇", "🥈", "🥉"];
  const top6 = ranking.slice(0, 6);

  // Full message for Gaston (with amounts)
  let msgGaston = `Ranking de ventas ${fecha}\n\n`;
  for (const r of ranking) {
    const medal = medals[r.posicion - 1] || `${r.posicion}.`;
    msgGaston += `${medal} ${r.nombre} — ${formatPrice(r.totalVenta)} (${r.tickets} tickets)\n`;
  }
  msgGaston += `\nTotal del dia: ${formatPrice(totalGeneral)}`;

  // Employee message (top 6, no amounts)
  let msgEmpleados = `Ranking de ventas ${fecha}\n\n`;
  for (const r of top6) {
    const medal = medals[r.posicion - 1] || `${r.posicion}.`;
    msgEmpleados += `${medal} ${r.nombre} — ${r.tickets} tickets\n`;
  }

  return { ranking, totalGeneral, message: msgGaston, messageEmpleados: msgEmpleados, fecha };
}

// GET: preview
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  if (searchParams.get("secret") !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const data = await getRanking();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Ranking error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: send ranking + personal messages
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let secret = searchParams.get("secret");
  if (!secret) {
    try { const body = await req.json(); secret = body.secret; } catch { /* */ }
  }
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");
    const { ranking, message, messageEmpleados } = await getRanking();
    if (ranking.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, reason: "No hay ventas hoy" });
    }

    let sent = 0;
    const first = ranking[0];
    const top6 = ranking.slice(0, 6);
    const lastTop6 = top6[top6.length - 1];

    // 1. Full ranking with amounts → Gaston only
    try {
      await fetch("http://127.0.0.1:3099/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: (process.env.GASTON_PHONE || "5491122254949") + "@c.us", message }),
      });
      sent++;
    } catch { /* */ }
    await new Promise((r) => setTimeout(r, 1000));

    // 2. Top 6 ranking without amounts → ALL employees with phone
    const allEmployees = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(ISNULL(Telefonos,''))) AS telefono
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL) AND LTRIM(RTRIM(ISNULL(Telefonos,''))) <> ''
    `);

    for (const emp of allEmployees.recordset) {
      const chatId = toWaChatId(emp.telefono);
      if (!chatId) continue;

      // Choose message: congrats for first, motivation for 6th, ranking for rest
      let personalMsg = "";
      if (emp.cod === first.empCod) {
        personalMsg = `Felicitaciones ${first.nombre.split(" ")[0]}! Vas primero en el ranking de ventas de hoy con ${first.tickets} tickets. Segui asi!\n\n${messageEmpleados}`;
      } else if (top6.length > 2 && emp.cod === lastTop6.empCod) {
        personalMsg = `${lastTop6.nombre.split(" ")[0]}, estas ${lastTop6.posicion}° en el ranking de hoy. Todavia queda tiempo para subir, vamos que se puede!\n\n${messageEmpleados}`;
      } else {
        personalMsg = messageEmpleados;
      }

      try {
        await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: personalMsg }),
        });
        sent++;
      } catch { /* */ }
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log(`[RANKING] Sent ${sent} messages. First: ${first.nombre}, Last top6: ${lastTop6.nombre}`);
    return NextResponse.json({ ok: true, sent, first: first.nombre, lastTop6: lastTop6.nombre });
  } catch (error) {
    console.error("Ranking error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
