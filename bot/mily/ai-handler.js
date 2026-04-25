// Mily AI Handler — Claude conversation logic, tools, system prompt
import Anthropic from "@anthropic-ai/sdk";
import pkg from "whatsapp-web.js";
import fs from "fs";
import { prisma, formatPrice } from "../shared/utils.js";
import { searchProducts, searchByBrand, searchCombos, findClientByPhone, registerClient, generatePriceListPDF } from "../shared/products.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Soy Mily, asistente virtual de Distrialma (mayorista alimentos, Merlo, Buenos Aires). WhatsApp, español argentino, breve (1-3 oraciones), texto plano sin markdown. Personalidad amable y servicial, trato cercano.

IDENTIDAD: Me llamo Mily. Si me preguntan quien soy digo "Soy Mily, la asistente virtual de Distrialma". No digo que soy IA ni robot.
PRODUCTOS: Usa search_products. Mostra precio Mayorista + Caja Cerrada si hay. Precios con IVA. "Stock sujeto a disponibilidad." NO mostrar cantidad de stock exacta. Link: distrialma.com.ar/productos/{sku}
COMBOS: Usa search_combos.
MARCA: Incluir link de marca.
LISTA PRECIOS: Preguntar rubro/marca primero, luego send_price_list con filtro. Nunca completa.
PEDIDOS: Hacer en distrialma.com.ar. No dar telefono.
SALDO: Si registrado, dar saldo. Detalle en distrialma.com.ar/mis-pedidos.
PAGOS/ALIAS/TRANSFERENCIA: NO dar el alias bancario. Decir "el alias para transferencia te lo indican en el comercio a la hora de abonar."
NO SABE: "Un asesor te contacta." No inventar.
RECLAMOS: "Tomamos nota, nuestra encargada te contacta." Se deriva automatico.
PERSONA: "Te paso con un asesor."
NO REGISTRADO: Pedir datos, usar register_client (minimo nombre+telefono).
STICKER: send_sticker al cerrar bien una conversacion.
PRIVACIDAD: No dar datos de otros clientes.

Horarios: Minorista Dom-Jue 7-22:30, Vie-Sab 8-23:30. Mayorista Merlo Lun-Sab 8-18. Pontevedra Lun-Sab 9-17. Web 24hs. PedidosYa disponible.`;

export const NEW_CLIENT_MESSAGE = `Hola! Gracias por escribirnos.

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

