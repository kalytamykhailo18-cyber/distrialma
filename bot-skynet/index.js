// Skynet — Internal management bot for Distrialma
// Runs on a separate WhatsApp number (eSIM)
// Only sends messages, does not respond to incoming

import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import http from "http";

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "./session" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    executablePath: "/root/.cache/puppeteer/chrome/linux-146.0.7680.153/chrome-linux64/chrome",
    protocolTimeout: 120000,
  },
});

let latestQR = null;
let botStatus = "iniciando";

client.on("qr", (qr) => {
  console.log("[SKYNET] QR generado — escanear desde la eSIM");
  latestQR = qr;
  botStatus = "esperando_qr";
});

client.on("ready", () => {
  console.log("[SKYNET] Conectado");
  latestQR = null;
  botStatus = "conectado";
});

client.on("authenticated", () => {
  console.log("[SKYNET] Autenticado");
  latestQR = null;
  botStatus = "autenticado";
});

client.on("auth_failure", (msg) => {
  console.error("[SKYNET] Auth failure:", msg);
  botStatus = "error_auth";
});

client.on("disconnected", (reason) => {
  console.log("[SKYNET] Desconectado:", reason);
  botStatus = "desconectado";
  setTimeout(() => process.exit(1), 10000);
});

// Ignore all incoming messages — Skynet only sends
client.on("message", () => {});

function toWaChatId(phone) {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

// HTTP server
const httpServer = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/status") {
    const qrUrl = latestQR ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(latestQR)}` : null;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: botStatus, qrUrl, needsQR: botStatus === "esperando_qr", bot: "skynet" }));
    return;
  }

  if (req.method === "POST" && req.url === "/send") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", async () => {
      try {
        const { chatId, phone, message, mediaUrl, mediaCaption } = JSON.parse(body);
        const target = chatId || (phone ? toWaChatId(phone) : null);
        if (!target || (!message && !mediaUrl)) {
          res.writeHead(400);
          res.end('{"error":"chatId/phone and message/mediaUrl required"}');
          return;
        }

        if (mediaUrl) {
          const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
          await client.sendMessage(target, media, { caption: mediaCaption || message || "" });
        } else {
          await client.sendMessage(target, message);
        }

        console.log(`[SKYNET] Sent to ${target}: ${(message || mediaCaption || "").substring(0, 60)}`);
        res.writeHead(200);
        res.end('{"ok":true}');
      } catch (e) {
        console.error("[SKYNET] Send error:", e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end("not found");
});

httpServer.on("error", (e) => console.error("[SKYNET] HTTP error:", e.message));
httpServer.listen(3098, "127.0.0.1", () => console.log("[SKYNET] HTTP server on :3098"));

console.log("[SKYNET] Iniciando...");
client.initialize();
