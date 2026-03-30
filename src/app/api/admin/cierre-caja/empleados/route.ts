import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sucursal = req.nextUrl.searchParams.get("sucursal") || "";

  try {
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");

    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(Observaciones, ''))) AS observaciones
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
        AND (Vendedor = 1 OR Usuario = 1)
      ORDER BY Nombre
    `);

    // Filter by sucursal if specified (check Observaciones field)
    const all = result.recordset as Array<{ cod: string; nombre: string; observaciones: string }>;
    const filtered = sucursal
      ? all.filter((e) => {
          const obs = e.observaciones.trim();
          if (!obs) return true; // No restriction = all sucursales
          return obs.split(",").map((s) => s.trim()).includes(sucursal);
        })
      : all;

    return NextResponse.json({
      empleados: filtered.map((e) => ({ cod: e.cod, nombre: e.nombre })),
    });
  } catch (error) {
    console.error("Error fetching empleados:", error);
    return NextResponse.json({ error: "Error al cargar empleados" }, { status: 500 });
  }
}
