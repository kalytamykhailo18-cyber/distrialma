import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

async function checkAuth(req: NextRequest): Promise<boolean> {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret === CRON_SECRET) return true;
  const session = await requireStaff();
  return !!session;
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

async function getSetting(key: string, defaultVal: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value || defaultVal;
}

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

async function getDeudores(minSaldo: number) {
  const pool = await getPool();
  const dbClientes = getDbName("clientes");

  const result = await pool.request().input("minSaldo", minSaldo).query(`
    SELECT
      LTRIM(RTRIM(c.Cod)) AS cod,
      LTRIM(RTRIM(c.Nombre)) AS nombre,
      LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono,
      CASE WHEN ISNULL(c.FillerBit2, 0) = 1 THEN ISNULL(c.Saldo, 0) * 100 ELSE ISNULL(c.Saldo, 0) END AS saldo
    FROM [${dbClientes}].dbo.Clientes c
    WHERE (c.DeBaja = 0 OR c.DeBaja IS NULL)
      AND CASE WHEN ISNULL(c.FillerBit2, 0) = 1 THEN ISNULL(c.Saldo, 0) * 100 ELSE ISNULL(c.Saldo, 0) END > @minSaldo
      AND (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
    ORDER BY saldo DESC
  `);

  return result.recordset.map((r: { cod: string; nombre: string; telefono: string; saldo: number }) => ({
    cod: r.cod,
    nombre: r.nombre,
    telefono: r.telefono,
    saldo: Number(r.saldo),
  }));
}

