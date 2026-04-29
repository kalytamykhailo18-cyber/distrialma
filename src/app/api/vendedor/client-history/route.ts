import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const cod = req.nextUrl.searchParams.get("cod");
  if (!cod) return NextResponse.json({ error: "cod requerido" }, { status: 400 });

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");

    // Get products this client bought in the last 90 days, grouped by product
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const sinceStr = since.getFullYear().toString()
      + String(since.getMonth() + 1).padStart(2, "0")
      + String(since.getDate()).padStart(2, "0") + "000000";

    const result = await pool.request()
      .input("cod", cod.padStart(7, " "))
      .input("desde", sinceStr)
      .query(`
        SELECT TOP 30
          LTRIM(RTRIM(t.Producto)) AS sku,
          LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
          SUM(t.Cant) AS totalCant,
          COUNT(DISTINCT t.Boleta) AS veces,
          MAX(LTRIM(RTRIM(t.Fechora))) AS ultimaCompra
        FROM [${dbTransas}].dbo.Transas t
        LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
        WHERE t.Tipo = 'I'
          AND t.Cliente = @cod
          AND t.Fechora >= @desde
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND t.Cant > 0
        GROUP BY LTRIM(RTRIM(t.Producto)), LTRIM(RTRIM(ISNULL(pr.Nombre, '')))
        ORDER BY COUNT(DISTINCT t.Boleta) DESC, SUM(t.Cant) DESC
      `);

    const products = result.recordset.map((r: { sku: string; nombre: string; totalCant: number; veces: number; ultimaCompra: string }) => ({
      sku: r.sku.trim(),
      nombre: r.nombre,
      totalCant: Math.round(Number(r.totalCant) * 100) / 100,
      veces: Number(r.veces),
      ultimaCompra: r.ultimaCompra?.slice(6, 8) + "/" + r.ultimaCompra?.slice(4, 6),
    }));

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Client history error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
