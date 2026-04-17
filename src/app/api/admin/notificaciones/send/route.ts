import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Clean phone number to WhatsApp format
function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  // Remove leading 0 (old argentine format)
  if (num.startsWith("0")) num = num.slice(1);
  // Remove leading 15 after area code (old cellphone format)
  // Ensure it starts with 549 (argentina cellphone with 9)
  if (num.startsWith("549")) {
    // already ok
  } else if (num.startsWith("54")) {
    num = "549" + num.slice(2);
  } else {
    // assume argentine and prefix 549
    num = "549" + num;
  }
  return `${num}@c.us`;
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userName = (session.user as { name?: string })?.name || "admin";

  try {
    const { recipients, message, tipo } = await req.json();
    if (!Array.isArray(recipients) || !message?.trim()) {
      return NextResponse.json({ error: "recipients y message requeridos" }, { status: 400 });
    }
    const notifType = tipo || "otro";

    const results: Array<{ cod: string; phone: string; ok: boolean; error?: string }> = [];

    for (const r of recipients) {
      const chatId = toWaChatId(r.telefono || "");
      if (!chatId) {
        results.push({ cod: r.cod, phone: r.telefono, ok: false, error: "Telefono invalido" });
        continue;
      }

      // Personalize message
      const body = message
        .replace(/\{nombre\}/g, r.nombre || "")
        .replace(/\{saldo\}/g, r.saldo != null ? r.saldo.toLocaleString("es-AR", { style: "currency", currency: "ARS" }) : "");

      let sendOk = false;
      let sendError: string | null = null;
      try {
        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: body, addToContext: true, sender: "bot" }),
        });
        if (res.ok) {
          sendOk = true;
          results.push({ cod: r.cod, phone: r.telefono, ok: true });
        } else {
          const err = await res.json().catch(() => ({}));
          sendError = err.error || "Error al enviar";
          results.push({ cod: r.cod, phone: r.telefono, ok: false, error: sendError || undefined });
        }
      } catch (e: unknown) {
        sendError = e instanceof Error ? e.message : "Error";
        results.push({ cod: r.cod, phone: r.telefono, ok: false, error: sendError });
      }

      // Log the notification attempt
      try {
        await prisma.notificationLog.create({
          data: {
            clientId: r.cod,
            tipo: notifType,
            mensaje: body,
            telefono: r.telefono || null,
            enviadoPor: userName,
            ok: sendOk,
            error: sendError,
          },
        });
      } catch { /* ignore log errors */ }

      // Small delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    const sent = results.filter((r) => r.ok).length;
    return NextResponse.json({ sent, failed: results.length - sent, results });
  } catch (error) {
    console.error("notification send error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
