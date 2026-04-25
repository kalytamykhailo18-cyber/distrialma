// Skynet — Internal management bot for Distrialma
// Send-only: margin alerts, cierres, stock alerts, recibos
// Does NOT respond to incoming messages

import { createWhatsAppClient } from "../shared/whatsapp-client.js";
import { createHttpServer } from "../shared/http-server.js";

const PORT = 3098;

const { client, getStatus } = createWhatsAppClient({
  sessionPath: "./session-skynet",
  name: "SKYNET",
});

// Ignore all incoming messages
client.on("message", () => {});

createHttpServer({ client, getStatus, port: PORT, name: "SKYNET" });

console.log("[SKYNET] Iniciando...");
client.initialize();
