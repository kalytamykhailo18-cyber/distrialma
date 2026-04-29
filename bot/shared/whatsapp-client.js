import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";

import path from "path";
import { fileURLToPath } from "url";

const BOT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function sendRestartAlert(botName, reason) {
  try {
    const { Resend } = await import("resend");
    const key = process.env.RESEND_API_KEY || "";
    const to = process.env.BOT_ALERT_EMAIL || "despensaalma2020@gmail.com";
    if (!key) return;
    const resend = new Resend(key);
    await resend.emails.send({
      from: process.env.RESEND_FROM || "Administracion <no-responder@alertrasadmin.com>",
      to,
      subject: `${botName} se reinicio automaticamente`,
      text: `${botName} se reinicio por heartbeat fallido.\n\nMotivo: ${reason}\nFecha: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}\n\nEl bot se reconecta solo en unos segundos.`,
    });
  } catch {}
}

export function createWhatsAppClient({ sessionPath, name, onDisconnect }) {
  const absSessionPath = path.isAbsolute(sessionPath) ? sessionPath : path.join(BOT_ROOT, sessionPath);
  const client = new Client({
    authStrategy: new LocalAuth({ dataPath: absSessionPath }),
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
    console.log(`\n========== [${name}] ESCANEAR QR ==========\n`);
    qrcode.generate(qr, { small: true });
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(qr)}`;
    console.log(`\nQR como imagen: ${qrUrl}\n`);
    latestQR = qr;
    botStatus = "esperando_qr";
  });

  client.on("ready", () => {
    console.log(`✓ [${name}] Conectado a WhatsApp`);
    latestQR = null;
    botStatus = "conectado";
  });

  client.on("authenticated", () => {
    console.log(`✓ [${name}] Autenticado`);
    latestQR = null;
    botStatus = "autenticado";
  });

  client.on("auth_failure", (msg) => {
    console.error(`✗ [${name}] Auth failure:`, msg);
    botStatus = "error_auth";
  });

  client.on("disconnected", async (reason) => {
    console.log(`[${name}] Desconectado:`, reason);
    botStatus = "desconectado";
    if (onDisconnect) {
      try { await onDisconnect(reason); } catch {}
    }
    console.log(`[${name}] Reiniciando en 10 segundos...`);
    setTimeout(() => process.exit(1), 10000);
  });

  // Heartbeat: check every 5 minutes if WhatsApp is still alive
  // If the session silently dies (no "disconnected" event), force restart
  let lastPong = Date.now();
  const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5 min
  const HEARTBEAT_TIMEOUT = 2 * 60 * 1000;  // 2 min grace

  setInterval(async () => {
    if (botStatus !== "conectado" && botStatus !== "autenticado") return;
    try {
      const state = await client.getState();
      if (state === "CONNECTED") {
        lastPong = Date.now();
      } else {
        console.log(`[${name}] Heartbeat: state=${state}, restarting...`);
        sendRestartAlert(name, `state=${state}`);
        setTimeout(() => process.exit(1), 2000);
        return;
      }
    } catch (err) {
      console.log(`[${name}] Heartbeat failed: ${err.message}`);
      if (Date.now() - lastPong > HEARTBEAT_TIMEOUT) {
        console.log(`[${name}] No heartbeat for ${Math.round((Date.now() - lastPong) / 1000)}s, restarting...`);
        sendRestartAlert(name, err.message);
        setTimeout(() => process.exit(1), 2000);
        return;
      }
    }
  }, HEARTBEAT_INTERVAL);

  return {
    client,
    getStatus: () => ({ status: botStatus, qrUrl: latestQR ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(latestQR)}` : null, needsQR: botStatus === "esperando_qr", bot: name.toLowerCase() }),
  };
}

export { pkg };
