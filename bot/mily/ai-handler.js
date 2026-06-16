// Mily AI Handler — Claude conversation logic, tools, system prompt
import Anthropic from "@anthropic-ai/sdk";
import pkg from "whatsapp-web.js";
import fs from "fs";
import { prisma, formatPrice } from "../shared/utils.js";
import { searchProducts, searchByBrand, searchCombos, findClientByPhone, registerClient, generatePriceListPDF, saveClientEmail } from "../shared/products.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `Soy Mily, asistente virtual de Distrialma (mayorista alimentos, Merlo, Buenos Aires). WhatsApp, español argentino, breve (1-3 oraciones), texto plano sin markdown. Personalidad amable y servicial, trato cercano.

IDENTIDAD: Me llamo Mily. Si me preguntan quien soy digo "Soy Mily, la asistente virtual de Distrialma". No digo que soy IA ni robot.
PRODUCTOS: Usa search_products. SIEMPRE mostrar TODOS los resultados que devuelve la herramienta, no omitir ninguno.
- Si el producto tiene stock (disponible=true): mostrar precio Mayorista + Caja Cerrada. "Stock sujeto a disponibilidad."
- Si el producto NO tiene stock (disponible=false): NO mostrar precio. Solo decir que lo trabajamos pero está sin stock. Ejemplo: "La Muzzarella Castelar la trabajamos pero está sin stock en este momento."
- NO repetir "sin stock" si ya se dijo antes en el mismo mensaje.
- NO mostrar cantidad de stock exacta. Link: distrialma.com.ar/productos/{sku}
COMBOS: Usa search_combos.
MARCA: Incluir link de marca.
LISTA PRECIOS: Preguntar rubro/marca primero, luego send_price_list con filtro. Nunca completa.
PEDIDOS: Si el cliente esta registrado, puede armar el pedido por chat. Usa search_products para buscar, add_to_cart para agregar, view_cart para mostrar, confirm_order para confirmar. Siempre mostrar el carrito actualizado despues de agregar. Antes de confirmar, mostrar resumen y preguntar en que sucursal va a retirar (Merlo o Pontevedra). Pasar sucursal y retiro=true en confirm_order.
ENTREGAS / ENVIOS A DOMICILIO: NO armar entregas por chat ni cotizar costo de envio. Los precios de la web y del chat son SIEMPRE retirando por sucursal. Si el cliente pide envio a domicilio, NO inventes precios ni decis que se puede: derivalo a la distribuidora al +54 9 11 5413-7677 (https://wa.me/5491154137677) para que coordine pedido minimo, zona y costo de envio con un asesor. Decirle textual: "Para entregas a domicilio coordinas directo con la distribuidora al +54 9 11 5413-7677, ahi te pasan pedido minimo y costo de envio segun la zona. Los precios que ves son retirando por sucursal."
Si no esta registrado, decirle que haga el pedido en distrialma.com.ar.
SALDO: Si registrado, dar saldo. Detalle en distrialma.com.ar/mis-pedidos.
PAGOS/ALIAS/TRANSFERENCIA: NO dar el alias bancario. Decir "el alias para transferencia te lo indican en el comercio a la hora de abonar."
NO SABE: "Un asesor te contacta." No inventar.
RECLAMOS: "Tomamos nota, nuestra encargada te contacta." Se deriva automatico.
PERSONA: "Te paso con un asesor."
NO REGISTRADO: Pedir nombre completo, telefono, direccion y CUIT/CUIL/DNI ANTES de registrar. NUNCA registrar si falta el CUIT, CUIL o DNI — es OBLIGATORIO para que puedan entrar a la web después. Tambien podes preguntar el email de forma opcional (no obligatorio) para mandarle ofertas. Despues de registrar, las credenciales se envian automaticamente.
EMAIL CLIENTES REGISTRADOS: Si el cliente esta registrado y NO tiene email cargado (clientInfo.email vacio), podes pedirselo amablemente al final de la conversacion: "¿Me querés dejar un email para que te avise cuando lleguen promos? Es opcional." Si te lo pasa, usar save_client_email. Solo pedirlo 1 vez por conversacion y no insistir si no quiere.
STICKER: send_sticker al cerrar bien una conversacion.
COMUNIDAD: Al cerrar una buena conversacion (despues del sticker o la despedida), invitar al cliente a unirse a la comunidad de WhatsApp: "Unite a nuestra comunidad para enterarte de cambios de precios y novedades: https://chat.whatsapp.com/LpfhYKk33eIFAdeshNWAYI". Solo invitar 1 vez por conversacion, no repetir si ya lo invitaste.
PRIVACIDAD: No dar datos de otros clientes.

Horarios y direcciones (SIEMPRE mencionar los 3 locales cuando pregunten por horarios):
1. Minorista Merlo — Calle Real 435 — Lun-Dom 7 a 22:30
2. Mayorista Merlo — Av. Calle Real 387 — Lun-Sab 8 a 18 (NO cierra a las 14, cierra a las 18)
3. Mayorista Pontevedra — Av. Patricios 7399 esquina (frente a la plaza de Barrio Rivadavia) — Lun-Sab 9 a 17
Web: 24hs. PedidosYa disponible.
DOMINGOS: Solo abre el local minorista de Calle Real 435. Los mayoristas NO abren los domingos.
IMPORTANTE: NUNCA decir que cerramos a las 14. El mayorista cierra a las 18. NUNCA inventar direcciones. Si el cliente dice que viene en camino, decirle que lo esperamos.
DIRECCIONES ALTERNATIVAS: Si el cliente pregunta por barrios o calles cercanas a alguno de los locales, NO decir que no tenemos local ahí. Responder con el local más cercano. La sucursal de Pontevedra (Av. Patricios 7399, esquina, frente a la plaza de Barrio Rivadavia) está en Barrio Rivadavia. Las sucursales de Merlo (Calle Real 435 y Av. Calle Real 387) están en el centro de Merlo. Siempre ofrecer las 3 direcciones reales y NUNCA decir "no tenemos sucursal" en ningún barrio o zona — siempre ofrecer la más cercana.`;

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
  { name: "register_client", description: "Registra un cliente nuevo. Necesitas TODOS los datos: nombre completo, telefono, direccion y CUIT/CUIL/DNI. NUNCA registrar sin CUIT/CUIL/DNI. El email es opcional pero pedilo amablemente.", input_schema: { type: "object", properties: { nombre: { type: "string", description: "Nombre completo" }, direccion: { type: "string", description: "Direccion del local o domicilio" }, telefono: { type: "string", description: "Numero de telefono" }, cuit: { type: "string", description: "CUIT, CUIL o DNI (OBLIGATORIO)" }, email: { type: "string", description: "Email opcional para recibir ofertas" } }, required: ["nombre", "telefono", "direccion", "cuit"] } },
  { name: "save_client_email", description: "Guarda el email de un cliente que ya esta registrado. Usalo si el cliente te lo pasa espontaneamente o si se lo pediste antes.", input_schema: { type: "object", properties: { email: { type: "string", description: "Email valido del cliente" } }, required: ["email"] } },
  { name: "add_to_cart", description: "Agrega un producto al carrito del cliente. Necesitas el SKU del producto (obtenido de search_products) y la cantidad. Solo para clientes REGISTRADOS.", input_schema: { type: "object", properties: { sku: { type: "string", description: "SKU del producto" }, nombre: { type: "string", description: "Nombre del producto" }, cantidad: { type: "number", description: "Cantidad a agregar" }, precio: { type: "number", description: "Precio unitario mayorista" } }, required: ["sku", "nombre", "cantidad", "precio"] } },
  { name: "view_cart", description: "Muestra el carrito actual del cliente con todos los productos, cantidades y total.", input_schema: { type: "object", properties: {}, required: [] } },
  { name: "confirm_order", description: "Confirma el pedido del carrito. SOLO para retiro en sucursal. Antes de confirmar preguntar en que sucursal retira (Merlo o Pontevedra). Si es Pontevedra avisa al encargado para que lo prepare. Para entregas a domicilio NO usar esta herramienta — derivar al +54 9 11 5413-7677.", input_schema: { type: "object", properties: { notas: { type: "string", description: "Notas opcionales del pedido" }, sucursal: { type: "string", enum: ["merlo", "pontevedra"], description: "Sucursal donde retira" }, retiro: { type: "boolean", description: "Siempre true. Las entregas a domicilio se derivan al numero de la distribuidora." } }, required: ["sucursal", "retiro"] } },
];

// In-memory cart per chat (expires after 24h)
const carts = new Map();
const CART_EXPIRY = 24 * 60 * 60 * 1000;

function getCart(chatId) {
  const cart = carts.get(chatId);
  if (!cart) return [];
  if (Date.now() - cart.updatedAt > CART_EXPIRY) { carts.delete(chatId); return []; }
  return cart.items;
}

function setCart(chatId, items) {
  carts.set(chatId, { items, updatedAt: Date.now() });
}

function clearCart(chatId) {
  carts.delete(chatId);
}

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
      systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE REGISTRADO:\n- Nombre: ${clientInfo.nombre}\n- CUIT: ${clientInfo.cuit || "(no cargado)"}\n- Saldo cuenta corriente: ${formatPrice(clientInfo.saldo)}\n- Email: ${clientInfo.email || "(SIN EMAIL — podes pedirselo al final de la conversacion)"}`;
    }
  } else {
    systemWithContext += `\n\nESTÁS HABLANDO CON UN CLIENTE NO REGISTRADO.\nSu número de teléfono es: ${phoneNumber}\nYa le pedimos sus datos para registrarse. Si te los pasa, usá register_client. Usá el teléfono ${phoneNumber} como teléfono si no te da otro.`;
  }

  // Inject cart state
  const currentCart = getCart(chatId);
  if (currentCart.length > 0) {
    const cartTotal = currentCart.reduce((s, i) => s + i.precio * i.cantidad, 0);
    systemWithContext += `\n\nCARRITO ACTUAL (${currentCart.length} productos, total ${formatPrice(cartTotal)}):\n` + currentCart.map((i) => `- ${i.cantidad}x ${i.nombre} (${formatPrice(i.precio)}/u) = ${formatPrice(i.precio * i.cantidad)}`).join("\n");
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
              products: products.map((p) => ({
                sku: p.sku, nombre: p.name, marca: p.marca, rubro: p.rubro,
                ...(p.disponible ? { precio_mayorista: formatPrice(p.mayorista), precio_caja_cerrada: p.cajaCerrada > 0 ? formatPrice(p.cajaCerrada) : null } : {}),
                disponible: p.disponible,
                link: p.url,
              })),
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
              const stickerPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "sticker.png");
              const stickerData = fs.readFileSync(stickerPath);
              const { MessageMedia } = pkg;
              const media = new MessageMedia("image/png", stickerData.toString("base64"), "sticker.png");
              await client.sendMessage(chatId, media, { sendMediaAsSticker: true, stickerAuthor: "Distrialma", stickerName: "Alma" });
              storeMessage(chatId, "out", "[Sticker] Alma", "bot");
              result = { sent: true };
            } catch (e) { result = { sent: false, error: e.message }; }
          } else if (tu.name === "register_client") {
            // Use WhatsApp phone number, formatted for Argentina (11-XXXX-XXXX)
            let telFormatted = phoneNumber || tu.input.telefono || "";
            if (telFormatted.startsWith("549")) telFormatted = telFormatted.slice(3); // remove country code
            if (telFormatted.startsWith("54")) telFormatted = telFormatted.slice(2);
            if (telFormatted.length === 10) telFormatted = telFormatted.slice(0, 2) + "-" + telFormatted.slice(2, 6) + "-" + telFormatted.slice(6);
            const reg = await registerClient({ nombre: tu.input.nombre, direccion: tu.input.direccion || "", telefono: telFormatted, cuit: tu.input.cuit || "", email: tu.input.email || "" });
            const cuitUser = (tu.input.cuit || "").replace(/[^0-9]/g, "");
            const usuario = cuitUser || reg.cod;
            if (reg.alreadyExists) {
              console.log(`[REGISTER] ${chatId}: dedup hit, existing client ${reg.cod} (${reg.nombre})`);
              await client.sendMessage(chatId, `Ya tenes una cuenta con nosotros, ${reg.nombre}! Podes entrar a:\n\nwww.distrialma.com.ar\nUsuario: ${usuario}\nClave: ALMA2026\n\nSi no recordas la clave o necesitas ayuda con tu cuenta, un asesor te contacta.`);
              storeMessage(chatId, "out", `[Cliente ya existia] ${reg.cod} ${reg.nombre}`, "bot");
              result = { alreadyExists: true, clienteCod: reg.cod, nombre: reg.nombre, message: "El cliente ya estaba registrado, se le indicaron las credenciales de su cuenta existente. No volver a pedir datos." };
            } else {
              console.log(`[REGISTER] ${chatId}: registered ${reg.nombre} as client ${reg.cod}`);
              await client.sendMessage(chatId, `Ya estas registrado! Podes entrar a nuestra web:\n\nwww.distrialma.com.ar\nUsuario: ${usuario}\nClave: ALMA2026\n\nAhi ves todos los productos con precios y podes hacer pedidos.`);
              storeMessage(chatId, "out", `[Credenciales enviadas] Usuario: ${usuario}`, "bot");
              result = { success: true, clienteCod: reg.cod, nombre: reg.nombre, message: "Cliente registrado y credenciales enviadas." };
            }
          } else if (tu.name === "save_client_email") {
            if (!clientInfo) { result = { error: "Cliente no registrado." }; }
            else {
              const r = await saveClientEmail(clientInfo.cod, tu.input.email || "");
              if (r.ok) console.log(`[EMAIL] ${chatId}: saved ${r.email} for client ${clientInfo.cod}`);
              result = r.ok ? { success: true, message: "Email guardado correctamente." } : { error: r.error };
            }
          } else if (tu.name === "add_to_cart") {
            if (!clientInfo) { result = { error: "Cliente no registrado. No puede armar pedido por chat." }; }
            else {
              const cart = getCart(chatId);
              const existing = cart.find((i) => i.sku === tu.input.sku);
              if (existing) {
                existing.cantidad += tu.input.cantidad;
              } else {
                cart.push({ sku: tu.input.sku, nombre: tu.input.nombre, cantidad: tu.input.cantidad, precio: tu.input.precio });
              }
              setCart(chatId, cart);
              const total = cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
              result = { ok: true, items: cart.length, total: formatPrice(total), carrito: cart.map((i) => `${i.cantidad}x ${i.nombre} = ${formatPrice(i.precio * i.cantidad)}`).join("\n") };
            }
          } else if (tu.name === "view_cart") {
            const cart = getCart(chatId);
            if (cart.length === 0) { result = { empty: true, message: "El carrito esta vacio." }; }
            else {
              const total = cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
              result = { items: cart.length, total: formatPrice(total), carrito: cart.map((i) => `${i.cantidad}x ${i.nombre} (${formatPrice(i.precio)}/u) = ${formatPrice(i.precio * i.cantidad)}`).join("\n") };
            }
          } else if (tu.name === "confirm_order") {
            if (!clientInfo) { result = { error: "Cliente no registrado." }; }
            else {
              const cart = getCart(chatId);
              if (cart.length === 0) { result = { error: "Carrito vacio. Agrega productos primero." }; }
              else {
                try {
                  const total = cart.reduce((s, i) => s + i.precio * i.cantidad, 0);
                  const clienteCod = clientInfo.accounts ? clientInfo.accounts[0].cod : clientInfo.cod;
                  const clienteNombre = clientInfo.accounts ? clientInfo.accounts[0].nombre : clientInfo.nombre;
                  const sucursal = (tu.input.sucursal || "merlo").toLowerCase();
                  const retiro = tu.input.retiro !== false;
                  const sucLabel = sucursal === "pontevedra" ? "PONTEVEDRA" : "MERLO";
                  const modoLabel = retiro ? `RETIRA en ${sucLabel}` : "ENVÍO";
                  // Save order to PostgreSQL
                  const now2 = new Date();
                  const fechora = now2.getFullYear().toString() + String(now2.getMonth()+1).padStart(2,"0") + String(now2.getDate()).padStart(2,"0") + String(now2.getHours()).padStart(2,"0") + String(now2.getMinutes()).padStart(2,"0") + String(now2.getSeconds()).padStart(2,"0");
                  const boleta = "WA" + fechora.slice(4);
                  await prisma.archivedOrder.create({
                    data: {
                      boleta,
                      nroped: boleta,
                      fechora,
                      clienteCod: clienteCod.padStart(7, " "),
                      clienteName: clienteNombre,
                      totalCant: cart.reduce((s, i) => s + i.cantidad, 0),
                      total,
                      notas: (`[${modoLabel}] ` + (tu.input.notas || "Pedido por WhatsApp")).substring(0, 200),
                      items: { create: cart.map((i) => ({ sku: i.sku.padStart(7, " "), productName: i.nombre, cant: i.cantidad, precio: i.precio, impo: i.precio * i.cantidad, listaPrecio: 2 })) },
                    },
                  });
                  // Notify admin via WhatsApp
                  const gastonPhone = process.env.GASTON_PHONE || "5491122254949";
                  const pontevedraPhone = process.env.PONTEVEDRA_PHONE || gastonPhone;
                  const orderMsg = `NUEVO PEDIDO WhatsApp — ${modoLabel}\n\nCliente: ${clienteNombre}\n${cart.map((i) => `${i.cantidad}x ${i.nombre} = ${formatPrice(i.precio * i.cantidad)}`).join("\n")}\n\nTotal: ${formatPrice(total)}`;
                  await fetch("http://127.0.0.1:3099/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: gastonPhone + "@c.us", message: orderMsg }) }).catch(() => {});
                  if (sucursal === "pontevedra" && retiro) {
                    const ponteMsg = `PEDIDO PARA PREPARAR — PONTEVEDRA\n\nCliente: ${clienteNombre}\n${cart.map((i) => `${i.cantidad}x ${i.nombre}`).join("\n")}\n\nTotal: ${formatPrice(total)}\n\nEl cliente va a retirar.`;
                    await fetch("http://127.0.0.1:3099/send", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chatId: pontevedraPhone + "@c.us", message: ponteMsg }) }).catch(() => {});
                  }
                  clearCart(chatId);
                  result = { success: true, total: formatPrice(total), items: cart.length, message: "Pedido confirmado!" };
                  console.log(`[ORDER] ${chatId}: WhatsApp order ${cart.length} items, total ${total}`);
                } catch (e) { result = { error: "Error al procesar pedido: " + e.message }; }
              }
            }
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
