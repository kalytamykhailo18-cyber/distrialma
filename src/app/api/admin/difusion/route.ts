import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

// GET: list campaigns or fetch failed recipients
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const fallidosId = req.nextUrl.searchParams.get("fallidos");
  if (fallidosId) {
    const recipients = await prisma.difusionRecipient.findMany({
      where: { difusionId: parseInt(fallidosId), estado: "fallido" },
      select: { clientId: true, nombre: true, telefono: true, error: true },
      orderBy: { id: "asc" },
    });
    return NextResponse.json({ recipients });
  }

  const difusiones = await prisma.difusion.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return NextResponse.json({ difusiones });
}

// POST: create campaign (immediate or scheduled)
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { mensaje, imagenUrl, filtro, programada, enviarAhora, rangoDesde, rangoHasta, soloMostrador, soloActivos, activosDias } = await req.json();

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
      const zonesResult = await pool.request().query(`
        SELECT Cod FROM [${dbClientes}].dbo.Zonas
        WHERE ${DAY_NAMES.map((d) => `LTRIM(RTRIM([Desc])) LIKE '%${d}%'`).join(" OR ")}
      `);
      const zoneCods = zonesResult.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
      whereClause = zoneCods ? `AND c.Zona IN (${zoneCods})` : "AND 1=0";
    } else if (filtro?.startsWith("zona:")) {
      const zonaName = filtro.slice(5).replace(/[^A-Za-z]/g, "");
      const zonesResult = await pool.request().query(`
        SELECT Cod FROM [${dbClientes}].dbo.Zonas
        WHERE LTRIM(RTRIM([Desc])) LIKE '%${zonaName}%'
      `);
      const zoneCods = zonesResult.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
      whereClause = zoneCods ? `AND c.Zona IN (${zoneCods})` : "AND 1=0";
    } else if (filtro === "rango") {
      const desde = parseInt(rangoDesde) || 0;
      const hasta = parseInt(rangoHasta) || 999999;
      whereClause = `AND TRY_CAST(LTRIM(RTRIM(c.Cod)) AS INT) BETWEEN ${desde} AND ${hasta}`;
    }

    if (soloMostrador && filtro !== "reparto") {
      const repartoZones = await pool.request().query(`
        SELECT Cod FROM [${dbClientes}].dbo.Zonas
        WHERE ${DAY_NAMES.map((d) => `LTRIM(RTRIM([Desc])) LIKE '%${d}%'`).join(" OR ")}
      `);
      const repartoCods = repartoZones.recordset.map((z: { Cod: string }) => `'${z.Cod}'`).join(",");
      if (repartoCods) {
        whereClause += ` AND (c.Zona IS NULL OR LTRIM(RTRIM(c.Zona)) = '' OR c.Zona NOT IN (${repartoCods}))`;
      }
    }

    // Active clients filter: only those who purchased in last N days
    let activosJoin = "";
    if (soloActivos) {
      const dias = parseInt(activosDias) || 30;
      const dbTransas = getDbName("transas");
      const since = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
      const sinceStr = since.getUTCFullYear().toString()
        + String(since.getUTCMonth() + 1).padStart(2, "0")
        + String(since.getUTCDate()).padStart(2, "0") + "000000";
      activosJoin = `AND c.Cod IN (
        SELECT DISTINCT t.Cliente FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'V' AND t.Fechora >= '${sinceStr}'
          AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
      )`;
    }

    const clients = await pool.request().query(`
      SELECT LTRIM(RTRIM(c.Cod)) AS cod, LTRIM(RTRIM(c.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(c.Telclave3, ISNULL(c.TelClave1, '')))) AS telefono
      FROM [${dbClientes}].dbo.Clientes c
      WHERE (LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) <> '' OR LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) <> '')
        AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
        ${whereClause}
        ${activosJoin}
    `);

    const totalRecipients = clients.recordset.length;

    // Preview only — just return the count
    if (!enviarAhora && !programada) {
      return NextResponse.json({ ok: true, totalRecipients });
    }

    const filtroLabel = (filtro === "rango" ? `rango:${parseInt(rangoDesde) || 0}-${parseInt(rangoHasta) || 999999}` : (filtro || "todos")) + (soloMostrador ? " +mostrador" : "") + (soloActivos ? ` +activos${parseInt(activosDias) || 30}d` : "");
    const isScheduled = !!programada && !enviarAhora;

    // Daily limit is enforced in the cron — if over 300/day it pauses and continues next day

    // Create campaign + recipients in one transaction
    const difusion = await prisma.difusion.create({
      data: {
        mensaje,
        imagenUrl: imagenUrl || null,
        filtro: filtroLabel,
        programada: programada ? new Date(programada) : null,
        estado: isScheduled ? "programada" : "enviando",
        total: totalRecipients,
        creadoPor: userName,
        recipients: {
          createMany: {
            data: clients.recordset.map((c: { cod: string; nombre: string; telefono: string }) => ({
              clientId: c.cod,
              nombre: c.nombre,
              telefono: c.telefono,
              estado: "pendiente",
            })),
          },
        },
      },
    });

    // For immediate sends, trigger processing in background
    if (!isScheduled) {
      fetch(`http://127.0.0.1:3000/api/admin/difusion/cron?secret=${process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16)}`, {
        method: "POST",
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      id: difusion.id,
      totalRecipients,
      estado: isScheduled ? "programada" : "enviando",
    });
  } catch (error) {
    console.error("Difusion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// DELETE: cancel a broadcast
export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Falta id" }, { status: 400 });

  const difusion = await prisma.difusion.findUnique({ where: { id: parseInt(id) } });
  if (!difusion) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  if (difusion.estado !== "enviando" && difusion.estado !== "programada") {
    return NextResponse.json({ error: "Solo se puede cancelar una difusión en curso o programada" }, { status: 400 });
  }

  // Count pending recipients
  const pendingCount = await prisma.difusionRecipient.count({
    where: { difusionId: difusion.id, estado: "pendiente" },
  });

  // Mark pending recipients as cancelled
  await prisma.difusionRecipient.updateMany({
    where: { difusionId: difusion.id, estado: "pendiente" },
    data: { estado: "cancelado" },
  });

  // Update difusion status
  await prisma.difusion.update({
    where: { id: difusion.id },
    data: { estado: "cancelada" },
  });

  return NextResponse.json({ ok: true, cancelados: pendingCount });
}
