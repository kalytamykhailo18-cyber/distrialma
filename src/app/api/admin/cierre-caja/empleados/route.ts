import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");

    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
        AND (Vendedor = 1 OR Usuario = 1)
      ORDER BY Nombre
    `);

    return NextResponse.json({
      empleados: result.recordset,
    });
  } catch (error) {
    console.error("Error fetching empleados:", error);
    return NextResponse.json({ error: "Error al cargar empleados" }, { status: 500 });
  }
}
