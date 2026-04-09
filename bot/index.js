import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import Anthropic from "@anthropic-ai/sdk";
import { searchProducts, findClientByPhone, formatPrice } from "./products.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

// Conversation memory: chatId → [{ role, content }, ...]
const conversations = new Map();
// Chats where a human took over (silenced)
const humanTakeover = new Map(); // chatId → timestamp
const HUMAN_SILENCE_MS = 2 * 60 * 60 * 1000; // 2 hours
// Track chats where the bot is actively replying (to avoid race condition with message_create)
const botReplying = new Set();

const SYSTEM_PROMPT = `Sos el asistente virtual de Distrialma, una distribuidora mayorista de almacén, bebidas, limpieza, fiambres y más en Merlo, Buenos Aires.

Atendés clientes que escriben por WhatsApp. Tu personalidad: amable, breve, directa, en español argentino (vos, no tú). Nunca uses emojis a menos que el cliente los use primero.

REGLAS IMPORTANTES:
1. Si te preguntan por productos, usá la herramienta search_products para buscar en la base real. Nunca inventes productos ni precios.
2. Mostrá siempre el precio Mayorista. Si hay precio Caja Cerrada, también mencionalo. Siempre agregá al final: "Stock sujeto a disponibilidad de sucursal."
3. Si el producto exacto no existe, ofrecé alternativas similares de la misma categoría.
4. Si el cliente quiere hacer un pedido, decile que entre a https://distrialma.com.ar y arme el pedido desde ahí, o que un asesor lo va a contactar.
5. Si te preguntan algo que no sabés (descuentos especiales, plazos, etc.), decí que un asesor lo va a contactar y no inventes.
6. No des información de otros clientes ni datos privados.
7. Mantené las respuestas cortas (1-3 oraciones) salvo que sea estrictamente necesario.
8. NUNCA uses formato con negritas, cursivas ni markdown. Escribí todo en texto plano.
9. RECLAMOS: Si el cliente tiene un reclamo o queja (por precios mal cobrados, productos en mal estado, faltantes, etc.), NO intentes resolver el problema. Respondé: "Tomamos nota de tu reclamo. Ya le pasamos tu número a nuestra encargada para que se comunique con vos y lo resuelva." Internamente, el reclamo se deriva automáticamente.
10. Si el cliente pide hablar con una persona, decí: "Te paso con un asesor, en breve te contacta."

Información del negocio:
- Web: https://distrialma.com.ar
- WhatsApp Mayorista: +54 9 11 5413-7677
- Ubicación: Merlo, Buenos Aires`;

const NEW_CLIENT_MESSAGE = `Hola! Gracias por escribirnos.

Para darte acceso a nuestra plataforma web:

Si ya estas registrado:
Envíanos tu nombre completo y te damos el alta directa.

Si no estas registrado:
Envíanos los siguientes datos:
- Nombre completo
- Direccion personal
- Numero de telefono
- CUIT, CUIL o DNI

Asi te activamos y podes empezar a comprar!`;

// Phone number for complaint escalation
const RECLAMOS_PHONE = "5491134207773";

const TOOLS = [
  {
    name: "search_products",
    description: "Busca productos en la base real de Distrialma por nombre. Devuelve productos con sus precios (Mayorista y Caja Cerrada), stock disponible, marca, rubro y link directo.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Nombre o palabras clave del producto a buscar (ej: 'coca cola 2.25', 'queso muzzarella')",
        },
      },
      required: ["query"],
    },
  },
];

