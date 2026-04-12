import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const dias = parseInt(searchParams.get("dias") || "30");
    const deposito = searchParams.get("deposito") || "0";

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const dbTransas = getDbName("transas");

    // Calculate cutoff date
    const d = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    d.setDate(d.getDate() - dias);
    const cutoff = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}000000`;

    // Products with stock > 0 that have NO sales in the last N days
    const result = await pool.request().input("cutoff", cutoff).input("dep", deposito).query(`
      SELECT
        LTRIM(RTRIM(s.CodProducto)) AS sku,
        LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
        s.Stk AS stock,
        s.Costo AS costoUnit,
        s.Stk * s.Costo AS costoInmovilizado,
        s.Precio2 AS precioMayorista,
        LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      WHERE LTRIM(RTRIM(s.Deposito)) = @dep
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND s.Stk > 0
        AND s.Precio2 > 0
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND NOT EXISTS (
          SELECT 1 FROM [${dbTransas}].dbo.Transas t
          WHERE t.Tipo = 'I'
            AND LTRIM(RTRIM(t.Producto)) = LTRIM(RTRIM(s.CodProducto))
            AND t.Fechora >= @cutoff
            AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
            AND t.Cant > 0
        )
      ORDER BY s.Stk * s.Costo DESC
    `);

    const productos = result.recordset.map((p: { sku: string; nombre: string; marca: string; rubro: string; stock: number; costoUnit: number; costoInmovilizado: number; precioMayorista: number; unidad: string }) => ({
      sku: p.sku.trim(),
      nombre: p.nombre,
      marca: p.marca,
      rubro: p.rubro,
      stock: Number(p.stock),
      costoUnit: Number(p.costoUnit),
      costoInmovilizado: Number(p.costoInmovilizado),
      precioMayorista: Number(p.precioMayorista),
      unidad: p.unidad.trim(),
    }));

    const totalInmovilizado = productos.reduce((s, p) => s + p.costoInmovilizado, 0);

    return NextResponse.json({
      dias,
      cantProductos: productos.length,
      totalInmovilizado,
      productos,
    });
  } catch (error) {
    console.error("Error productos sin movimiento:", error);
    return NextResponse.json({ error: "Error al cargar datos" }, { status: 500 });
  }
}
