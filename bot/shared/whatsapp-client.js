import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";

import path from "path";
import { fileURLToPath } from "url";

const BOT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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

  return {
    client,
    getStatus: () => ({ status: botStatus, qrUrl: latestQR ? `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(latestQR)}` : null, needsQR: botStatus === "esperando_qr", bot: name.toLowerCase() }),
  };
}

export { pkg };
