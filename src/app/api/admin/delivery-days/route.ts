import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

const DAYS = ["LUNES", "MARTES", "MIERCOLES", "JUEVES", "VIERNES", "SABADO"];

// GET — list clients with their delivery days
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const search = searchParams.get("search") || "";

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");

    let query = `
      SELECT TOP 50
        LTRIM(RTRIM(c.Cod)) AS cod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(c.CUIT, ''))) AS cuit,
        LTRIM(RTRIM(ISNULL(z.[Desc], ''))) AS zonaOriginal
      FROM [${dbClientes}].dbo.Clientes c
      LEFT JOIN [${dbClientes}].dbo.Zonas z ON z.Cod = c.Zona
      WHERE (c.DeBaja = 0 OR c.DeBaja IS NULL)
    `;

    const request = pool.request();
    if (search.trim()) {
      query += ` AND (c.Nombre LIKE @search OR c.CUIT LIKE @search)`;
      request.input("search", `%${search.trim()}%`);
    }
    query += ` ORDER BY c.Nombre`;

    const result = await request.query(query);

    // Get our delivery days from PostgreSQL
    const clientIds = result.recordset.map((c: { cod: string }) => c.cod);
    const deliveryDays = await prisma.clientDeliveryDay.findMany({
      where: { clientId: { in: clientIds } },
    });

    const daysByClient = new Map<string, string[]>();
    for (const d of deliveryDays) {
      if (!daysByClient.has(d.clientId)) daysByClient.set(d.clientId, []);
      daysByClient.get(d.clientId)!.push(d.day);
    }

    const clients = result.recordset.map((c: { cod: string; nombre: string; cuit: string; zonaOriginal: string }) => ({
      cod: c.cod,
      nombre: c.nombre,
      cuit: c.cuit,
      zonaOriginal: c.zonaOriginal,
      days: daysByClient.get(c.cod) || [],
    }));

    return NextResponse.json({ clients, availableDays: DAYS });
  } catch (error) {
    console.error("Delivery days error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST — set delivery days for a client
export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { clientId, days } = (await req.json()) as {
    clientId: string;
    days: string[];
  };

  if (!clientId) {
    return NextResponse.json({ error: "clientId requerido" }, { status: 400 });
  }

  // Delete existing and recreate
  await prisma.clientDeliveryDay.deleteMany({ where: { clientId } });

  if (days && days.length > 0) {
    await prisma.clientDeliveryDay.createMany({
      data: days.map((day) => ({ clientId, day })),
    });
  }

  const updated = await prisma.clientDeliveryDay.findMany({
    where: { clientId },
  });

  return NextResponse.json({ days: updated.map((d) => d.day) });
}
