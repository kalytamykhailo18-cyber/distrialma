import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") || "";
  if (q.length < 2) return NextResponse.json({ clientes: [] });

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");

    const result = await pool
      .request()
      .input("q", `%${q}%`)
      .query(`
        SELECT TOP 30
          LTRIM(RTRIM(Cod)) AS cod,
          LTRIM(RTRIM(Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(CUIT, ''))) AS cuit,
          LTRIM(RTRIM(ISNULL(Calle, ''))) AS direccion,
          LTRIM(RTRIM(ISNULL(Localidad, ''))) AS localidad,
          LTRIM(RTRIM(ISNULL(TelClave1, ''))) AS telefono,
          LTRIM(RTRIM(ISNULL(Telclave3, ''))) AS whatsapp
        FROM [${dbClientes}].dbo.Clientes
        WHERE (DeBaja = 0 OR DeBaja IS NULL)
          AND (Nombre LIKE @q OR CUIT LIKE @q OR Cod LIKE @q)
        ORDER BY Nombre
      `);

    // Fetch registration data (photos, GPS) for matched clients
    const cods = result.recordset.map((c: { cod: string }) => c.cod.padStart(7, " "));
    const registros = await prisma.clienteRegistro.findMany({
      where: { clienteCod: { in: cods } },
    });
    const regMap = new Map(registros.map((r) => [r.clienteCod.trim(), r]));

    const clientes = result.recordset.map((c: { cod: string; nombre: string; cuit: string; direccion: string; localidad: string; telefono: string; whatsapp: string }) => ({
      ...c,
      direccion: [c.direccion, c.localidad].filter(Boolean).join(", "),
      registro: regMap.has(c.cod) ? {
        fotoLocal: regMap.get(c.cod)!.fotoLocal,
        fotoCuit: regMap.get(c.cod)!.fotoCuit,
        whatsapp: regMap.get(c.cod)!.whatsapp,
        lat: regMap.get(c.cod)!.lat,
        lng: regMap.get(c.cod)!.lng,
      } : null,
    }));

    return NextResponse.json({ clientes });
  } catch (error) {
    console.error("Error searching clients:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
