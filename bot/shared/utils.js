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
  try {
    let contactName = "";
    let contactPhone = chatId.replace("@c.us", "").replace("@lid", "");
    await prisma.whatsAppChat.upsert({
      where: { chatId },
      create: { chatId, contactName, contactPhone },
      update: {},
    });
    await prisma.whatsAppMessage.create({
      data: { chatId, direction, body: (body || "").substring(0, 2000), sender },
    });
  } catch { /* silent */ }
}
