import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { searchProducts, searchByBrand, findClientByPhone, registerClient, formatPrice } from "./products.js";

// Persist seen chat IDs to avoid re-sending registration message after restart
const SEEN_FILE = "./session/seen-chats.json";
let seenChats = new Set();
try {
  const data = JSON.parse(fs.readFileSync(SEEN_FILE, "utf-8"));
  seenChats = new Set(data);
} catch {}
function markSeen(chatId) {
  seenChats.add(chatId);
  try { fs.writeFileSync(SEEN_FILE, JSON.stringify([...seenChats])); } catch {}
}

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
2. Mostrá siempre el precio Mayorista. Si hay precio Caja Cerrada, también mencionalo. Siempre agregá al final: "Stock sujeto a disponibilidad de sucursal." NUNCA muestres la cantidad de stock exacta (no digas "9 unidades" ni "22.6 kg"). Solo decí si hay o no hay disponibilidad.
3. Si el producto exacto no existe, ofrecé alternativas similares de la misma categoría.
3b. Cuando busques por marca, siempre incluí el link a la página de la marca que te devuelve la herramienta (ej: "Podés ver todos los productos de Tonadita acá: https://distrialma.com.ar/marca/123").
4. Si el cliente quiere hacer un pedido, decile que entre a https://distrialma.com.ar y arme el pedido desde ahí. NO le des ningún número de teléfono para hacer pedidos. Cuando mostrás un producto, incluí el link directo: https://distrialma.com.ar/productos/{sku} (reemplazá {sku} por el código del producto que te devuelve la herramienta).
5. Si te preguntan algo que no sabés (descuentos especiales, plazos, etc.), decí que un asesor lo va a contactar y no inventes. EXCEPCIÓN: si el cliente está registrado y pregunta por su cuenta, saldo o estado de cuenta, SÍ podés darle la información que tenés (nombre, CUIT, saldo). Esa info te llega en el contexto del chat.
6. No des información de otros clientes ni datos privados.
7. Mantené las respuestas cortas (1-3 oraciones) salvo que sea estrictamente necesario.
8. NUNCA uses formato con negritas, cursivas ni markdown. Escribí todo en texto plano.
9. RECLAMOS: Si el cliente tiene un reclamo o queja (por precios mal cobrados, productos en mal estado, faltantes, etc.), NO intentes resolver el problema. Respondé: "Tomamos nota de tu reclamo. Ya le pasamos tu número a nuestra encargada para que se comunique con vos y lo resuelva." Internamente, el reclamo se deriva automáticamente.
10. Si el cliente pide hablar con una persona, decí: "Te paso con un asesor, en breve te contacta."
11. CLIENTES NO REGISTRADOS: Si el cliente no está registrado, ya le pedimos sus datos. Cuando te los pase (nombre, dirección, teléfono, CUIT/CUIL/DNI), usá la herramienta register_client para darlo de alta. Necesitás al menos nombre y teléfono. Después confirmale que ya está registrado y puede empezar a comprar en distrialma.com.ar.

12. HORARIOS Y CHARLA: Si te preguntan la hora, el día, el clima, o cosas casuales, respondé con onda. Sos simpático, cercano y divertido. Para el clima decí algo general de Buenos Aires según la época del año, no inventes datos exactos. Si te piden un chiste, contá uno cortito y gracioso.
13. CUANDO ESTÉN CERRADOS: Siempre aclará qué sucursales abren y a qué hora. Mencioná que pueden hacer pedidos por la web las 24 horas en distrialma.com.ar y que PedidosYa funciona con delivery.

Información del negocio:
- Web: https://distrialma.com.ar (pedidos online 24hs)
- PedidosYa: delivery disponible
- Ubicación: Merlo, Buenos Aires

