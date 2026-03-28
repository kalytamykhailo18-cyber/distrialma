import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sucursal = req.nextUrl.searchParams.get("sucursal") || "1";

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");

    // Find last cierre (apertura) to know the start time
    const lastApertura = await pool.request().input("suc", sucursal).query(`
      SELECT TOP 1 Fechora, InicioCaja
      FROM [${dbTransas}].dbo.Transas
      WHERE LTRIM(RTRIM(MovCaja)) = 'A'
        AND LTRIM(RTRIM(Sucursal)) = @suc
      ORDER BY Fechora DESC
    `);

    const desde = lastApertura.recordset[0]?.Fechora?.trim() || "20260101000000";
    const inicioCaja = lastApertura.recordset[0]?.InicioCaja || 0;

    // Sales summary since last apertura
    const ventas = await pool.request().input("suc", sucursal).input("desde", desde).query(`
      SELECT
        COUNT(*) AS cantVentas,
        SUM(ISNULL(Efectivo, 0)) AS efectivo,
        SUM(ISNULL(Tarjeta, 0)) AS tarjeta,
        SUM(ISNULL(Deuda, 0)) AS deuda,
        SUM(ISNULL(Total, 0)) AS total,
        MIN(LTRIM(RTRIM(NroTransa))) AS nroDesde,
        MAX(LTRIM(RTRIM(NroTransa))) AS nroHasta
      FROM [${dbTransas}].dbo.Transas
      WHERE Tipo = 'V'
        AND LTRIM(RTRIM(Sucursal)) = @suc
        AND Fechora >= @desde
        AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
    `);

    // Cash movements (retiros, ingresos, pagos)
    const movimientos = await pool.request().input("suc", sucursal).input("desde", desde).query(`
      SELECT
        LTRIM(RTRIM(MovCaja)) AS tipo,
        LTRIM(RTRIM(ISNULL(Concepto, ''))) AS concepto,
        ISNULL(Efectivo, 0) AS efectivo,
        ISNULL(Total, 0) AS total,
        LTRIM(RTRIM(Fechora)) AS fechora
      FROM [${dbTransas}].dbo.Transas
      WHERE LTRIM(RTRIM(MovCaja)) IN ('R', 'I', 'P')
        AND LTRIM(RTRIM(Sucursal)) = @suc
        AND Fechora >= @desde
      ORDER BY Fechora ASC
    `);

    // Anuladas count
    const anuladas = await pool.request().input("suc", sucursal).input("desde", desde).query(`
      SELECT COUNT(*) AS cnt, SUM(ISNULL(Total, 0)) AS total
      FROM [${dbTransas}].dbo.Transas
      WHERE Tipo = 'V'
        AND LTRIM(RTRIM(Sucursal)) = @suc
        AND Fechora >= @desde
        AND Anulado IS NOT NULL AND LTRIM(RTRIM(Anulado)) != '' AND Anulado != ' '
    `);

    // Calculate totals
    const v = ventas.recordset[0];
    const retiros = movimientos.recordset
      .filter((m: { tipo: string }) => m.tipo === "R")
      .reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);
    const ingresos = movimientos.recordset
      .filter((m: { tipo: string }) => m.tipo === "I")
      .reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);
    const pagos = movimientos.recordset
      .filter((m: { tipo: string }) => m.tipo === "P")
      .reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);

    const totalEfectivoCaja = inicioCaja + v.efectivo - retiros + ingresos - pagos;

    // Format desde date
    const desdeStr = desde.length >= 12
      ? `${desde.slice(6,8)}/${desde.slice(4,6)}/${desde.slice(0,4)} ${desde.slice(8,10)}:${desde.slice(10,12)}`
      : desde;

    return NextResponse.json({
      sucursal,
      desde: desdeStr,
      desdeRaw: desde,
      inicioCaja,
      ventas: {
        cantidad: v.cantVentas,
        efectivo: v.efectivo,
        tarjeta: v.tarjeta,
        deuda: v.deuda,
        total: v.total,
        nroDesde: v.nroDesde,
        nroHasta: v.nroHasta,
      },
      movimientos: movimientos.recordset.map((m: { tipo: string; concepto: string; efectivo: number; total: number; fechora: string }) => ({
        tipo: m.tipo === "R" ? "Retiro" : m.tipo === "I" ? "Ingreso" : "Pago proveedor",
        concepto: m.concepto,
        monto: m.efectivo || m.total,
        fechora: m.fechora,
      })),
      retiros,
      ingresos,
      pagos,
      anuladas: {
        cantidad: anuladas.recordset[0]?.cnt || 0,
        total: anuladas.recordset[0]?.total || 0,
      },
      totalEfectivoCaja,
      totalTarjeta: v.tarjeta,
      totalDeuda: v.deuda,
    });
  } catch (error) {
    console.error("Cierre caja error:", error);
    return NextResponse.json({ error: "Error al cargar datos de caja" }, { status: 500 });
  }
}
