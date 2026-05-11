import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const VERIFY_TOKEN = process.env.META_WEBHOOK_VERIFY_TOKEN || "distrialma_meta_webhook_2026";
const FB_PAGE_TOKEN = process.env.FB_PAGE_TOKEN || "";
const FB_PAGE_ID = process.env.FB_PAGE_ID || "";
const IG_ACCOUNT_ID = process.env.INSTAGRAM_ACCOUNT_ID || "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || "";

// Human takeover state
const humanTakeover = new Map<string, number>();
const TAKEOVER_DURATION = 30 * 60 * 1000; // 30 min

// Conversation history
const conversations = new Map<string, Array<{ role: string; content: string }>>();

const SYSTEM_PROMPT = `Soy Mily, asistente virtual de Distrialma (mayorista alimentos, Merlo, Buenos Aires). Respondo por Instagram/Facebook, español argentino, breve (1-3 oraciones), texto plano sin markdown.

IDENTIDAD: Me llamo Mily. Si me preguntan quien soy digo "Soy Mily, la asistente virtual de Distrialma". No digo que soy IA ni robot.
PRODUCTOS: Busco productos por nombre. Mostramos precio Mayorista. Precios con IVA. "Stock sujeto a disponibilidad." Web: distrialma.com.ar
PAGOS/ALIAS: NO dar el alias bancario. Decir "el alias para transferencia te lo indican en el comercio."
NO SABE: "Un asesor te contacta." No inventar.
RECLAMOS: "Tomamos nota, nuestra encargada te contacta."
PERSONA: "Te paso con un asesor."
PRIVACIDAD: No dar datos de otros clientes.

Horarios: Minorista (Calle Real 435) Lun-Sab 7-22:30, Dom 7-22:30. Mayorista (Av. Calle Real 387) Lun-Sab 8-18. Pontevedra Lun-Sab 9-17. Web 24hs.
DOMINGOS: Solo abre el local minorista de Calle Real 435.
IMPORTANTE: NUNCA decir que cerramos a las 14. El mayorista cierra a las 18.`;

// GET: webhook verification
export async function GET(req: NextRequest) {
  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    console.log("[META-WEBHOOK] Verified");
    return new NextResponse(challenge, { status: 200 });
  }

  return new NextResponse("Forbidden", { status: 403 });
}

// POST: receive messages
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Process each entry
    for (const entry of body.entry || []) {
      // Instagram messages
      if (entry.messaging) {
        for (const event of entry.messaging) {
          if (event.message && !event.message.is_echo) {
            await handleMessage(
              event.sender.id,
              event.message.text || "",
              event.message.attachments?.[0]?.type === "image" ? "image" : "text",
              "instagram"
            );
          }
        }
      }

      // Facebook Page messages (Messenger)
      if (entry.messaging && entry.id === FB_PAGE_ID) {
        // Already handled above — Facebook and Instagram use same messaging array
      }

      // Instagram webhook (different format for some events)
      if (entry.changes) {
        for (const change of entry.changes) {
          if (change.field === "messages" && change.value?.message) {
            const msg = change.value.message;
            const senderId = change.value.sender?.id;
            if (senderId && msg.text && senderId !== IG_ACCOUNT_ID) {
              await handleMessage(senderId, msg.text, "text", "instagram");
            }
          }
        }
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[META-WEBHOOK] Error:", error);
    return NextResponse.json({ ok: true }); // Always return 200 to Meta
  }
}

async function handleMessage(senderId: string, text: string, type: string, platform: string) {
  if (!text || !senderId) return;

  const chatId = `${platform}:${senderId}`;
  console.log(`[META-BOT] ${platform} ${senderId}: ${text.substring(0, 60)}`);

  // Check human takeover
  const takeoverTime = humanTakeover.get(chatId);
  if (takeoverTime && Date.now() - takeoverTime < TAKEOVER_DURATION) {
    console.log(`[META-BOT] ${chatId}: silenced (human takeover)`);
    return;
  }

  // Store incoming message
  try {
    await prisma.whatsAppChat.upsert({
      where: { chatId },
      create: { chatId, contactName: senderId, contactPhone: "", lastMessage: text, lastMessageAt: new Date(), unread: 1 },
      update: { lastMessage: text, lastMessageAt: new Date(), unread: { increment: 1 } },
    });
    await prisma.whatsAppMessage.create({
      data: { chatId, direction: "in", body: text, sender: "contact", mediaType: type },
    });
  } catch {}

  // Call Claude AI
  try {
    const history = conversations.get(chatId) || [];
    history.push({ role: "user", content: text });
    if (history.length > 10) history.splice(0, history.length - 10);

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const dias = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
    const timeStr = `${dias[now.getDay()]} ${now.getDate()}, ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        system: SYSTEM_PROMPT + `\n\nFECHA Y HORA: ${timeStr}`,
        messages: history,
      }),
    });

    const data = await res.json();
    const reply = data.content?.[0]?.text;

    if (reply) {
      history.push({ role: "assistant", content: reply });
      conversations.set(chatId, history);

      // Send reply
      await sendReply(senderId, reply, platform);

      // Store outgoing message
      try {
        await prisma.whatsAppMessage.create({
          data: { chatId, direction: "out", body: reply, sender: "bot" },
        });
        await prisma.whatsAppChat.update({
          where: { chatId },
          data: { lastMessage: reply, lastMessageAt: new Date() },
        });
      } catch {}

      console.log(`[META-BOT] Replied to ${chatId}: ${reply.substring(0, 60)}`);
    }
  } catch (error) {
    console.error(`[META-BOT] AI error for ${chatId}:`, error);
  }
}

async function sendReply(recipientId: string, text: string, platform: string) {
  // Both Instagram and Facebook Messenger use the same Send API
  const endpoint = platform === "instagram"
    ? `https://graph.facebook.com/v25.0/${IG_ACCOUNT_ID}/messages`
    : `https://graph.facebook.com/v25.0/${FB_PAGE_ID}/messages`;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: recipientId },
      message: { text },
      access_token: FB_PAGE_TOKEN,
    }),
  });

  const data = await res.json();
  if (data.error) {
    console.error(`[META-BOT] Send error (${platform}):`, data.error);
  }
}