Sucursales y horarios:
- Minorista (Merlo): Dom a Jue 7:00 a 22:30, Vie y Sab 8:00 a 23:30
- Mayorista Merlo: Lun a Sab 8:00 a 18:00
- Mayorista Pontevedra: Lun a Sab 9:00 a 17:00`;

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
  {
    name: "search_by_brand",
    description: "Busca productos de una marca específica. Usalo cuando el cliente menciona un nombre de marca (ej: 'Antonativa', 'Punta de Agua', 'Pampa Greens'). Devuelve el link a la página de la marca y los productos.",
    input_schema: {
      type: "object",
      properties: {
        brand: {
          type: "string",
          description: "Nombre de la marca (ej: 'Antonativa', 'Punta de Agua')",
        },
        product_keywords: {
          type: "string",
          description: "Palabras opcionales para filtrar productos dentro de la marca (ej: 'cremoso', 'queso')",
        },
      },
      required: ["brand"],
    },
  },
  {
    name: "register_client",
    description: "Registra un cliente nuevo en la base de datos de Distrialma. Usalo cuando un cliente no registrado te pasa sus datos (nombre, dirección, teléfono, CUIT/CUIL/DNI). Necesitás al menos el nombre completo y el teléfono.",
    input_schema: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre completo del cliente",
        },
        direccion: {
          type: "string",
          description: "Dirección del cliente (calle y número)",
        },
        telefono: {
          type: "string",
          description: "Número de teléfono del cliente",
        },
        cuit: {
          type: "string",
          description: "CUIT, CUIL o DNI del cliente",
        },
      },
      required: ["nombre", "telefono"],
    },
  },
];

async function callClaude(chatId, userMessage, clientInfo, phoneNumber) {
  const history = conversations.get(chatId) || [];
  // Save history length before modifying, so we can rollback on error
  const historyLenBefore = history.length;
  history.push({ role: "user", content: userMessage });
  // Cap history at last 20 messages
  if (history.length > 20) history.splice(0, history.length - 20);

  console.log(`[CLAUDE] ${chatId}: msg="${userMessage.substring(0, 60)}" history=${history.length} client=${clientInfo?.nombre || "anon"}`);

  // Add current date/time in Argentina
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const diasSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const timeStr = `${diasSemana[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}, ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let systemWithContext = SYSTEM_PROMPT + `\n\nFECHA Y HORA ACTUAL: ${timeStr}`;
  if (clientInfo) {
    systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE REGISTRADO:\n- Nombre: ${clientInfo.nombre}\n- CUIT: ${clientInfo.cuit || "(no cargado)"}\n- Saldo cuenta corriente: ${formatPrice(clientInfo.saldo)}`;
  } else {
    systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE NO REGISTRADO.\nSu número de teléfono es: ${phoneNumber}\nYa le pedimos sus datos para registrarse. Si te los pasa, usá register_client. Usá el teléfono ${phoneNumber} como teléfono si no te da otro.`;
  }

  // Loop until Claude is done with tool use
  let iteration = 0;
  try {
  while (iteration < 5) {
    iteration++;
    console.log(`[CLAUDE] ${chatId}: API call iter=${iteration} msgs=${history.length}`);
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
    console.log(`[TOOL] ${chatId}: ${toolUses.map(t => t.name + "(" + JSON.stringify(t.input).substring(0, 60) + ")").join(", ")}`);
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
        } else if (tu.name === "search_by_brand") {
          const data = await searchByBrand(tu.input.brand, tu.input.product_keywords || "");
          if (!data.brand) {
            result = { found: 0, message: "No se encontró esa marca." };
          } else {
            result = {
              brand: data.brand.nombre,
              brand_url: data.brand.url,
              found: data.products.length,
              products: data.products.map((p) => ({
                nombre: p.name,
                precio_mayorista: formatPrice(p.mayorista),
                precio_caja_cerrada: p.cajaCerrada > 0 ? formatPrice(p.cajaCerrada) : null,
                stock: p.stock,
                disponible: p.disponible,
                link: p.url,
              })),
            };
          }
        } else if (tu.name === "register_client") {
          const reg = await registerClient({
            nombre: tu.input.nombre,
            direccion: tu.input.direccion || "",
            telefono: tu.input.telefono,
            cuit: tu.input.cuit || "",
          });
          console.log(`[REGISTER] ${chatId}: registered ${reg.nombre} as client ${reg.cod}`);
          result = { success: true, clienteCod: reg.cod, nombre: reg.nombre, message: "Cliente registrado exitosamente." };
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
  } catch (err) {
    // Rollback history to avoid corrupted state (dangling tool_use without tool_result)
    console.error(`[CLAUDE-ERR] ${chatId}: ${err.message} — rolling back history from ${history.length} to ${historyLenBefore}`);
    history.splice(historyLenBefore);
    conversations.set(chatId, history);
    throw err;
  }
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
    const minsLeft = Math.round((HUMAN_SILENCE_MS - (Date.now() - takeover)) / 60000);
    console.log(`[SKIP] ${chatId}: silenced (human took over ${minsLeft}min left)`);
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

    // Unregistered client: not in DB → send registration message first time, then keep listening for data
    markSeen(chatId);
    if (!clientInfo) {
      const alreadySentRegistration = conversations.has(chatId);
      if (!alreadySentRegistration && !seenChats.has(chatId)) {
        console.log(`[NEW] ${chatId}: no registrado, enviando mensaje de registro`);
        botReplying.add(chatId);
        try {
          await msg.reply(NEW_CLIENT_MESSAGE);
        } finally {
          setTimeout(() => botReplying.delete(chatId), 2000);
        }
        conversations.set(chatId, [
          { role: "user", content: msg.body },
          { role: "assistant", content: NEW_CLIENT_MESSAGE },
        ]);
        return;
      }
      // Already sent registration — let Claude handle to collect data and register
      console.log(`[UNREG] ${chatId}: no registrado, esperando datos`);
    }

    // Show typing indicator
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const reply = await callClaude(chatId, msg.body, clientInfo, phoneNumber);
    // Strip any markdown formatting Claude might sneak in
    const cleanReply = reply.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").replace(/_/g, "");
    console.log(`[OUT] ${chatId}: ${cleanReply.substring(0, 100)}`);
    botReplying.add(chatId);
    try {
      await msg.reply(cleanReply);
    } finally {
      setTimeout(() => botReplying.delete(chatId), 2000);
    }

    // Detect complaints and forward to reclamos handler (only during business hours 8-18)
    const isReclamo = /reclamo|queja|mal cobrad|me cobraron|faltante|mal estado|devol/i.test(msg.body);
    if (isReclamo) {
      const nowHour = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })).getHours();
      if (nowHour >= 8 && nowHour < 18) {
        try {
          const contactName = clientInfo?.nombre || phoneNumber;
          const reclamosMsg = `RECLAMO BOT - Cliente: ${contactName} (${phoneNumber})\nMensaje: ${msg.body}`;
          await client.sendMessage(`${RECLAMOS_PHONE}@c.us`, reclamosMsg);
          console.log(`[RECLAMO] Derivado a ${RECLAMOS_PHONE}: ${contactName}`);
        } catch (e) {
          console.error("Error forwarding reclamo:", e.message);
        }
      } else {
        console.log(`[RECLAMO] Fuera de horario, no se deriva: ${phoneNumber}`);
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