// GET: preview who would be reminded
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);

  // If ?history=1, return send history
  if (searchParams.get("history") === "1") {
    const logs = await prisma.notificationLog.findMany({
      where: { tipo: "deuda_auto" },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    // Group by date (day)
    const byDay = new Map<string, { ok: number; failed: number; date: string }>();
    for (const log of logs) {
      const day = log.createdAt.toISOString().slice(0, 10);
      const entry = byDay.get(day) || { ok: 0, failed: 0, date: day };
      if (log.ok) entry.ok++; else entry.failed++;
      byDay.set(day, entry);
    }
    return NextResponse.json({ history: Array.from(byDay.values()) });
  }

  const minSaldo = parseFloat(await getSetting("deuda_reminder_min_saldo", "50000"));
  const cooldownDays = parseInt(await getSetting("deuda_reminder_cooldown_days", "7"));
  const maxPerRun = parseInt(await getSetting("deuda_reminder_max_per_run", "50"));
  const enabled = (await getSetting("deuda_reminder_enabled", "true")) === "true";

  // Check Argentina time
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hour = now.getHours();

  const deudores = await getDeudores(minSaldo);

  // Check cooldown — exclude recently reminded
  const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
  const recentReminders = await prisma.notificationLog.findMany({
    where: {
      tipo: { in: ["deuda", "deuda_auto"] },
      ok: true,
      createdAt: { gte: cooldownDate },
    },
    select: { clientId: true },
  });
  const recentlyReminded = new Set(recentReminders.map((r) => r.clientId));

  // Exclude reparto clients who had delivery today or yesterday (they pay next day)
  const dayNames = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
  const todayName = dayNames[now.getDay()];
  const yesterdayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const yesterdayName = dayNames[yesterdayIdx];

  const repartoToday = await prisma.clientDeliveryDay.findMany({
    where: { day: { in: [todayName, yesterdayName] } },
    select: { clientId: true },
  });
  const repartoExcluded = new Set(repartoToday.map((r) => r.clientId));

  const eligible = deudores
    .filter((d) => !recentlyReminded.has(d.cod) && !repartoExcluded.has(d.cod))
    .slice(0, maxPerRun);

  return NextResponse.json({
    enabled,
    hora: `${hour}:${String(now.getMinutes()).padStart(2, "0")}`,
    dentroDeHorario: hour >= 9 && hour < 18,
    minSaldo,
    cooldownDays,
    maxPerRun,
    totalDeudores: deudores.length,
    yaRemindados: recentlyReminded.size,
    elegibles: eligible.length,
    clientes: eligible,
  });
}

// POST: send reminders
export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const enabled = (await getSetting("deuda_reminder_enabled", "true")) === "true";
  if (!enabled) {
    return NextResponse.json({ ok: true, skipped: true, reason: "deshabilitado" });
  }

  // Check Argentina time (9am-6pm)
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const hour = now.getHours();
  if (hour < 9 || hour >= 18) {
    return NextResponse.json({ ok: true, skipped: true, reason: "fuera de horario" });
  }

  const minSaldo = parseFloat(await getSetting("deuda_reminder_min_saldo", "50000"));
  const cooldownDays = parseInt(await getSetting("deuda_reminder_cooldown_days", "7"));
  const maxPerRun = parseInt(await getSetting("deuda_reminder_max_per_run", "50"));
  const messageTemplate = await getSetting("deuda_reminder_message",
    "Hola {nombre}, te recordamos que tenes un saldo pendiente de {saldo} en Distrialma. Podes abonar por transferencia o acercarte al local. Cualquier consulta estamos a disposicion. Gracias!");

  const deudores = await getDeudores(minSaldo);

  const cooldownDate = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
  const recentReminders = await prisma.notificationLog.findMany({
    where: {
      tipo: { in: ["deuda", "deuda_auto"] },
      ok: true,
      createdAt: { gte: cooldownDate },
    },
    select: { clientId: true },
  });
  const recentlyReminded = new Set(recentReminders.map((r) => r.clientId));

  // Exclude reparto clients who had delivery today or yesterday
  const dayNames = ["DOMINGO", "LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];
  const todayName = dayNames[now.getDay()];
  const yesterdayIdx = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const yesterdayName = dayNames[yesterdayIdx];
  const repartoToday = await prisma.clientDeliveryDay.findMany({
    where: { day: { in: [todayName, yesterdayName] } },
    select: { clientId: true },
  });
  const repartoExcluded = new Set(repartoToday.map((r) => r.clientId));

  const eligible = deudores
    .filter((d) => !recentlyReminded.has(d.cod) && !repartoExcluded.has(d.cod))
    .slice(0, maxPerRun);

  let sent = 0;
  let failed = 0;
  let skipped = 0;

  for (const client of eligible) {
    // Per-client dedup check (race condition guard)
    const alreadySent = await prisma.notificationLog.findFirst({
      where: { clientId: client.cod, tipo: { in: ["deuda", "deuda_auto"] }, ok: true, createdAt: { gte: cooldownDate } },
    });
    if (alreadySent) { skipped++; continue; }

    const chatId = toWaChatId(client.telefono);
    if (!chatId) { failed++; continue; }

    const firstName = client.nombre.split(" ")[0];
    const body = messageTemplate
      .replace(/\{nombre\}/g, firstName)
      .replace(/\{nombre_completo\}/g, client.nombre)
      .replace(/\{saldo\}/g, formatPrice(client.saldo));

    try {
      const res = await fetch("http://127.0.0.1:3099/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId, message: body, addToContext: true, sender: "bot" }),
      });

      if (res.ok) {
        sent++;
        await prisma.notificationLog.create({
          data: { clientId: client.cod, tipo: "deuda_auto", mensaje: body, telefono: client.telefono, enviadoPor: "sistema", ok: true },
        });
      } else {
        failed++;
        await prisma.notificationLog.create({
          data: { clientId: client.cod, tipo: "deuda_auto", mensaje: body, telefono: client.telefono, enviadoPor: "sistema", ok: false },
        });
      }
    } catch {
      failed++;
    }

    // Rate limit: 3 seconds between messages
    await new Promise((r) => setTimeout(r, 3000));
  }

  console.log(`[DEUDA-REMINDER] Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}, Eligible: ${eligible.length}`);

  return NextResponse.json({ ok: true, sent, failed, skipped, total: eligible.length });
}
