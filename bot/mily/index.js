// Mily — Customer-facing AI bot for Distrialma
// Responds to WhatsApp messages with Claude AI, searches products, handles registration

import fs from "fs";
import { createWhatsAppClient, pkg } from "../shared/whatsapp-client.js";
import { createHttpServer } from "../shared/http-server.js";
import { prisma, storeMessage } from "../shared/utils.js";
import { callClaude, NEW_CLIENT_MESSAGE, findClientByPhone } from "./ai-handler.js";

const PORT = 3099;
const RECLAMOS_PHONE = process.env.RECLAMOS_PHONE || "5491134207773";
const RRHH_PHONE = process.env.RRHH_PHONE || "5491176003814";

// State
const conversations = new Map();
const humanTakeover = new Map();
const HUMAN_SILENCE_MS = 2 * 60 * 60 * 1000;
const botReplying = new Set();
const inboxReplying = new Set();

// Persist seen chats
const SEEN_FILE = "./mily/session/seen-chats.json";
let seenChats = new Set();
try { seenChats = new Set(JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"))); } catch {}
function markSeen(chatId) {
  seenChats.add(chatId);
  try { fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenChats])); } catch {}
}

// Recruitment flow
const recruitmentChats = new Map();
const RECRUITMENT_KEYWORDS = /\b(cv|curriculum|trabajo|empleo|busco trabajo|puesto|vacante|contrat|necesitan personal|necesitan gente)\b/i;

// Auto-reply patterns to ignore
const AUTO_REPLY_PATTERNS = [
  /fuera de horario/i, /horario de atenci[oó]n/i, /no estamos disponibles/i,
  /respuesta autom[aá]tica/i, /mensaje autom[aá]tico/i, /chat autom[aá]tico/i,
  /elija una opci[oó]n/i, /nuestro horario/i, /volvemos a las/i, /atendemos de/i,
];

// Create WhatsApp client
const { client, getStatus } = createWhatsAppClient({
  sessionPath: "./mily/session",
  name: "MILY",
  onDisconnect: async (reason) => {
    try {
      const { Resend } = await import("resend");
      const resendKey = process.env.RESEND_API_KEY || "";
      const emailTo = process.env.BOT_ALERT_EMAIL || "despensaalma2020@gmail.com";
      if (resendKey) {
        const resend = new Resend(resendKey);
        await resend.emails.send({
          from: process.env.RESEND_FROM || "Distrialma <onboarding@resend.dev>",
          to: emailTo,
          subject: "Mily WhatsApp desconectada",
          html: `<p>Mily se desconecto de WhatsApp.</p><p>Razon: ${reason}</p><p>Fecha: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p>`,
        });
        console.log("[MILY] Email de desconexion enviado");
      }
    } catch {}
  },
});

