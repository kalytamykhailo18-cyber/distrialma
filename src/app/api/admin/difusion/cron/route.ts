import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
const BATCH_SIZE = 10; // Process 10 recipients per cron tick (~50 seconds)

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

async function populateRecipients(difusionId: number, filtroRaw: string) {
  const pool = await getPool();
  const dbClientes = getDbName("clientes");
  const DAY_NAMES = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

  const soloMostrador = filtroRaw.includes("+mostrador");
  const filtro = filtroRaw.replace(" +mostrador", "");

  let whereClause = "";
  if (filtro === "todos") {
    whereClause = "";
  } else if (filtro === "reparto") {
    const zonesResult = await pool.request().query(`
      SELECT Cod FROM [${dbClientes}].dbo.Zonas
      WHERE ${DAY_NAMES.map((d) => `LTRIM(RTRIM([Desc])) LIKE '%${d}%'`).join(" OR ")}
    `);
    const zoneCods = zonesResult.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
    whereClause = zoneCods ? `AND c.Zona IN (${zoneCods})` : "AND 1=0";
  } else if (filtro.startsWith("zona:")) {
    const zonaName = filtro.slice(5).replace(/[^A-Za-z]/g, "");
    const zonesResult = await pool.request().query(`
      SELECT Cod FROM [${dbClientes}].dbo.Zonas
      WHERE LTRIM(RTRIM([Desc])) LIKE '%${zonaName}%'
    `);
    const zoneCods = zonesResult.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
    whereClause = zoneCods ? `AND c.Zona IN (${zoneCods})` : "AND 1=0";
  } else if (filtro.startsWith("rango:")) {
    const match = filtro.match(/rango:(\d+)-(\d+)/);
    if (match) {
      whereClause = `AND TRY_CAST(LTRIM(RTRIM(c.Cod)) AS INT) BETWEEN ${match[1]} AND ${match[2]}`;
    }
  }

  if (soloMostrador) {
    const repartoZones = await pool.request().query(`
      SELECT Cod FROM [${dbClientes}].dbo.Zonas
      WHERE ${DAY_NAMES.map((d) => `LTRIM(RTRIM([Desc])) LIKE '%${d}%'`).join(" OR ")}
    `);
    const repartoCods = repartoZones.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
    if (repartoCods) {
      whereClause += ` AND (c.Zona IS NULL OR LTRIM(RTRIM(c.Zona)) = '' OR c.Zona NOT IN (${repartoCods}))`;
    }
  }

  const clients = await pool.request().query(`
    SELECT LTRIM(RTRIM(c.Cod)) AS cod, LTRIM(RTRIM(c.Nombre)) AS nombre,
      LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono
    FROM [${dbClientes}].dbo.Clientes c
    WHERE (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
      AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
      ${whereClause}
  `);

  await prisma.difusionRecipient.createMany({
    data: clients.recordset.map((c: { cod: string; nombre: string; telefono: string }) => ({
      difusionId,
      clientId: c.cod,
      nombre: c.nombre,
      telefono: c.telefono,
      estado: "pendiente",
    })),
  });

  await prisma.difusion.update({
    where: { id: difusionId },
    data: { total: clients.recordset.length },
  });
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();

  // 1. Activate scheduled campaigns that are due
  const due = await prisma.difusion.findMany({
    where: { estado: "programada", programada: { lte: now } },
  });
  for (const d of due) {
    // Check if recipients were populated (legacy campaigns may not have them)
    const recipientCount = await prisma.difusionRecipient.count({ where: { difusionId: d.id } });
    if (recipientCount === 0) {
      await populateRecipients(d.id, d.filtro);
    }
    await prisma.difusion.update({
      where: { id: d.id },
      data: { estado: "enviando" },
    });
  }

  // 2. Find active campaigns (estado = "enviando")
  const active = await prisma.difusion.findMany({
    where: { estado: "enviando" },
  });

  console.log(`[DIFUSION-CRON] active campaigns: ${active.length}`);
  if (active.length === 0) {
    return NextResponse.json({ ok: true, processed: 0 });
  }

  // Bot health check — if bot is down, skip this tick entirely
  try {
    await fetch("http://127.0.0.1:3099/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chatId: "healthcheck", message: "" }),
    });
    console.log("[DIFUSION-CRON] bot health check passed");
  } catch (e) {
    console.log(`[DIFUSION-CRON] bot down: ${(e as Error).message}`);
    return NextResponse.json({ ok: true, processed: 0, botDown: true });
  }

  let totalProcessed = 0;

  for (const campaign of active) {
    // Get next batch of pending recipients
    const pending = await prisma.difusionRecipient.findMany({
      where: { difusionId: campaign.id, estado: "pendiente" },
      take: BATCH_SIZE,
      orderBy: { id: "asc" },
    });

    console.log(`[DIFUSION-CRON] campaign ${campaign.id}: ${pending.length} pending recipients`);
    if (pending.length === 0) {
      // All done — finalize campaign
      const counts = await prisma.difusionRecipient.groupBy({
        by: ["estado"],
        where: { difusionId: campaign.id },
        _count: true,
      });
      const enviados = counts.find((c) => c.estado === "enviado")?._count || 0;
      const fallidos = counts.filter((c) => c.estado !== "enviado" && c.estado !== "pendiente").reduce((s, c) => s + c._count, 0);
      await prisma.difusion.update({
        where: { id: campaign.id },
        data: { estado: "completada", enviados, fallidos },
      });
      continue;
    }

    // 24h dedup check
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLogs = await prisma.notificationLog.findMany({
      where: { tipo: "difusion", ok: true, createdAt: { gte: since24h } },
      select: { clientId: true },
    });
    const recentlySent = new Set(recentLogs.map((l) => l.clientId));

    let botFailed = false;

    for (const recipient of pending) {
      // If bot failed during this batch, stop — leave remaining as pendiente for next tick
      if (botFailed) break;

      // Dedup check
      if (recentlySent.has(recipient.clientId)) {
        await prisma.difusionRecipient.update({
          where: { id: recipient.id },
          data: { estado: "dedup", error: "Ya enviado en 24h" },
        });
        totalProcessed++;
        continue;
      }

      const chatId = toWaChatId(recipient.telefono);
      if (!chatId) {
        await prisma.difusionRecipient.update({
          where: { id: recipient.id },
          data: { estado: "fallido", error: "Telefono invalido" },
        });
        totalProcessed++;
        continue;
      }

      // Personalize
      const firstName = recipient.nombre.split(" ")[0];
      const body = campaign.mensaje
        .replace(/\{nombre\}/g, firstName)
        .replace(/\{nombre_completo\}/g, recipient.nombre);

      try {
        const sendBody: Record<string, unknown> = { chatId, message: body };
        if (campaign.imagenUrl) {
          sendBody.mediaUrl = campaign.imagenUrl;
          sendBody.mediaCaption = body;
        }

        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sendBody),
        });

        if (res.ok) {
          await prisma.difusionRecipient.update({
            where: { id: recipient.id },
            data: { estado: "enviado", sentAt: new Date() },
          });
          await prisma.notificationLog.create({
            data: { clientId: recipient.clientId, tipo: "difusion", mensaje: body, telefono: recipient.telefono, enviadoPor: campaign.creadoPor, ok: true },
          });
          recentlySent.add(recipient.clientId);
        } else {
          const errText = await res.text().catch(() => "");
          console.error(`[DIFUSION] Bot error for ${recipient.clientId}: ${res.status} ${errText.substring(0, 100)}`);
          if (res.status === 500 && errText.includes("getChat")) {
            // Bot alive but WhatsApp client not ready — stop batch, retry next tick
            botFailed = true;
            break;
          }
          // Other errors (invalid number, not on WhatsApp, etc.) — mark as failed, continue
          await prisma.difusionRecipient.update({
            where: { id: recipient.id },
            data: { estado: "fallido", error: `Bot ${res.status}: ${errText.substring(0, 150)}` },
          });
        }
      } catch (e) {
        // Bot unreachable — leave as pendiente, stop batch, retry next tick
        console.error(`[DIFUSION] Bot unreachable: ${(e as Error).message}`);
        botFailed = true;
        break;
      }

      totalProcessed++;

      // Rate limit: 5 seconds between messages
      await new Promise((r) => setTimeout(r, 5000));
    }

    // Update campaign progress
    const enviadosNow = await prisma.difusionRecipient.count({
      where: { difusionId: campaign.id, estado: "enviado" },
    });
    const fallidosNow = await prisma.difusionRecipient.count({
      where: { difusionId: campaign.id, estado: { in: ["fallido", "dedup"] } },
    });
    await prisma.difusion.update({
      where: { id: campaign.id },
      data: { enviados: enviadosNow, fallidos: fallidosNow },
    });
  }

  return NextResponse.json({ ok: true, processed: totalProcessed });
}
