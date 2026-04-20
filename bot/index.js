import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { searchProducts, searchByBrand, searchCombos, findClientByPhone, registerClient, formatPrice, generatePriceListPDF } from "./products.js";

const prisma = new PrismaClient();

async function storeMessage(chatId, direction, body, sender = "") {
  try {
    let contactName = "";
    let contactPhone = chatId.replace("@c.us", "").replace("@lid", "");
    await prisma.whatsAppChat.upsert({
      where: { chatId },
      create: { chatId, contactName, contactPhone, lastMessage: body.substring(0, 200), lastMessageAt: new Date(), unread: direction === "in" ? 1 : 0 },
      update: { lastMessage: body.substring(0, 200), lastMessageAt: new Date(), ...(direction === "in" ? { unread: { increment: 1 } } : {}) },
    });
    await prisma.whatsAppMessage.create({
      data: { chatId, direction, body, sender },
    });
  } catch (e) {
    console.error("[DB] Error storing message:", e.message);
  }
}

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
// Track chats where inbox just sent a message (to avoid double-store and human takeover)
const inboxReplying = new Set();

const SYSTEM_PROMPT = `Sos el asistente virtual de Distrialma, una distribuidora mayorista de almacén, bebidas, limpieza, fiambres y más en Merlo, Buenos Aires.

Atendés clientes que escriben por WhatsApp. Tu personalidad: amable, breve, directa, en español argentino (vos, no tú). Nunca uses emojis a menos que el cliente los use primero.

REGLAS IMPORTANTES:
1. Si te preguntan por productos, usá la herramienta search_products para buscar en la base real. Nunca inventes productos ni precios.
2. Mostrá siempre el precio Mayorista. Si hay precio Caja Cerrada, también mencionalo. Siempre aclará que los precios son con IVA incluido. Siempre agregá al final: "Stock sujeto a disponibilidad de sucursal." NUNCA muestres la cantidad de stock exacta (no digas "9 unidades" ni "22.6 kg"). Solo decí si hay o no hay disponibilidad.
3. Si el producto exacto no existe, ofrecé alternativas similares de la misma categoría.
3b. Si preguntan por combos, promos, packs u ofertas, usá la herramienta search_combos. Mostrá el nombre, los productos que incluye y el precio.
3c. Cuando busques por marca, siempre incluí el link a la página de la marca que te devuelve la herramienta (ej: "Podés ver todos los productos de Tonadita acá: https://distrialma.com.ar/marca/123").
3d. Si el cliente pide la lista de precios o un catalogo, SIEMPRE preguntale primero de que rubro o marca necesita (ej: "De que rubro necesitas la lista? Fiambres, bebidas, limpieza, lacteos..."). Cuando te diga el rubro o marca, usa send_price_list con ese filtro. NUNCA envies la lista completa sin filtro porque es muy pesada. Si insiste en que quiere todo, decile que puede ver todos los precios en distrialma.com.ar.
4. Si el cliente quiere hacer un pedido, decile que entre a https://distrialma.com.ar y arme el pedido desde ahí. NO le des ningún número de teléfono para hacer pedidos. Cuando mostrás un producto, incluí el link directo: https://distrialma.com.ar/productos/{sku} (reemplazá {sku} por el código del producto que te devuelve la herramienta).
5. Si te preguntan algo que no sabés (descuentos especiales, plazos, etc.), decí que un asesor lo va a contactar y no inventes. EXCEPCIÓN: si el cliente está registrado y pregunta por su cuenta o saldo, dale el saldo que tenés. Si pide el detalle de boletas o movimientos, decile que lo puede ver en distrialma.com.ar/mis-pedidos iniciando sesion con su usuario.
6. No des información de otros clientes ni datos privados.
7. Mantené las respuestas cortas (1-3 oraciones) salvo que sea estrictamente necesario.
8. NUNCA uses formato con negritas, cursivas ni markdown. Escribí todo en texto plano.
9. RECLAMOS: Si el cliente tiene un reclamo o queja (por precios mal cobrados, productos en mal estado, faltantes, etc.), NO intentes resolver el problema. Respondé: "Tomamos nota de tu reclamo. Ya le pasamos tu número a nuestra encargada para que se comunique con vos y lo resuelva." Internamente, el reclamo se deriva automáticamente.
10. Si el cliente pide hablar con una persona, decí: "Te paso con un asesor, en breve te contacta."
11. CLIENTES NO REGISTRADOS: Si el cliente no está registrado, ya le pedimos sus datos. Cuando te los pase (nombre, dirección, teléfono, CUIT/CUIL/DNI), usá la herramienta register_client para darlo de alta. Necesitás al menos nombre y teléfono. Después confirmale que ya está registrado y puede empezar a comprar en distrialma.com.ar.

12. HORARIOS Y CHARLA: Si te preguntan la hora, el día, el clima, o cosas casuales, respondé con onda. Sos simpático, cercano y divertido. Para el clima decí algo general de Buenos Aires según la época del año, no inventes datos exactos. Si te piden un chiste, contá uno cortito y gracioso.
12b. STICKER: Tenes un sticker de Alma (el logo de Distrialma). Mandalo con send_sticker cuando sea un buen momento: al final de una buena conversacion, cuando el cliente hace su primer pedido, o cuando se despide amigablemente. No lo mandes en cada conversacion, solo cuando cierre bien.
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
    name: "search_combos",
    description: "Busca combos/promociones disponibles en Distrialma. Un combo es un pack de productos a precio especial (ej: hamburguesa + pan, salchicha + pan). Usalo cuando el cliente pregunta por combos, promos, packs o ofertas.",
    input_schema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Palabras clave del combo (ej: 'hamburguesa', 'salchicha', 'combo'). Si no sabe que buscar, dejalo vacio para ver todos.",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "send_price_list",
    description: "Genera y envia una lista de precios en PDF al cliente por WhatsApp, filtrada por rubro o marca. SIEMPRE usar con filtro, NUNCA sin filtro (la lista completa es muy pesada y traba el sistema).",
    input_schema: {
      type: "object",
      properties: {
        filter: {
          type: "string",
          description: "Filtro OBLIGATORIO por rubro o marca (ej: 'fiambre', 'bebidas', 'limpieza', 'La Flor', 'lacteos')",
        },
      },
      required: ["filter"],
    },
  },
  {
    name: "send_sticker",
    description: "Envia el sticker de Alma (logo de Distrialma) al cliente por WhatsApp. Usalo al final de una buena conversacion, cuando el cliente hace su primer pedido, o cuando se despide amigablemente. No lo mandes siempre, solo cuando sea un lindo cierre.",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
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
    if (clientInfo.accounts) {
      systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE REGISTRADO QUE TIENE ${clientInfo.accounts.length} CUENTAS:`;
      for (const a of clientInfo.accounts) {
        systemWithContext += `\n- ${a.nombre} (Cod: ${a.cod}): Saldo ${formatPrice(a.saldo)}`;
      }
      systemWithContext += `\n- CUIT: ${clientInfo.cuit || "(no cargado)"}`;
      systemWithContext += `\nMostrá el saldo de todas las cuentas cuando pregunte.`;
    } else {
      systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE REGISTRADO:\n- Nombre: ${clientInfo.nombre}\n- CUIT: ${clientInfo.cuit || "(no cargado)"}\n- Saldo cuenta corriente: ${formatPrice(clientInfo.saldo)}`;
    }
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
        } else if (tu.name === "search_combos") {
          const combos = await searchCombos(tu.input.query || "");
          if (combos.length === 0) {
            result = { found: 0, message: "No hay combos disponibles en este momento." };
          } else {
            result = {
              found: combos.length,
              combos: combos.map((c) => ({
                nombre: c.name,
                descripcion: c.description || "",
                precio: c.price ? formatPrice(Number(c.price)) : "Consultar",
                productos: c.items.map((i) => i.sku).join(", "),
                link: `https://distrialma.com.ar/combos/${c.id}`,
              })),
            };
          }
        } else if (tu.name === "send_price_list") {
          try {
            const pdfPath = await generatePriceListPDF(tu.input.filter || null);
            if (pdfPath) {
              const fsSync = await import("fs");
              const pdfData = fsSync.readFileSync(pdfPath);
              const { MessageMedia } = pkg;
              const media = new MessageMedia("application/pdf", pdfData.toString("base64"), "Lista-de-Precios-Distrialma.pdf");
              await client.sendMessage(chatId, media, { caption: "Aca tenes la lista de precios actualizada de Distrialma." });
              storeMessage(chatId, "out", "[PDF] Lista de precios enviada", "bot");
              result = { sent: true, message: "Lista de precios enviada como PDF" };
            } else {
              result = { sent: false, message: "No se encontraron productos para generar la lista" };
            }
          } catch (e) {
            console.error("Price list error:", e.message);
            result = { sent: false, error: e.message };
          }
        } else if (tu.name === "send_sticker") {
          try {
            const fsSync = await import("fs");
            const { fileURLToPath } = await import("url");
            const path = await import("path");
            const stickerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "sticker.png");
            const stickerData = fsSync.readFileSync(stickerPath);
            const { MessageMedia } = pkg;
            const media = new MessageMedia("image/png", stickerData.toString("base64"), "sticker.png");
            await client.sendMessage(chatId, media, { sendMediaAsSticker: true, stickerAuthor: "Distrialma", stickerName: "Alma" });
            storeMessage(chatId, "out", "[Sticker] Alma", "bot");
            result = { sent: true };
          } catch (e) {
            console.error("Sticker error:", e.message);
            result = { sent: false, error: e.message };
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

client.on("disconnected", async (reason) => {
  console.log("Bot desconectado:", reason);
  // Send alert email
  try {
    const { Resend } = await import("resend");
    const resendKey = process.env.RESEND_API_KEY || "";
    const emailTo = process.env.BOT_ALERT_EMAIL || "despensaalma2020@gmail.com";
    if (resendKey) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: process.env.RESEND_FROM || "Distrialma <onboarding@resend.dev>",
        to: emailTo,
        subject: "Bot WhatsApp desconectado",
        html: `<p>El bot de WhatsApp se desconecto.</p><p>Razon: ${reason}</p><p>Fecha: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}</p><p>Necesita escanear el QR nuevamente.</p>`,
      });
      console.log("[ALERT] Email de desconexion enviado a", emailTo);
    }
  } catch (e) {
    console.error("[ALERT] Error enviando email:", e.message);
  }
});

