import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const desde = searchParams.get("desde"); // YYYY-MM-DD
  const hasta = searchParams.get("hasta"); // YYYY-MM-DD
  const sucursal = searchParams.get("sucursal") || ""; // "" = all
  const rubro = searchParams.get("rubro"); // optional — when set, returns per-product breakdown for that rubro

  if (!desde || !hasta) {
    return NextResponse.json({ error: "desde y hasta requeridos" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");

    const desdeStr = desde.replace(/-/g, "") + "000000";
    const hastaStr = hasta.replace(/-/g, "") + "235959";

    const sucClause = sucursal ? `AND LTRIM(RTRIM(t.Sucursal)) = '${sucursal.replace(/'/g, "")}'` : "";

    // Drill-down mode: per-product rows for the specified rubro
    if (rubro) {
      const detail = await pool.request()
        .input("desde", desdeStr)
        .input("hasta", hastaStr)
        .input("rubro", rubro)
        .query(`
          SELECT
            LTRIM(RTRIM(p.Cod)) AS sku,
            LTRIM(RTRIM(p.Nombre)) AS nombre,
            COUNT(*) AS cantTransacciones,
            SUM(t.Cant) AS cantTotal,
            SUM(t.Impo) AS totalVentas,
            SUM(t.ImpoIva) AS totalIva,
            SUM(CASE
              WHEN t.Costo = 999999 AND s.Costo IS NOT NULL THEN s.Costo * t.Cant
              ELSE t.Costo
            END) AS totalCosto,
            SUM(CASE WHEN t.Costo = 999999 THEN 1 ELSE 0 END) AS capeados
          FROM [${dbTransas}].dbo.Transas t
          LEFT JOIN [${dbProd}].dbo.Productos p ON LTRIM(RTRIM(p.Cod)) = LTRIM(RTRIM(t.Producto))
          LEFT JOIN [${dbProd}].dbo.Rubros r ON LTRIM(RTRIM(r.Cod)) = LTRIM(RTRIM(p.Rubro))
          LEFT JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
          WHERE t.Fechora >= @desde
            AND t.Fechora <= @hasta
            AND t.Tipo = 'I'
            AND ISNULL(LTRIM(RTRIM(r.[Desc])), '(SIN RUBRO)') = @rubro
            ${sucClause}
          GROUP BY LTRIM(RTRIM(p.Cod)), LTRIM(RTRIM(p.Nombre))
          ORDER BY SUM(t.Impo) DESC
        `);
      const products = detail.recordset.map((r: { sku: string; nombre: string; cantTransacciones: number; cantTotal: number; totalVentas: number; totalIva: number; totalCosto: number; capeados: number }) => ({
        sku: r.sku || "",
        nombre: r.nombre || "(sin nombre)",
        cantTransacciones: Number(r.cantTransacciones),
        cantTotal: Number(r.cantTotal),
        totalVentas: Number(r.totalVentas),
        totalIva: Number(r.totalIva),
        totalCosto: Number(r.totalCosto),
        ganancia: Number(r.totalVentas) - Number(r.totalCosto),
        capeados: Number(r.capeados),
      }));
      return NextResponse.json({ rubro, products });
    }

    // Aggregate item sales (Tipo='I') by rubro
    const result = await pool.request()
      .input("desde", desdeStr)
      .input("hasta", hastaStr)
      .query(`
        SELECT
          ISNULL(LTRIM(RTRIM(r.[Desc])), '(SIN RUBRO)') AS rubro,
          COUNT(*) AS cantTransacciones,
          SUM(t.Cant) AS cantTotal,
          SUM(t.Impo) AS totalVentas,
          SUM(t.ImpoIva) AS totalIva,
          SUM(CASE
            WHEN t.Costo = 999999 AND s.Costo IS NOT NULL THEN s.Costo * t.Cant
            ELSE t.Costo
          END) AS totalCosto,
          SUM(CASE WHEN t.Costo = 999999 THEN 1 ELSE 0 END) AS capeados,
          SUM(CASE WHEN t.Costo = 999999 AND s.Costo IS NULL THEN 1 ELSE 0 END) AS capeadosSinRecuperar
        FROM [${dbTransas}].dbo.Transas t
        LEFT JOIN [${dbProd}].dbo.Productos p ON LTRIM(RTRIM(p.Cod)) = LTRIM(RTRIM(t.Producto))
        LEFT JOIN [${dbProd}].dbo.Rubros r ON LTRIM(RTRIM(r.Cod)) = LTRIM(RTRIM(p.Rubro))
        LEFT JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
        WHERE t.Fechora >= @desde
          AND t.Fechora <= @hasta
          AND t.Tipo = 'I'
          ${sucClause}
        GROUP BY r.[Desc]
        ORDER BY SUM(t.Impo) DESC
      `);

    const rows = result.recordset.map((r: {
      rubro: string; cantTransacciones: number; cantTotal: number; totalVentas: number; totalIva: number; totalCosto: number; capeados: number; capeadosSinRecuperar: number;
    }) => ({
      rubro: r.rubro,
      cantTransacciones: Number(r.cantTransacciones),
      cantTotal: Number(r.cantTotal),
      totalVentas: Number(r.totalVentas),
      totalIva: Number(r.totalIva),
      totalCosto: Number(r.totalCosto),
      ganancia: Number(r.totalVentas) - Number(r.totalCosto),
      capeados: Number(r.capeados),
      capeadosSinRecuperar: Number(r.capeadosSinRecuperar),
    }));

    const totales = rows.reduce(
      (a: { totalVentas: number; totalIva: number; totalCosto: number; cantTransacciones: number }, r: { totalVentas: number; totalIva: number; totalCosto: number; cantTransacciones: number }) => ({
        cantTransacciones: a.cantTransacciones + r.cantTransacciones,
        totalVentas: a.totalVentas + r.totalVentas,
        totalIva: a.totalIva + r.totalIva,
        totalCosto: a.totalCosto + r.totalCosto,
      }),
      { cantTransacciones: 0, totalVentas: 0, totalIva: 0, totalCosto: 0 }
    );

    return NextResponse.json({
      desde,
      hasta,
      sucursal: sucursal || "todas",
      rows,
      totales: {
        ...totales,
        ganancia: totales.totalVentas - totales.totalCosto,
      },
    });
  } catch (error) {
    console.error("Resumen rubros error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
