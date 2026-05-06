import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: list clients with positive balance (deuda) and valid phone
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const minMonto = parseFloat(searchParams.get("min") || "0");

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");

    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(Nombre)) AS nombre,
        CASE WHEN ISNULL(FillerBit2, 0) = 1 THEN ISNULL(Saldo, 0) * 100 ELSE ISNULL(Saldo, 0) END AS saldo,
        LTRIM(RTRIM(ISNULL(TelClave1, ''))) AS tel1,
        LTRIM(RTRIM(ISNULL(Telclave3, ''))) AS tel3,
        LTRIM(RTRIM(ISNULL(Calle, ''))) AS calle,
        LTRIM(RTRIM(ISNULL(Localidad, ''))) AS localidad
      FROM [${dbClientes}].dbo.Clientes
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
        AND CASE WHEN ISNULL(FillerBit2, 0) = 1 THEN ISNULL(Saldo, 0) * 100 ELSE ISNULL(Saldo, 0) END > ${minMonto}
        AND (TelClave1 IS NOT NULL AND LTRIM(RTRIM(TelClave1)) != ''
          OR Telclave3 IS NOT NULL AND LTRIM(RTRIM(Telclave3)) != '')
      ORDER BY saldo DESC
    `);

    const deudores = result.recordset.map((r: { cod: string; nombre: string; saldo: number; tel1: string; tel3: string; calle: string; localidad: string }) => ({
      cod: r.cod,
      nombre: r.nombre,
      saldo: Number(r.saldo),
      telefono: r.tel1 || r.tel3,
      direccion: r.calle + (r.localidad ? ", " + r.localidad : ""),
    }));

    const total = deudores.reduce((s: number, d: { saldo: number }) => s + d.saldo, 0);

    return NextResponse.json({ deudores, total, cantidad: deudores.length });
  } catch (error) {
    console.error("deudas error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
