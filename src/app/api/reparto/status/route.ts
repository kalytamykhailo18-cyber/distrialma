import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: fetch delivery statuses for a given date
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fecha = searchParams.get("fecha") || new Date().toISOString().slice(0, 10);

  try {
    const dia = new Date(fecha + "T00:00:00");
    const statuses = await prisma.deliveryStatus.findMany({
      where: { fecha: dia },
    });
    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("delivery status GET error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: mark delivery status for a client on a specific date
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { clientId, fecha, estado, observaciones } = await req.json();
    if (!clientId || !fecha || !estado) {
      return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    }

    const userName = (session.user as { name?: string })?.name || "staff";
    const dia = new Date(fecha + "T00:00:00");

    const status = await prisma.deliveryStatus.upsert({
      where: { clientId_fecha: { clientId, fecha: dia } },
      update: { estado, observaciones: observaciones || null, deliveredBy: userName },
      create: { clientId, fecha: dia, estado, observaciones: observaciones || null, deliveredBy: userName },
    });

    // Queue post-delivery survey when marked as entregado
    if (estado === "entregado") {
      try {
        const { getPool, getDbName } = await import("@/lib/mssql");
        const pool = await getPool();
        const dbCli = getDbName("clientes");
        const cli = await pool.request().input("cod", clientId).query(
          `SELECT LTRIM(RTRIM(Nombre)) AS nombre, LTRIM(RTRIM(ISNULL(Telclave3, ISNULL(TelClave1,'')))) AS telefono FROM [${dbCli}].dbo.Clientes WHERE LTRIM(RTRIM(Cod)) = @cod`
        );
        const c = cli.recordset[0];
        if (c?.telefono?.trim()) {
          const enviarA = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now
          await prisma.encuestaEntrega.upsert({
            where: { clientId_fecha: { clientId, fecha: dia } },
            update: { enviarA, enviada: false },
            create: { clientId, clientName: c.nombre?.trim() || "", telefono: c.telefono.trim(), fecha: dia, enviarA },
          }).catch(() => {});
        }
      } catch {}
    }

    return NextResponse.json({ status });
  } catch (error) {
    console.error("delivery status POST error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// DELETE: clear a delivery status (undo)
export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const clientId = searchParams.get("clientId");
    const fecha = searchParams.get("fecha");
    if (!clientId || !fecha) return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
    const dia = new Date(fecha + "T00:00:00");
    await prisma.deliveryStatus.delete({
      where: { clientId_fecha: { clientId, fecha: dia } },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
