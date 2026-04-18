import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: detect clients where recent sales with Deuda didn't update the Saldo
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const dias = parseInt(req.nextUrl.searchParams.get("dias") || "7");

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");

    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const since = new Date(now);
    since.setDate(since.getDate() - dias);
    const sinceStr = since.getUTCFullYear().toString()
      + String(since.getUTCMonth() + 1).padStart(2, "0")
      + String(since.getUTCDate()).padStart(2, "0") + "000000";

    // Find clients with recent sales where TransaUlt doesn't match the latest boleta
    // This means PunTouch failed to update the client record
    const result = await pool.request().input("since", sinceStr).query(`
      WITH RecentSales AS (
        SELECT
          LTRIM(RTRIM(t.Cliente)) AS clienteCod,
          MAX(LTRIM(RTRIM(t.Boleta))) AS ultimaBoleta,
          SUM(CASE WHEN t.Deuda > 0 THEN t.Deuda ELSE 0 END) AS deudaReciente,
          COUNT(DISTINCT t.Boleta) AS cantBoletas
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
          AND t.Fechora >= @since
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND LTRIM(RTRIM(t.Cliente)) <> ''
        GROUP BY LTRIM(RTRIM(t.Cliente))
      )
      SELECT
        rs.clienteCod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        ISNULL(c.Saldo, 0) AS saldoActual,
        rs.ultimaBoleta,
        LTRIM(RTRIM(ISNULL(c.TransaUlt, ''))) AS transaUlt,
        rs.deudaReciente,
        rs.cantBoletas
      FROM RecentSales rs
      INNER JOIN [${dbClientes}].dbo.Clientes c
        ON LTRIM(RTRIM(c.Cod)) COLLATE Modern_Spanish_CI_AS = rs.clienteCod COLLATE Modern_Spanish_CI_AS
      WHERE rs.deudaReciente > 0
        AND LTRIM(RTRIM(ISNULL(c.TransaUlt, ''))) <> rs.ultimaBoleta
      ORDER BY rs.deudaReciente DESC
    `);

    const problemas = result.recordset.map((r: { clienteCod: string; nombre: string; saldoActual: number; ultimaBoleta: string; transaUlt: string; deudaReciente: number; cantBoletas: number }) => ({
      cod: r.clienteCod,
      nombre: r.nombre,
      saldoActual: Number(r.saldoActual),
      ultimaBoleta: r.ultimaBoleta,
      transaUlt: r.transaUlt,
      deudaReciente: Number(r.deudaReciente),
      cantBoletas: Number(r.cantBoletas),
    }));

    return NextResponse.json({ problemas, dias, cantidad: problemas.length });
  } catch (error) {
    console.error("fix-saldos GET error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: fix a specific client's saldo by recalculating from TransaUlt
export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { clienteCod, action } = await req.json();
    if (!clienteCod) return NextResponse.json({ error: "clienteCod requerido" }, { status: 400 });

    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");
    const codPadded = String(clienteCod).padStart(7, " ");

    if (action === "recalculate") {
      // Get the client's current TransaUlt
      const clientResult = await pool.request().input("cod", codPadded).query(`
        SELECT ISNULL(Saldo, 0) AS saldo, LTRIM(RTRIM(ISNULL(TransaUlt, ''))) AS transaUlt
        FROM [${dbClientes}].dbo.Clientes WHERE Cod = @cod
      `);
      if (clientResult.recordset.length === 0) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }

      const oldSaldo = Number(clientResult.recordset[0].saldo);
      const transaUlt = clientResult.recordset[0].transaUlt;

      // Find all sales AFTER the TransaUlt that have Deuda > 0
      const missedSales = await pool.request().input("cod", codPadded).input("transaUlt", transaUlt.padStart(9, " ")).query(`
        SELECT
          LTRIM(RTRIM(Boleta)) AS boleta,
          ISNULL(Deuda, 0) AS deuda,
          ISNULL(Total, 0) AS total,
          LTRIM(RTRIM(Fechora)) AS fechora
        FROM [${dbTransas}].dbo.Transas
        WHERE Cliente = @cod AND Tipo = 'V' AND LTRIM(RTRIM(Itm)) = '0'
          AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
          AND CAST(LTRIM(RTRIM(Cod)) AS BIGINT) > CAST(LTRIM(RTRIM(@transaUlt)) AS BIGINT)
          AND Deuda > 0
        ORDER BY Fechora ASC
      `);

      if (missedSales.recordset.length === 0) {
        return NextResponse.json({ message: "No hay ventas sin aplicar", oldSaldo, newSaldo: oldSaldo });
      }

      const missedDeuda = missedSales.recordset.reduce((s: number, r: { deuda: number }) => s + Number(r.deuda), 0);
      const lastBoleta = missedSales.recordset[missedSales.recordset.length - 1].boleta;
      const newSaldo = oldSaldo + missedDeuda;

      // Update client
      await pool.request()
        .input("cod", codPadded)
        .input("newSaldo", Math.round(newSaldo * 100) / 100)
        .input("lastBoleta", lastBoleta.padStart(9, " "))
        .query(`
          UPDATE [${dbClientes}].dbo.Clientes
          SET Saldo = @newSaldo, TransaUlt = @lastBoleta
          WHERE Cod = @cod
        `);

      return NextResponse.json({
        ok: true,
        cod: clienteCod,
        oldSaldo,
        newSaldo: Math.round(newSaldo * 100) / 100,
        missedBoletas: missedSales.recordset.length,
        missedDeuda: Math.round(missedDeuda * 100) / 100,
        lastBoleta,
      });
    }

    return NextResponse.json({ error: "action no reconocida" }, { status: 400 });
  } catch (error) {
    console.error("fix-saldos POST error:", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error" }, { status: 500 });
  }
}