// Handle incoming messages
client.on("message", async (msg) => {
  if (msg.from.endsWith("@g.us") || msg.from === "status@broadcast") return;
  if (msg.fromMe) return;

  const chatId = msg.from;
  console.log(`[IN] ${chatId}: ${(msg.body || "").substring(0, 100)}`);
  if (msg.body) {
    storeMessage(chatId, "in", msg.body, "contact");
    try {
      const contact = await msg.getContact();
      const name = contact.pushname || contact.name || "";
      if (name) await prisma.whatsAppChat.update({ where: { chatId }, data: { contactName: name } }).catch(() => {});
    } catch {}
  }

  // Human takeover check
  const takeover = humanTakeover.get(chatId);
  if (takeover && Date.now() - takeover < HUMAN_SILENCE_MS) {
    console.log(`[SKIP] ${chatId}: silenced`);
    return;
  }

  // Recruitment flow
  const recruit = recruitmentChats.get(chatId);
  if (recruit) {
    botReplying.add(chatId);
    try {
      if (recruit.step === "nombre") { recruit.data.nombre = msg.body.trim(); recruit.step = "edad"; await msg.reply("Gracias " + recruit.data.nombre + ". Cual es tu edad?"); }
      else if (recruit.step === "edad") { recruit.data.edad = msg.body.trim(); recruit.step = "experiencia"; await msg.reply("Gracias. Contanos brevemente tu experiencia laboral."); }
      else if (recruit.step === "experiencia") { recruit.data.experiencia = msg.body.trim(); recruit.step = "referencias"; await msg.reply("Tenes referencias laborales comprobables? Pasanos nombre y telefono de contacto."); }
      else if (recruit.step === "referencias") { recruit.data.referencias = msg.body.trim(); recruit.step = "cv"; await msg.reply("Perfecto. Si tenes CV, mandalo como foto o archivo. Si no tenes, escribi 'no tengo'."); }
      else if (recruit.step === "cv") {
        let cvNote = "No envio CV";
        if (msg.hasMedia) {
          try { const media = await msg.downloadMedia(); if (media) { await client.sendMessage(`${RRHH_PHONE}@c.us`, media, { caption: `CV de ${recruit.data.nombre || chatId}` }); cvNote = "CV enviado"; } } catch (e) { cvNote = "Error: " + e.message?.substring(0, 50); }
        } else if (msg.body.trim().toLowerCase().includes("no tengo")) { cvNote = "No tiene CV"; }
        else { cvNote = msg.body.trim(); }
        recruit.data.cv = cvNote;
        const summary = `POSTULANTE BOT\nNombre: ${recruit.data.nombre || "No indicado"}\nTelefono: ${recruit.data.telefono}\nEdad: ${recruit.data.edad}\nExperiencia: ${recruit.data.experiencia}\nReferencias: ${recruit.data.referencias}\nCV: ${cvNote}`;
        await client.sendMessage(`${RRHH_PHONE}@c.us`, summary);
        await msg.reply("Listo, recibimos tus datos. Te vamos a contactar si hay una vacante disponible. Gracias por escribirnos!");
        recruitmentChats.delete(chatId);
      }
    } catch (e) { console.error("[RECRUIT] Error:", e.message); }
    finally { setTimeout(() => botReplying.delete(chatId), 2000); }
    return;
  }

  // Detect recruitment intent
  if (msg.body && RECRUITMENT_KEYWORDS.test(msg.body)) {
    let recruitPhone = chatId.replace("@c.us", "").replace("@lid", "");
    try { const contact = await msg.getContact(); recruitPhone = contact.number || contact.id?.user || recruitPhone; } catch {}
    recruitmentChats.set(chatId, { step: "nombre", data: { telefono: recruitPhone } });
    botReplying.add(chatId);
    try { await msg.reply("Hola! Gracias por tu interes en trabajar con nosotros. Te vamos a hacer unas preguntas.\n\nComo te llamas?"); }
    finally { setTimeout(() => botReplying.delete(chatId), 2000); }
    return;
  }

  // Image → transfer receipt
  if (msg.hasMedia && msg.type === "image") {
    botReplying.add(chatId);
    try {
      const media = await msg.downloadMedia();
      if (media) {
        const phoneNumber = chatId.replace("@c.us", "").replace("@lid", "");
        const clientInfo = await findClientByPhone(phoneNumber).catch(() => null);
        const contactName = (await msg.getContact().catch(() => null))?.pushname || clientInfo?.nombre || phoneNumber;
        const ts = new Date();
        const dir = `./mily/session/transferencias/${ts.toISOString().slice(0, 10)}`;
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
        const ext = (media.mimetype?.split("/")[1] || "jpg").split(";")[0];
        const filename = `${dir}/${ts.toTimeString().slice(0, 8).replace(/:/g, "-")}_${String(contactName).replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40)}.${ext}`;
        try { fs.writeFileSync(filename, Buffer.from(media.data, "base64")); console.log(`[TRANSFER] Saved: ${filename}`); } catch (e) { console.error("[TRANSFER] save error:", e.message); }
        try {
          await prisma.whatsAppMessage.create({ data: { chatId, direction: "in", body: `[Imagen] ${filename.replace("./mily/session/", "")}`, sender: "contact", mediaType: media.mimetype || "image" } });
          await prisma.whatsAppChat.upsert({ where: { chatId }, create: { chatId, contactName: String(contactName), contactPhone: phoneNumber, lastMessage: "[Imagen — posible transferencia]", lastMessageAt: new Date(), unread: 1 }, update: { lastMessage: "[Imagen — posible transferencia]", lastMessageAt: new Date(), unread: { increment: 1 } } });
        } catch (e) { console.error("[TRANSFER] db error:", e.message); }
      }
      await msg.reply("Recibido, aguardá un momento que verificamos la transferencia y te confirmamos.");
    } catch (e) { console.error("[TRANSFER] error:", e.message); }
    finally { setTimeout(() => botReplying.delete(chatId), 2000); }
    humanTakeover.set(chatId, Date.now());
    return;
  }

  // Text messages only
  if (!msg.body || msg.body.trim().length === 0) return;

  try {
    const phoneNumber = chatId.replace("@c.us", "").replace("@lid", "");
    const clientInfo = await findClientByPhone(phoneNumber);
    markSeen(chatId);

    if (!clientInfo) {
      const alreadySentRegistration = conversations.has(chatId);
      if (!alreadySentRegistration && !seenChats.has(chatId)) {
        botReplying.add(chatId);
        try { await msg.reply(NEW_CLIENT_MESSAGE); } finally { setTimeout(() => botReplying.delete(chatId), 2000); }
        conversations.set(chatId, [{ role: "user", content: msg.body }, { role: "assistant", content: NEW_CLIENT_MESSAGE }]);
        return;
      }
    }

    botReplying.add(chatId);
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const reply = await callClaude(chatId, msg.body, clientInfo, phoneNumber, { conversations, client, storeMessage });
    const cleanReply = reply.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").replace(/_/g, "");
    console.log(`[OUT] ${chatId}: ${cleanReply.substring(0, 100)}`);
    storeMessage(chatId, "out", cleanReply, "bot");
    try { await msg.reply(cleanReply); } finally { setTimeout(() => botReplying.delete(chatId), 2000); }

    // Complaint escalation
    if (/reclamo|queja|mal cobrad|me cobraron|faltante|mal estado|devol/i.test(msg.body)) {
      const nowHour = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })).getHours();
      if (nowHour >= 8 && nowHour < 18) {
        try { await client.sendMessage(`${RECLAMOS_PHONE}@c.us`, `RECLAMO BOT - Cliente: ${clientInfo?.nombre || phoneNumber} (${phoneNumber})\nMensaje: ${msg.body}`); } catch {}
      }
    }
  } catch (e) {
    console.error("Error processing message:", e);
    botReplying.add(chatId);
    try { await msg.reply("Disculpá, tuve un problema técnico. Un asesor te va a contactar en un rato."); } catch {}
    setTimeout(() => botReplying.delete(chatId), 2000);
  }
});

// Detect human takeover
client.on("message_create", async (msg) => {
  if (!msg.fromMe) return;
  const chatId = msg.to;
  if (!chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") return;
  if (botReplying.has(chatId) || inboxReplying.has(chatId)) return;
  if (AUTO_REPLY_PATTERNS.some((p) => p.test(msg.body || ""))) {
    console.log(`[AUTO-REPLY] ${chatId}: ignorando respuesta automática de WhatsApp`);
    return;
  }
  console.log(`[HUMAN] ${chatId}: tomó el control del chat, silenciando bot por 2hs`);
  humanTakeover.set(chatId, Date.now());
  if (msg.body) storeMessage(chatId, "out", msg.body, "human");
});

// HTTP server with inbox support
createHttpServer({
  client, getStatus, port: PORT, name: "MILY",
  onSend: (data, target) => {
    inboxReplying.add(target);
    if (data.addToContext) {
      const existing = conversations.get(target) || [];
      existing.push({ role: "assistant", content: data.message });
      conversations.set(target, existing);
    }
    setTimeout(() => inboxReplying.delete(target), 30000);
  },
});

// Sticker test endpoint (keep compatibility)
// TODO: move to shared HTTP server if needed

console.log("[MILY] Iniciando...");
client.initialize();
