import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const user = session.user as { clientId?: string };
  if (!user.clientId) return NextResponse.json({ error: "Sin cliente" }, { status: 400 });

  try {
    // Match client code to employee via Filler1
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");
    const empResult = await pool.request().input("clienteCod", user.clientId).query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE LTRIM(RTRIM(ISNULL(Filler1, ''))) = @clienteCod
        AND (DeBaja = 0 OR DeBaja IS NULL)
    `);

    if (empResult.recordset.length === 0) {
      return NextResponse.json({ error: "No sos empleado registrado" }, { status: 403 });
    }

    const empleadoCod = empResult.recordset[0].cod;
    const mes = new URL(req.url).searchParams.get("mes") ||
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;

    // Proxy to internal liquidacion API with cron secret for auth bypass
    const secret = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
    const internalUrl = `http://127.0.0.1:3000/api/admin/liquidacion?empleado=${empleadoCod}&mes=${mes}&secret=${secret}`;
    const res = await fetch(internalUrl);

    if (!res.ok) {
      return NextResponse.json({ error: "Error al cargar liquidacion" }, { status: 500 });
    }

    return NextResponse.json(await res.json());
  } catch (error) {
    console.error("Client liquidacion error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