const TOOLS = [
  { name: "search_products", description: "Busca productos en la base real de Distrialma por nombre. Devuelve productos con sus precios (Mayorista y Caja Cerrada), stock disponible, marca, rubro y link directo.", input_schema: { type: "object", properties: { query: { type: "string", description: "Nombre o palabras clave del producto" } }, required: ["query"] } },
  { name: "search_by_brand", description: "Busca productos de una marca específica. Devuelve el link a la página de la marca y los productos.", input_schema: { type: "object", properties: { brand: { type: "string", description: "Nombre de la marca" }, product_keywords: { type: "string", description: "Palabras opcionales para filtrar" } }, required: ["brand"] } },
  { name: "search_combos", description: "Busca combos/promociones disponibles en Distrialma.", input_schema: { type: "object", properties: { query: { type: "string", description: "Palabras clave del combo" } }, required: ["query"] } },
  { name: "send_price_list", description: "Genera y envia una lista de precios en PDF al cliente por WhatsApp, filtrada por rubro o marca. SIEMPRE usar con filtro.", input_schema: { type: "object", properties: { filter: { type: "string", description: "Filtro OBLIGATORIO por rubro o marca" } }, required: ["filter"] } },
  { name: "send_sticker", description: "Envia el sticker de Alma al cliente. Solo al final de una buena conversacion.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "register_client", description: "Registra un cliente nuevo. Necesitás al menos nombre completo y teléfono.", input_schema: { type: "object", properties: { nombre: { type: "string" }, direccion: { type: "string" }, telefono: { type: "string" }, cuit: { type: "string" } }, required: ["nombre", "telefono"] } },
];

export async function callClaude(chatId, userMessage, clientInfo, phoneNumber, { conversations, client, storeMessage }) {
  const history = conversations.get(chatId) || [];
  const historyLenBefore = history.length;
  history.push({ role: "user", content: userMessage });
  if (history.length > 10) history.splice(0, history.length - 10);

  console.log(`[CLAUDE] ${chatId}: msg="${userMessage.substring(0, 60)}" history=${history.length} client=${clientInfo?.nombre || "anon"}`);

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const diasSemana = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const timeStr = `${diasSemana[now.getDay()]} ${now.getDate()} de ${meses[now.getMonth()]} de ${now.getFullYear()}, ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  let systemWithContext = SYSTEM_PROMPT + `\n\nFECHA Y HORA ACTUAL: ${timeStr}`;

  try {
    const recentDifusion = await prisma.difusion.findFirst({
      where: { estado: { in: ["completada", "enviando"] }, createdAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
      orderBy: { createdAt: "desc" },
    });
    if (recentDifusion) {
      systemWithContext += `\n\nDIFUSION RECIENTE: Hoy se envió un mensaje masivo a clientes: "${recentDifusion.mensaje.substring(0, 200)}". ${recentDifusion.imagenUrl ? "Incluía una imagen promocional." : ""} Si el cliente pregunta sobre esto, confirmá la promo y ofrecé ayuda.`;
    }
  } catch { /* ignore */ }

  if (clientInfo) {
    if (clientInfo.accounts) {
      systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE REGISTRADO QUE TIENE ${clientInfo.accounts.length} CUENTAS:`;
      for (const a of clientInfo.accounts) systemWithContext += `\n- ${a.nombre} (Cod: ${a.cod}): Saldo ${formatPrice(a.saldo)}`;
      systemWithContext += `\n- CUIT: ${clientInfo.cuit || "(no cargado)"}\nMostrá el saldo de todas las cuentas cuando pregunte.`;
    } else {
      systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE REGISTRADO:\n- Nombre: ${clientInfo.nombre}\n- CUIT: ${clientInfo.cuit || "(no cargado)"}\n- Saldo cuenta corriente: ${formatPrice(clientInfo.saldo)}`;
    }
  } else {
    systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE NO REGISTRADO.\nSu número de teléfono es: ${phoneNumber}\nYa le pedimos sus datos para registrarse. Si te los pasa, usá register_client. Usá el teléfono ${phoneNumber} como teléfono si no te da otro.`;
  }

  let iteration = 0;
  try {
    while (iteration < 5) {
      iteration++;
      console.log(`[CLAUDE] ${chatId}: API call iter=${iteration} msgs=${history.length}`);
      const response = await anthropic.messages.create({
        model: MODEL, max_tokens: 400,
        system: [{ type: "text", text: systemWithContext, cache_control: { type: "ephemeral" } }],
        tools: TOOLS, messages: history,
      });

      history.push({ role: "assistant", content: response.content });

      const toolUses = response.content.filter((c) => c.type === "tool_use");
      if (toolUses.length === 0) {
        const reply = response.content.filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
        conversations.set(chatId, history);
        return reply || "Disculpá, no pude responder. ¿Podés repetirme tu consulta?";
      }

      console.log(`[TOOL] ${chatId}: ${toolUses.map(t => t.name + "(" + JSON.stringify(t.input).substring(0, 60) + ")").join(", ")}`);
      const toolResults = [];
      for (const tu of toolUses) {
        let result;
        try {
          if (tu.name === "search_products") {
            const products = await searchProducts(tu.input.query);
            result = products.length === 0 ? { found: 0, message: "No se encontraron productos." } : {
              found: products.length,
              products: products.map((p) => ({ sku: p.sku, nombre: p.name, marca: p.marca, rubro: p.rubro, precio_mayorista: formatPrice(p.mayorista), precio_caja_cerrada: p.cajaCerrada > 0 ? formatPrice(p.cajaCerrada) : null, stock: p.stock, disponible: p.disponible, link: p.url })),
            };
          } else if (tu.name === "search_by_brand") {
            const data = await searchByBrand(tu.input.brand, tu.input.product_keywords || "");
            result = !data.brand ? { found: 0, message: "No se encontró esa marca." } : {
              brand: data.brand.nombre, brand_url: data.brand.url, found: data.products.length,
              products: data.products.map((p) => ({ nombre: p.name, precio_mayorista: formatPrice(p.mayorista), precio_caja_cerrada: p.cajaCerrada > 0 ? formatPrice(p.cajaCerrada) : null, stock: p.stock, disponible: p.disponible, link: p.url })),
            };
          } else if (tu.name === "search_combos") {
            const combos = await searchCombos(tu.input.query || "");
            result = combos.length === 0 ? { found: 0, message: "No hay combos disponibles." } : {
              found: combos.length,
              combos: combos.map((c) => ({ nombre: c.name, descripcion: c.description || "", precio: c.price ? formatPrice(Number(c.price)) : "Consultar", productos: c.items.map((i) => i.sku).join(", "), link: `https://distrialma.com.ar/combos/${c.id}` })),
            };
          } else if (tu.name === "send_price_list") {
            try {
              const pdfPath = await generatePriceListPDF(tu.input.filter || null);
              if (pdfPath) {
                const pdfData = fs.readFileSync(pdfPath);
                const { MessageMedia } = pkg;
                const media = new MessageMedia("application/pdf", pdfData.toString("base64"), "Lista-de-Precios-Distrialma.pdf");
                await client.sendMessage(chatId, media, { caption: "Aca tenes la lista de precios actualizada de Distrialma." });
                storeMessage(chatId, "out", "[PDF] Lista de precios enviada", "bot");
                result = { sent: true, message: "Lista de precios enviada como PDF" };
              } else {
                result = { sent: false, message: "No se encontraron productos para generar la lista" };
              }
            } catch (e) { result = { sent: false, error: e.message }; }
          } else if (tu.name === "send_sticker") {
            try {
              const { fileURLToPath } = await import("url");
              const path = await import("path");
              const stickerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "sticker.png");
              const stickerData = fs.readFileSync(stickerPath);
              const { MessageMedia } = pkg;
              const media = new MessageMedia("image/png", stickerData.toString("base64"), "sticker.png");
              await client.sendMessage(chatId, media, { sendMediaAsSticker: true, stickerAuthor: "Distrialma", stickerName: "Alma" });
              storeMessage(chatId, "out", "[Sticker] Alma", "bot");
              result = { sent: true };
            } catch (e) { result = { sent: false, error: e.message }; }
          } else if (tu.name === "register_client") {
            const reg = await registerClient({ nombre: tu.input.nombre, direccion: tu.input.direccion || "", telefono: tu.input.telefono, cuit: tu.input.cuit || "" });
            console.log(`[REGISTER] ${chatId}: registered ${reg.nombre} as client ${reg.cod}`);
            result = { success: true, clienteCod: reg.cod, nombre: reg.nombre, message: "Cliente registrado exitosamente." };
          } else {
            result = { error: "Herramienta desconocida" };
          }
        } catch (e) { result = { error: e.message }; }
        toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result) });
      }
      history.push({ role: "user", content: toolResults });
    }

    conversations.set(chatId, history);
    return "Disculpá, tuve un problema procesando tu consulta. ¿Podés intentar de nuevo?";
  } catch (err) {
    console.error(`[CLAUDE-ERR] ${chatId}: ${err.message} — rolling back history from ${history.length} to ${historyLenBefore}`);
    history.splice(historyLenBefore);
    conversations.set(chatId, history);
    throw err;
  }
}

export { findClientByPhone };
