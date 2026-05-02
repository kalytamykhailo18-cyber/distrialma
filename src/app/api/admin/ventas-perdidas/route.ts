import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const dias = parseInt(searchParams.get("dias") || "7");

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const dbTransas = getDbName("transas");

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));

    // Period: last N days
    const since = new Date(now.getTime() - dias * 24 * 60 * 60 * 1000);
    const sinceStr = since.getFullYear().toString()
      + String(since.getMonth() + 1).padStart(2, "0")
      + String(since.getDate()).padStart(2, "0") + "000000";

    // Previous period (same length before that) for comparison
    const prevSince = new Date(since.getTime() - dias * 24 * 60 * 60 * 1000);
    const prevSinceStr = prevSince.getFullYear().toString()
      + String(prevSince.getMonth() + 1).padStart(2, "0")
      + String(prevSince.getDate()).padStart(2, "0") + "000000";

    // Products currently at zero stock that had sales in previous period
    const result = await pool.request()
      .input("sinceStr", sinceStr)
      .input("prevSinceStr", prevSinceStr)
      .query(`
        SELECT
          LTRIM(RTRIM(p.Cod)) AS sku,
          LTRIM(RTRIM(p.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad,
          s.Stk AS stock,
          s.Precio2 AS precioMayorista,
          (SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
           WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Fechora >= @prevSinceStr AND t.Fechora < @sinceStr
           AND t.Cant > 0 AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '')) AS ventaPeriodoAnterior,
          (SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
           WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Fechora >= @sinceStr
           AND t.Cant > 0 AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '')) AS ventaPeriodoActual,
          (SELECT SUM(t.Impo) FROM [${dbTransas}].dbo.Transas t
           WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Fechora >= @prevSinceStr AND t.Fechora < @sinceStr
           AND t.Cant > 0 AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '')) AS importeAnterior
        FROM [${dbProd}].dbo.Stock s
        JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        WHERE LTRIM(RTRIM(s.Deposito)) = '0'
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND s.Precio2 > 0
          AND s.Stk <= 0
        ORDER BY (SELECT SUM(t.Impo) FROM [${dbTransas}].dbo.Transas t
           WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Fechora >= @prevSinceStr AND t.Fechora < @sinceStr
           AND t.Cant > 0 AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '')) DESC
      `);

    const products = result.recordset
      .filter((p: { ventaPeriodoAnterior: number | null }) => p.ventaPeriodoAnterior && Number(p.ventaPeriodoAnterior) > 0)
      .map((p: { sku: string; nombre: string; unidad: string; stock: number; precioMayorista: number; ventaPeriodoAnterior: number; ventaPeriodoActual: number | null; importeAnterior: number }) => {
        const ventaAnterior = Number(p.ventaPeriodoAnterior) || 0;
        const ventaActual = Number(p.ventaPeriodoActual) || 0;
        const importeAnterior = Number(p.importeAnterior) || 0;
        const ventaPerdida = Math.max(0, ventaAnterior - ventaActual);
        const importePerdido = ventaAnterior > 0 ? Math.round(importeAnterior * (ventaPerdida / ventaAnterior)) : 0;

        return {
          sku: p.sku.trim(),
          nombre: p.nombre.trim(),
          unidad: p.unidad.trim(),
          stock: Number(p.stock),
          precioMayorista: Number(p.precioMayorista),
          ventaAnterior: Math.round(ventaAnterior * 100) / 100,
          ventaActual: Math.round(ventaActual * 100) / 100,
          ventaPerdida: Math.round(ventaPerdida * 100) / 100,
          importePerdido,
        };
      })
      .filter((p: { ventaPerdida: number }) => p.ventaPerdida > 0);

    const totalPerdido = products.reduce((s: number, p: { importePerdido: number }) => s + p.importePerdido, 0);

    return NextResponse.json({
      dias,
      periodoActual: `${since.getDate()}/${since.getMonth() + 1} - ${now.getDate()}/${now.getMonth() + 1}`,
      periodoAnterior: `${prevSince.getDate()}/${prevSince.getMonth() + 1} - ${since.getDate()}/${since.getMonth() + 1}`,
      productos: products.slice(0, 50),
      totalProductos: products.length,
      totalPerdido,
    });
  } catch (error) {
    console.error("Ventas perdidas error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
