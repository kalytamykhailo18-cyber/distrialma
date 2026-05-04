import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

// POST: send pending surveys (called by cron every 15 min)
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const now = new Date();
    const pending = await prisma.encuestaEntrega.findMany({
      where: { enviada: false, enviarA: { lte: now } },
      take: 20,
    });

    if (pending.length === 0) {
      return NextResponse.json({ ok: true, sent: 0 });
    }

    let sent = 0;
    for (const enc of pending) {
      const chatId = toWaChatId(enc.telefono);
      if (!chatId) continue;

      const firstName = enc.clientName.split(" ")[0] || "cliente";
      const msg = `Hola ${firstName}! Como fue la entrega de hoy? Respondenos con un numero:\n\n1) Excelente\n2) Bueno\n3) Regular\n4) Malo\n\nTu opinion nos ayuda a mejorar. Gracias!`;

      try {
        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg, sender: "bot" }),
        });
        if (res.ok) {
          await prisma.encuestaEntrega.update({ where: { id: enc.id }, data: { enviada: true } });
          sent++;
        }
      } catch {}
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log(`[ENCUESTA] Sent ${sent} surveys`);
    return NextResponse.json({ ok: true, sent });
  } catch (error) {
    console.error("Encuesta error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// GET: dashboard stats
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const responses = await prisma.encuestaEntrega.findMany({
    where: { respondida: true, createdAt: { gte: monthStart } },
  });

  const total = responses.length;
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const r of responses) {
    if (r.respuesta && r.respuesta >= 1 && r.respuesta <= 4) {
      breakdown[r.respuesta as 1 | 2 | 3 | 4]++;
    }
  }
  const satisfaction = total > 0 ? Math.round(((breakdown[1] + breakdown[2]) / total) * 100) : 0;

  return NextResponse.json({ total, breakdown, satisfaction });
}