async function callClaude(chatId, userMessage, clientInfo) {
  const history = conversations.get(chatId) || [];
  history.push({ role: "user", content: userMessage });
  // Cap history at last 20 messages
  if (history.length > 20) history.splice(0, history.length - 20);

  let systemWithContext = SYSTEM_PROMPT;
  if (clientInfo) {
    systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE REGISTRADO:\n- Nombre: ${clientInfo.nombre}\n- CUIT: ${clientInfo.cuit || "(no cargado)"}\n- Saldo cuenta corriente: ${formatPrice(clientInfo.saldo)}`;
  }

  // Loop until Claude is done with tool use
  let iteration = 0;
  while (iteration < 5) {
    iteration++;
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemWithContext,
      tools: TOOLS,
      messages: history,
    });

    // Add assistant response to history
    history.push({ role: "assistant", content: response.content });

    // Process tool uses
    const toolUses = response.content.filter((c) => c.type === "tool_use");
    if (toolUses.length === 0) {
      // Done — extract text reply
      const textBlocks = response.content.filter((c) => c.type === "text");
      const reply = textBlocks.map((c) => c.text).join("\n").trim();
      conversations.set(chatId, history);
      return reply || "Disculpá, no pude responder. ¿Podés repetirme tu consulta?";
    }

    // Execute tools
    const toolResults = [];
    for (const tu of toolUses) {
      let result;
      try {
        if (tu.name === "search_products") {
          const products = await searchProducts(tu.input.query);
          if (products.length === 0) {
            result = { found: 0, message: "No se encontraron productos con ese nombre." };
          } else {
            result = {
              found: products.length,
              products: products.map((p) => ({
                sku: p.sku,
                nombre: p.name,
                marca: p.marca,
                rubro: p.rubro,
                precio_mayorista: formatPrice(p.mayorista),
                precio_caja_cerrada: p.cajaCerrada > 0 ? formatPrice(p.cajaCerrada) : null,
                stock: p.stock,
                disponible: p.disponible,
                link: p.url,
              })),
            };
          }
        } else {
          result = { error: "Herramienta desconocida" };
        }
      } catch (e) {
        result = { error: e.message };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: JSON.stringify(result),
      });
    }
    history.push({ role: "user", content: toolResults });
  }

  conversations.set(chatId, history);
  return "Disculpá, tuve un problema procesando tu consulta. ¿Podés intentar de nuevo?";
}

// Initialize WhatsApp client
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./session" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    executablePath: "/root/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome",
  },
});

client.on("qr", (qr) => {
  console.log("\n========== ESCANEAR QR ==========\n");
  qrcode.generate(qr, { small: true });
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
  console.log(`\nQR como imagen: ${qrUrl}\n`);
  console.log("=================================\n");
});

client.on("ready", () => {
  console.log("✓ Bot conectado a WhatsApp");
  console.log("✓ Esperando mensajes...");
});

client.on("authenticated", () => {
  console.log("✓ Autenticado");
});

client.on("auth_failure", (msg) => {
  console.error("✗ Auth failure:", msg);
});

client.on("disconnected", (reason) => {
  console.log("Bot desconectado:", reason);
});

// Handle incoming messages
client.on("message", async (msg) => {
  // Ignore messages from groups, status, broadcasts
  if (msg.from.endsWith("@g.us") || msg.from === "status@broadcast") return;
  // Ignore messages from self
  if (msg.fromMe) return;

  const chatId = msg.from;
  console.log(`[IN] ${chatId}: ${msg.body.substring(0, 100)}`);

  // Check if a human took over recently
  const takeover = humanTakeover.get(chatId);
  if (takeover && Date.now() - takeover < HUMAN_SILENCE_MS) {
    console.log(`  → silenced (human took over)`);
    return;
  }

  // Image messages → just acknowledge as transfer
  if (msg.hasMedia && msg.type === "image") {
    botReplying.add(chatId);
    try {
      await msg.reply("Recibido, aguardá un momento que verificamos la transferencia y te confirmamos.");
    } finally {
      setTimeout(() => botReplying.delete(chatId), 2000);
    }
    humanTakeover.set(chatId, Date.now()); // Mark for human follow-up
    return;
  }

  // Only process text messages
  if (!msg.body || msg.body.trim().length === 0) return;

  try {
    // Try to identify the client
    const phoneNumber = chatId.replace("@c.us", "").replace("@lid", "");
    const clientInfo = await findClientByPhone(phoneNumber);

    // New client: no record in DB and no prior conversation → send registration message
    const hasHistory = conversations.has(chatId);
    if (!clientInfo && !hasHistory) {
      console.log(`[NEW] ${chatId}: cliente nuevo, enviando mensaje de registro`);
      botReplying.add(chatId);
      try {
        await msg.reply(NEW_CLIENT_MESSAGE);
      } finally {
        setTimeout(() => botReplying.delete(chatId), 2000);
      }
      // Still let Claude handle future messages in this session
      conversations.set(chatId, [
        { role: "user", content: msg.body },
        { role: "assistant", content: NEW_CLIENT_MESSAGE },
      ]);
      return;
    }

    // Show typing indicator
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const reply = await callClaude(chatId, msg.body, clientInfo);
    // Strip any markdown formatting Claude might sneak in
    const cleanReply = reply.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").replace(/_/g, "");
    console.log(`[OUT] ${chatId}: ${cleanReply.substring(0, 100)}`);
    botReplying.add(chatId);
    try {
      await msg.reply(cleanReply);
    } finally {
      setTimeout(() => botReplying.delete(chatId), 2000);
    }

    // Detect complaints and forward to reclamos handler
    const isReclamo = /reclamo|queja|mal cobrad|me cobraron|faltante|mal estado|devol/i.test(msg.body);
    if (isReclamo) {
      try {
        const contactName = clientInfo?.nombre || phoneNumber;
        const reclamosMsg = `RECLAMO BOT - Cliente: ${contactName} (${phoneNumber})\nMensaje: ${msg.body}`;
        await client.sendMessage(`${RECLAMOS_PHONE}@c.us`, reclamosMsg);
        console.log(`[RECLAMO] Derivado a ${RECLAMOS_PHONE}: ${contactName}`);
      } catch (e) {
        console.error("Error forwarding reclamo:", e.message);
      }
    }
  } catch (e) {
    console.error("Error processing message:", e);
    botReplying.add(chatId);
    try {
      await msg.reply("Disculpá, tuve un problema técnico. Un asesor te va a contactar en un rato.");
    } catch {}
    setTimeout(() => botReplying.delete(chatId), 2000);
  }
});

// Detect when human sends message → silence bot in that chat
client.on("message_create", async (msg) => {
  if (!msg.fromMe) return;
  const chatId = msg.to;
  if (!chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") return;
  // Skip messages sent by the bot (race-safe: check if bot is replying to this chat)
  if (botReplying.has(chatId)) return;
  // This is a manual reply from a human → silence the bot in this chat
  console.log(`[HUMAN] ${chatId}: tomó el control del chat, silenciando bot por 2hs`);
  humanTakeover.set(chatId, Date.now());
});

console.log("Iniciando bot de Distrialma...");
client.initialize();
