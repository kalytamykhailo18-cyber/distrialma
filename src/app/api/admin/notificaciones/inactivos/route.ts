import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: list clients who haven't purchased in the last N days
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const dias = parseInt(searchParams.get("dias") || "20");
  const minCompras = parseInt(searchParams.get("minCompras") || "3");

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");

    // Build cutoff date (today - N days) in YYYYMMDDhhmmss format
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - dias);
    const cutoffStr = cutoff.getUTCFullYear().toString()
      + String(cutoff.getUTCMonth() + 1).padStart(2, "0")
      + String(cutoff.getUTCDate()).padStart(2, "0") + "000000";

    // Also a floor to exclude dormant clients (at least 1 purchase in last 6 months)
    const floor = new Date(now);
    floor.setMonth(floor.getMonth() - 6);
    const floorStr = floor.getUTCFullYear().toString()
      + String(floor.getUTCMonth() + 1).padStart(2, "0")
      + String(floor.getUTCDate()).padStart(2, "0") + "000000";

    const result = await pool.request()
      .input("cutoff", cutoffStr)
      .input("floor", floorStr)
      .input("minCompras", minCompras)
      .query(`
        WITH ClientStats AS (
          SELECT
            LTRIM(RTRIM(t.Cliente)) AS cod,
            MAX(LTRIM(RTRIM(t.Fechora))) AS ultimaCompra,
            COUNT(DISTINCT t.Boleta) AS cantCompras,
            SUM(t.Impo) AS totalHistorico
          FROM [${dbTransas}].dbo.Transas t
          WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
            AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
            AND LTRIM(RTRIM(t.Cliente)) <> ''
            AND t.Fechora >= @floor
          GROUP BY LTRIM(RTRIM(t.Cliente))
        )
        SELECT
          cs.cod,
          cs.ultimaCompra,
          cs.cantCompras,
          cs.totalHistorico,
          LTRIM(RTRIM(c.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(c.TelClave1, ''))) AS tel1,
          LTRIM(RTRIM(ISNULL(c.Telclave3, ''))) AS tel3,
          LTRIM(RTRIM(ISNULL(c.Calle, ''))) AS calle,
          LTRIM(RTRIM(ISNULL(c.Localidad, ''))) AS localidad,
          ISNULL(c.Saldo, 0) AS saldo
        FROM ClientStats cs
        INNER JOIN [${dbClientes}].dbo.Clientes c ON LTRIM(RTRIM(c.Cod)) COLLATE Modern_Spanish_CI_AS = cs.cod COLLATE Modern_Spanish_CI_AS
        WHERE cs.ultimaCompra < @cutoff
          AND cs.cantCompras >= @minCompras
          AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
          AND (c.TelClave1 IS NOT NULL AND LTRIM(RTRIM(c.TelClave1)) != ''
            OR c.Telclave3 IS NOT NULL AND LTRIM(RTRIM(c.Telclave3)) != '')
        ORDER BY cs.totalHistorico DESC
      `);

    const inactivos = result.recordset.map((r: { cod: string; nombre: string; ultimaCompra: string; cantCompras: number; totalHistorico: number; tel1: string; tel3: string; calle: string; localidad: string; saldo: number }) => {
      const f = r.ultimaCompra || "";
      const diasDesde = f.length >= 8 ? Math.floor((now.getTime() - new Date(
        parseInt(f.slice(0, 4)),
        parseInt(f.slice(4, 6)) - 1,
        parseInt(f.slice(6, 8))
      ).getTime()) / (1000 * 60 * 60 * 24)) : 0;
      return {
        cod: r.cod,
        nombre: r.nombre,
        telefono: r.tel1 || r.tel3,
        direccion: r.calle + (r.localidad ? ", " + r.localidad : ""),
        ultimaCompra: f ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : "",
        diasDesde,
        cantCompras: Number(r.cantCompras),
        totalHistorico: Number(r.totalHistorico),
        saldo: Number(r.saldo),
      };
    });

    const totalHistorico = inactivos.reduce((s: number, d: { totalHistorico: number }) => s + d.totalHistorico, 0);

    return NextResponse.json({ inactivos, cantidad: inactivos.length, totalHistorico });
  } catch (error) {
    console.error("inactivos error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
