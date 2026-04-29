import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export function toWaChatId(phone) {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

export function formatPrice(n) {
  return "$" + Number(n).toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

export async function storeMessage(chatId, direction, body, sender = "") {
  const safeBody = (body || "").replace(/\x00/g, "").substring(0, 2000);
  const safeLastMsg = safeBody.substring(0, 200);
  const contactPhone = chatId.replace("@c.us", "").replace("@lid", "");
  try {
    await prisma.whatsAppChat.upsert({
      where: { chatId },
      create: { chatId, contactName: "", contactPhone, lastMessage: safeLastMsg, lastMessageAt: new Date(), unread: direction === "in" ? 1 : 0 },
      update: { lastMessage: safeLastMsg, lastMessageAt: new Date(), ...(direction === "in" ? { unread: { increment: 1 } } : {}) },
    });
  } catch (e) {
    // Chat upsert failed (bad chars, etc) — ensure chat exists for FK
    try {
      await prisma.whatsAppChat.create({
        data: { chatId, contactName: "", contactPhone, lastMessage: "", lastMessageAt: new Date(), unread: 0 },
      }).catch(() => {}); // already exists, ignore
    } catch {}
  }
  try {
    await prisma.whatsAppMessage.create({
      data: { chatId, direction, body: safeBody, sender },
    });
  } catch (e) {
    // Silently fail — FK or encoding issue
  }
}
