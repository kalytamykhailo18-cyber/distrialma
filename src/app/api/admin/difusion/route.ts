import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

// GET: list campaigns
export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const difusiones = await prisma.difusion.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ difusiones });
}

// POST: create and optionally send campaign
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { mensaje, imagenUrl, filtro, programada, enviarAhora } = await req.json();

    if (!mensaje?.trim()) {
      return NextResponse.json({ error: "Mensaje requerido" }, { status: 400 });
    }

    const userName = (session.user as { name?: string })?.name || "admin";

    // Get recipients based on filter
    const pool = await getPool();
    const dbClientes = getDbName("clientes");

    const DAY_NAMES = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO", "DOMINGO"];

    let whereClause = "";
    if (filtro === "todos") {
      whereClause = "";
    } else if (filtro === "reparto") {
      // Only clients with day-based zones
      const zonesResult = await pool.request().query(`
        SELECT Cod FROM [${dbClientes}].dbo.Zonas
        WHERE ${DAY_NAMES.map((d) => `LTRIM(RTRIM([Desc])) LIKE '%${d}%'`).join(" OR ")}
      `);
      const zoneCods = zonesResult.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
      whereClause = zoneCods ? `AND c.Zona IN (${zoneCods})` : "AND 1=0";
    } else if (filtro?.startsWith("zona:")) {
      const zonaName = filtro.slice(5);
      const zonesResult = await pool.request().query(`
        SELECT Cod FROM [${dbClientes}].dbo.Zonas
        WHERE LTRIM(RTRIM([Desc])) LIKE '%${zonaName}%'
      `);
      const zoneCods = zonesResult.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
      whereClause = zoneCods ? `AND c.Zona IN (${zoneCods})` : "AND 1=0";
    }

    const clients = await pool.request().query(`
      SELECT LTRIM(RTRIM(c.Cod)) AS cod, LTRIM(RTRIM(c.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono
      FROM [${dbClientes}].dbo.Clientes c
      WHERE (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
        AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
        ${whereClause}
    `);

    const totalRecipients = clients.recordset.length;

    // Create campaign
    const difusion = await prisma.difusion.create({
      data: {
        mensaje,
        imagenUrl: imagenUrl || null,
        filtro: filtro || "todos",
        programada: programada ? new Date(programada) : null,
        estado: enviarAhora ? "enviando" : "pendiente",
        total: totalRecipients,
        creadoPor: userName,
      },
    });

    // Send immediately if requested
    if (enviarAhora) {
      // Run in background
      (async () => {
        let enviados = 0;
        let fallidos = 0;

        // Check 24h duplicate
        const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentLogs = await prisma.notificationLog.findMany({
          where: { tipo: "difusion", ok: true, createdAt: { gte: since24h } },
          select: { clientId: true },
        });
        const recentlySent = new Set(recentLogs.map((l) => l.clientId));

        for (const client of clients.recordset) {
          if (recentlySent.has(client.cod)) { fallidos++; continue; }

          const chatId = toWaChatId(client.telefono);
          if (!chatId) { fallidos++; continue; }

          // Personalize message
          const firstName = client.nombre.split(" ")[0];
          const body = mensaje.replace(/\{nombre\}/g, firstName).replace(/\{nombre_completo\}/g, client.nombre);

          try {
            const sendBody: Record<string, unknown> = { chatId, message: body };

            // Send image if provided
            if (imagenUrl) {
              sendBody.mediaUrl = imagenUrl;
              sendBody.mediaCaption = body;
            }

            const res = await fetch("http://127.0.0.1:3099/send", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(sendBody),
            });

            if (res.ok) {
              enviados++;
              await prisma.notificationLog.create({
                data: { clientId: client.cod, tipo: "difusion", mensaje: body, telefono: client.telefono, enviadoPor: userName, ok: true },
              });
            } else {
              fallidos++;
            }
          } catch {
            fallidos++;
          }

          // Rate limit: 5 seconds between messages
          await new Promise((r) => setTimeout(r, 5000));
        }

        // Update campaign
        await prisma.difusion.update({
          where: { id: difusion.id },
          data: { estado: "completada", enviados, fallidos },
        });
      })();
    }

    return NextResponse.json({
      ok: true,
      id: difusion.id,
      totalRecipients,
      estado: enviarAhora ? "enviando" : "pendiente",
    });
  } catch (error) {
    console.error("Difusion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
