import http from "http";
import { pkg } from "./whatsapp-client.js";
import { storeMessage } from "./utils.js";

export function createHttpServer({ client, getStatus, port, name, onSend }) {
  const server = http.createServer(async (req, res) => {
    if (req.method === "GET" && req.url === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getStatus()));
      return;
    }

    if (req.method === "POST" && req.url === "/send") {
      let body = "";
      req.on("data", (c) => body += c);
      req.on("end", async () => {
        try {
          const data = JSON.parse(body);
          const { chatId, phone, message, mediaUrl, mediaCaption } = data;
          const target = chatId || (phone ? phone.replace(/\D/g, "").replace(/^0/, "").replace(/^54(?!9)/, "549") + "@c.us" : null);
          if (!target || (!message && !mediaUrl)) {
            res.writeHead(400);
            res.end('{"error":"chatId/phone and message/mediaUrl required"}');
            return;
          }

          if (mediaUrl) {
            const { MessageMedia } = pkg;
            const media = await MessageMedia.fromUrl(mediaUrl, { unsafeMime: true });
            await client.sendMessage(target, media, { caption: mediaCaption || message || "" });
          } else {
            await client.sendMessage(target, message);
          }

          const logMsg = mediaCaption || message || "";
          storeMessage(target, "out", logMsg, data.sender || name.toLowerCase());
          console.log(`[${name}] Sent to ${target}: ${logMsg.substring(0, 60)}`);

          // Hook for extra logic (e.g. Mily conversation context)
          if (onSend) onSend(data, target);

          res.writeHead(200);
          res.end('{"ok":true}');
        } catch (e) {
          res.writeHead(500);
          res.end('{"error":"' + e.message + '"}');
        }
      });
      return;
    }

    res.writeHead(404);
    res.end("not found");
  });

  server.on("error", (e) => console.error(`[${name}] HTTP error:`, e.message));
  server.listen(port, "127.0.0.1", () => console.log(`[${name}] HTTP server on :${port}`));
  return server;
}