// Recruitment flow state: chatId → { step, data }
const recruitmentChats = new Map();
const RECRUITMENT_KEYWORDS = /\b(cv|curriculum|trabajo|empleo|busco trabajo|puesto|vacante|contrat|necesitan personal|necesitan gente)\b/i;
const RRHH_PHONE = process.env.RRHH_PHONE || "5491176003814";

// Handle incoming messages
client.on("message", async (msg) => {
  // Ignore messages from groups, status, broadcasts
  if (msg.from.endsWith("@g.us") || msg.from === "status@broadcast") return;
  // Ignore messages from self
  if (msg.fromMe) return;

  const chatId = msg.from;
  console.log(`[IN] ${chatId}: ${msg.body.substring(0, 100)}`);
  if (msg.body) {
    storeMessage(chatId, "in", msg.body, "contact");
    // Try to update contact name
    try {
      const contact = await msg.getContact();
      const name = contact.pushname || contact.name || "";
      if (name) {
        await prisma.whatsAppChat.update({ where: { chatId }, data: { contactName: name } }).catch(() => {});
      }
    } catch {}
  }

  // Check if a human took over recently
  const takeover = humanTakeover.get(chatId);
  if (takeover && Date.now() - takeover < HUMAN_SILENCE_MS) {
    const minsLeft = Math.round((HUMAN_SILENCE_MS - (Date.now() - takeover)) / 60000);
    console.log(`[SKIP] ${chatId}: silenced (human took over ${minsLeft}min left)`);
    return;
  }

  // ── RECRUITMENT FLOW ──
  const recruit = recruitmentChats.get(chatId);
  if (recruit) {
    botReplying.add(chatId);
    try {
      if (recruit.step === "nombre") {
        recruit.data.nombre = msg.body.trim();
        recruit.step = "edad";
        await msg.reply("Gracias " + recruit.data.nombre + ". Cual es tu edad?");
      } else if (recruit.step === "edad") {
        recruit.data.edad = msg.body.trim();
        recruit.step = "experiencia";
        await msg.reply("Gracias. Contanos brevemente tu experiencia laboral.");
      } else if (recruit.step === "experiencia") {
        recruit.data.experiencia = msg.body.trim();
        recruit.step = "referencias";
        await msg.reply("Tenes referencias laborales comprobables? Pasanos nombre y telefono de contacto.");
      } else if (recruit.step === "referencias") {
        recruit.data.referencias = msg.body.trim();
        recruit.step = "cv";
        await msg.reply("Perfecto. Si tenes CV, mandalo como foto o archivo. Si no tenes, escribi 'no tengo'.");
      } else if (recruit.step === "cv") {
        let cvNote = "No envio CV";
        if (msg.hasMedia) {
          try {
            const media = await msg.downloadMedia();
            if (media) {
              await client.sendMessage(`${RRHH_PHONE}@c.us`, media, { caption: `CV de ${recruit.data.nombre || chatId}` });
              cvNote = "CV enviado";
            } else {
              cvNote = "Archivo no disponible";
            }
          } catch (e) { cvNote = "Error descargando: " + (e.message || "").substring(0, 50); }
        } else if (msg.body.trim().toLowerCase().includes("no tengo")) {
          cvNote = "No tiene CV";
        } else {
          cvNote = msg.body.trim();
        }
        recruit.data.cv = cvNote;

        // Forward summary to RRHH
        const summary = `POSTULANTE BOT\nNombre: ${recruit.data.nombre || "No indicado"}\nTelefono: ${recruit.data.telefono}\nEdad: ${recruit.data.edad}\nExperiencia: ${recruit.data.experiencia}\nReferencias: ${recruit.data.referencias}\nCV: ${cvNote}`;
        await client.sendMessage(`${RRHH_PHONE}@c.us`, summary);
        console.log(`[RECRUIT] Derivado a RRHH: ${chatId}`);

        await msg.reply("Listo, recibimos tus datos. Te vamos a contactar si hay una vacante disponible. Gracias por escribirnos!");
        recruitmentChats.delete(chatId);
      }
    } catch (e) {
      console.error("[RECRUIT] Error:", e.message);
    } finally {
      setTimeout(() => botReplying.delete(chatId), 2000);
    }
    return;
  }

  // Detect recruitment intent
  if (msg.body && RECRUITMENT_KEYWORDS.test(msg.body)) {
    console.log(`[RECRUIT] ${chatId}: detected recruitment intent`);
    let recruitPhone = chatId.replace("@c.us", "").replace("@lid", "");
    try {
      const contact = await msg.getContact();
      recruitPhone = contact.number || contact.id?.user || recruitPhone;
    } catch {}
    recruitmentChats.set(chatId, { step: "nombre", data: { telefono: recruitPhone } });
    botReplying.add(chatId);
    try {
      await msg.reply("Hola! Gracias por tu interes en trabajar con nosotros. Te vamos a hacer unas preguntas.\n\nComo te llamas?");
    } finally {
      setTimeout(() => botReplying.delete(chatId), 2000);
    }
    return;
  }

  // Image messages → save as transfer receipt (only if not in recruitment)
  if (msg.hasMedia && msg.type === "image") {
    botReplying.add(chatId);
    try {
      // Download and save the image
      const media = await msg.downloadMedia();
      if (media) {
        const phoneNumber = chatId.replace("@c.us", "").replace("@lid", "");
        const clientInfo = await findClientByPhone(phoneNumber).catch(() => null);
        const contactName = (await msg.getContact().catch(() => null))?.pushname || clientInfo?.nombre || phoneNumber;
        const ts = new Date();
        const dateStr = ts.toISOString().slice(0, 10);
        const timeStr = ts.toTimeString().slice(0, 8).replace(/:/g, "-");
        const safeName = String(contactName).replace(/[^a-zA-Z0-9]/g, "_").slice(0, 40);
        const ext = (media.mimetype?.split("/")[1] || "jpg").split(";")[0];
        const dir = `./session/transferencias/${dateStr}`;
        try { fs.mkdirSync(dir, { recursive: true }); } catch {}
        const filename = `${dir}/${timeStr}_${safeName}.${ext}`;
        try {
          fs.writeFileSync(filename, Buffer.from(media.data, "base64"));
          console.log(`[TRANSFER] Saved: ${filename}`);
        } catch (e) { console.error("[TRANSFER] save error:", e.message); }

        // Store metadata in DB so it appears in inbox
        try {
          await prisma.whatsAppMessage.create({
            data: {
              chatId,
              direction: "in",
              body: `[Imagen] ${filename.replace("./session/", "")}`,
              sender: "contact",
              mediaType: media.mimetype || "image",
            },
          });
          await prisma.whatsAppChat.upsert({
            where: { chatId },
            create: { chatId, contactName: String(contactName), contactPhone: phoneNumber, lastMessage: "[Imagen — posible transferencia]", lastMessageAt: new Date(), unread: 1 },
            update: { lastMessage: "[Imagen — posible transferencia]", lastMessageAt: new Date(), unread: { increment: 1 } },
          });
        } catch (e) { console.error("[TRANSFER] db error:", e.message); }
      }
      await msg.reply("Recibido, aguardá un momento que verificamos la transferencia y te confirmamos.");
    } catch (e) {
      console.error("[TRANSFER] error:", e.message);
    } finally {
      setTimeout(() => botReplying.delete(chatId), 2000);
    }
    humanTakeover.set(chatId, Date.now());
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

    // Mark as bot-replying BEFORE calling Claude so auto-greetings during
    // the API call don't trigger human takeover
    botReplying.add(chatId);

    // Show typing indicator
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const reply = await callClaude(chatId, msg.body, clientInfo, phoneNumber);
    // Strip any markdown formatting Claude might sneak in
    const cleanReply = reply.replace(/\*\*/g, "").replace(/\*/g, "").replace(/__/g, "").replace(/_/g, "");
    console.log(`[OUT] ${chatId}: ${cleanReply.substring(0, 100)}`);
    storeMessage(chatId, "out", cleanReply, "bot");
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

// Known auto-reply patterns to ignore
const AUTO_REPLY_PATTERNS = [
  /fuera de horario/i,
  /horario de atenci[oó]n/i,
  /no estamos disponibles/i,
  /respuesta autom[aá]tica/i,
  /mensaje autom[aá]tico/i,
  /chat autom[aá]tico/i,
  /elija una opci[oó]n/i,
  /nuestro horario/i,
  /volvemos a las/i,
  /atendemos de/i,
];

// Detect when human sends message → silence bot in that chat
client.on("message_create", async (msg) => {
  if (!msg.fromMe) return;
  const chatId = msg.to;
  if (!chatId || chatId.endsWith("@g.us") || chatId === "status@broadcast") return;
  // Skip messages sent by the bot or inbox
  if (botReplying.has(chatId)) return;
  if (inboxReplying.has(chatId)) return;
  // Skip WhatsApp auto-replies (fuera de horario, etc.)
  const body = msg.body || "";
  if (AUTO_REPLY_PATTERNS.some((p) => p.test(body))) {
    console.log(`[AUTO-REPLY] ${chatId}: ignorando respuesta automática de WhatsApp`);
    return;
  }
  // This is a manual reply from a human → silence the bot in this chat
  console.log(`[HUMAN] ${chatId}: tomó el control del chat, silenciando bot por 2hs`);
  humanTakeover.set(chatId, Date.now());
  if (msg.body) storeMessage(chatId, "out", msg.body, "human");
});

// HTTP server for inbox API to send messages through the bot
import http from "http";
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", async () => {
      try {
        const { chatId, message, addToContext, sender } = JSON.parse(body);
        if (!chatId || !message) { res.writeHead(400); res.end('{"error":"chatId and message required"}'); return; }
        inboxReplying.add(chatId);
        await client.sendMessage(chatId, message);
        storeMessage(chatId, "out", message, sender || "human");
        console.log(`[INBOX] ${chatId}: ${message.substring(0, 60)}`);
        // If requested, seed conversation so Claude has context when the client replies
        if (addToContext) {
          const existing = conversations.get(chatId) || [];
          existing.push({ role: "assistant", content: message });
          conversations.set(chatId, existing);
        }
        setTimeout(() => inboxReplying.delete(chatId), 10000);
        res.writeHead(200); res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(500); res.end('{"error":"' + e.message + '"}');
      }
    });
  } else if (req.method === "POST" && req.url === "/test-sticker") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", async () => {
      try {
        const { chatId } = JSON.parse(body);
        if (!chatId) { res.writeHead(400); res.end('{"error":"chatId required"}'); return; }
        const fsSync = await import("fs");
        const { fileURLToPath } = await import("url");
        const pathMod = await import("path");
        const stickerPath = pathMod.join(pathMod.dirname(fileURLToPath(import.meta.url)), "sticker.png");
        const stickerData = fsSync.readFileSync(stickerPath);
        const { MessageMedia } = pkg;
        const media = new MessageMedia("image/png", stickerData.toString("base64"), "sticker.png");
        await client.sendMessage(chatId, media, { sendMediaAsSticker: true, stickerAuthor: "Distrialma", stickerName: "Alma" });
        console.log(`[TEST] Sticker sent to ${chatId}`);
        res.writeHead(200); res.end('{"ok":true,"message":"sticker sent"}');
      } catch (e) {
        console.error("Test sticker error:", e.message);
        res.writeHead(500); res.end('{"error":"' + e.message + '"}');
      }
    });
  } else {
    res.writeHead(404); res.end("not found");
  }
});
httpServer.on("error", (e) => console.error("Bot HTTP server error:", e.message));
httpServer.listen(3099, "127.0.0.1", () => console.log("Bot HTTP server on :3099"));

console.log("Iniciando bot de Distrialma...");
client.initialize();
