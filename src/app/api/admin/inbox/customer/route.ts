import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: look up customer info by phone + show recent PunTouch orders
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const phone = searchParams.get("phone");
  if (!phone) {
    return NextResponse.json({ error: "phone requerido" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");

    // Strip non-digits from phone
    const clean = phone.replace(/[^0-9]/g, "");
    const last10 = clean.slice(-10);
    const last8 = clean.slice(-8);

    // Find clients
    const clientsResult = await pool.request()
      .input("p10", `%${last10}%`)
      .input("p8", `%${last8}%`)
      .query(`
        SELECT TOP 5
          LTRIM(RTRIM(Cod)) AS cod,
          LTRIM(RTRIM(Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(CUIT, ''))) AS cuit,
          CASE WHEN ISNULL(FillerBit2, 0) = 1 THEN ISNULL(Saldo, 0) * 100 ELSE ISNULL(Saldo, 0) END AS saldo,
          LTRIM(RTRIM(ISNULL(Calle, ''))) AS calle,
          LTRIM(RTRIM(ISNULL(Localidad, ''))) AS localidad,
          LTRIM(RTRIM(ISNULL(TelClave1, ''))) AS tel1,
          LTRIM(RTRIM(ISNULL(Telclave3, ''))) AS tel3
        FROM [${dbClientes}].dbo.Clientes
        WHERE (DeBaja = 0 OR DeBaja IS NULL)
          AND (REPLACE(REPLACE(REPLACE(TelClave1, '-', ''), ' ', ''), '+', '') LIKE @p10
            OR REPLACE(REPLACE(REPLACE(Telclave3, '-', ''), ' ', ''), '+', '') LIKE @p10
            OR REPLACE(REPLACE(REPLACE(TelClave1, '-', ''), ' ', ''), '+', '') LIKE @p8
            OR REPLACE(REPLACE(REPLACE(Telclave3, '-', ''), ' ', ''), '+', '') LIKE @p8)
      `);

    if (clientsResult.recordset.length === 0) {
      return NextResponse.json({ found: false });
    }

    const clients = clientsResult.recordset.map((r: { cod: string; nombre: string; cuit: string; saldo: number; calle: string; localidad: string; tel1: string; tel3: string }) => ({
      cod: r.cod,
      nombre: r.nombre,
      cuit: r.cuit,
      saldo: Number(r.saldo),
      calle: r.calle,
      localidad: r.localidad,
      telefono: r.tel1 || r.tel3,
    }));

    // Get recent orders for the first client
    const primaryCod = clients[0].cod;
    const codPadded = primaryCod.padStart(7, " ");

    const ordersResult = await pool.request()
      .input("cod", codPadded)
      .query(`
        SELECT TOP 10
          LTRIM(RTRIM(Boleta)) AS boleta,
          LTRIM(RTRIM(Fechora)) AS fechora,
          SUM(ISNULL(Impo, 0)) AS total,
          COUNT(*) AS items
        FROM [${dbTransas}].dbo.Transas
        WHERE Cliente = @cod
          AND Tipo = 'V'
          AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
        GROUP BY LTRIM(RTRIM(Boleta)), LTRIM(RTRIM(Fechora))
        ORDER BY LTRIM(RTRIM(Fechora)) DESC
      `);

    const orders = ordersResult.recordset.map((r: { boleta: string; fechora: string; total: number; items: number }) => ({
      boleta: r.boleta,
      fechora: r.fechora,
      total: Number(r.total),
      items: Number(r.items),
    }));

    return NextResponse.json({ found: true, clients, orders });
  } catch (error) {
    console.error("Customer lookup error:", error);
    return NextResponse.json({ error: "Error al buscar cliente" }, { status: 500 });
  }
}
