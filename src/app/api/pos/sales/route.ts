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
    const dbTransas = getDbName("transas");
    const dbEmpleados = getDbName("empleados");

    const result = await pool.request().query(`
      SELECT TOP 50
        LTRIM(RTRIM(t.Boleta)) AS boleta,
        LTRIM(RTRIM(t.Fechora)) AS fechora,
        t.Total AS total,
        t.Efectivo AS efectivo,
        t.Tarjeta AS tarjeta,
        t.Deuda AS deuda,
        t.Cant AS cant,
        LTRIM(RTRIM(t.Sucursal)) AS sucursal,
        LTRIM(RTRIM(ISNULL(t.Nombre, ''))) AS clienteNombre,
        LTRIM(RTRIM(t.Empleado)) AS empleadoCod,
        LTRIM(RTRIM(ISNULL(e.Nombre, t.Empleado))) AS empleadoNombre,
        LTRIM(RTRIM(ISNULL(t.Anulado, ''))) AS anulado,
        LTRIM(RTRIM(ISNULL(t.Filler1, ''))) AS filler1
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbEmpleados}].dbo.Empleados e ON e.Cod COLLATE Modern_Spanish_CI_AS = t.Empleado COLLATE Modern_Spanish_CI_AS
      WHERE t.Tipo = 'V'
        AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
        ${sucursal ? `AND LTRIM(RTRIM(t.Sucursal)) = '${sucursal}'` : ""}
        AND LTRIM(RTRIM(ISNULL(t.Filler1, ''))) = 'POS'
      ORDER BY t.Fechora DESC
    `);

    const sales = result.recordset.map((s: Record<string, unknown>) => {
      const fechora = s.fechora as string;
      return {
        boleta: s.boleta as string,
        fecha: fechora.length >= 8 ? `${(fechora).slice(6, 8)}/${(fechora).slice(4, 6)}/${(fechora).slice(0, 4)}` : "",
        hora: fechora.length >= 12 ? `${(fechora).slice(8, 10)}:${(fechora).slice(10, 12)}` : "",
        total: Number(s.total),
        efectivo: Number(s.efectivo),
        tarjeta: Number(s.tarjeta),
        deuda: Number(s.deuda),
        cant: Number(s.cant),
        sucursal: s.sucursal as string,
        clienteNombre: s.clienteNombre as string,
        empleadoNombre: s.empleadoNombre as string,
        anulado: (s.anulado as string).trim() !== "",
      };
    });

    return NextResponse.json({ sales });
  } catch (error) {
    console.error("POS sales error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
