import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";

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
          LTRIM(RTRIM(ISNULL(TelClave1, ''))) AS telefono
        FROM [${dbClientes}].dbo.Clientes
        WHERE (DeBaja = 0 OR DeBaja IS NULL)
          AND (Nombre LIKE @q OR CUIT LIKE @q OR Cod LIKE @q)
        ORDER BY Nombre
      `);

    return NextResponse.json({ clientes: result.recordset });
  } catch (error) {
    console.error("Error searching clients:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
