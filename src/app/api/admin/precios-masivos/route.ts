import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    const [marcas, proveedores] = await Promise.all([
      pool.request().query(`SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM([Desc])) AS nombre FROM [${dbProd}].dbo.Marcas ORDER BY [Desc]`),
      pool.request().query(`SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre FROM [${dbProd}].dbo.Proveedores ORDER BY Nombre`),
    ]);

    return NextResponse.json({
      marcas: marcas.recordset,
      proveedores: proveedores.recordset,
    });
  } catch (error) {
    console.error("Error precios masivos:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { marcaCod, proveedorCod, porcentaje, preview } = await req.json();
    if (!porcentaje || (!marcaCod && !proveedorCod)) {
      return NextResponse.json({ error: "Selecciona marca o proveedor y porcentaje" }, { status: 400 });
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const pct = parseFloat(porcentaje);
    const factor = 1 + pct / 100;

    // Build filter
    let filter = "";
    const request = pool.request();
    if (marcaCod) {
      request.input("marca", marcaCod.trim());
      filter = "AND LTRIM(RTRIM(p.Marca)) = @marca";
    }
    if (proveedorCod) {
      request.input("prov", proveedorCod.trim());
      filter += " AND (LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) = @prov OR LTRIM(RTRIM(ISNULL(s.Proveedor2,''))) = @prov OR LTRIM(RTRIM(ISNULL(s.Proveedor3,''))) = @prov)";
    }

    if (preview) {
      // Preview: show affected products with current and new prices
      const result = await request.query(`
        SELECT
          LTRIM(RTRIM(s.CodProducto)) AS sku,
          LTRIM(RTRIM(p.Nombre)) AS nombre,
          s.Costo AS costo,
          s.Precio AS precio,
          s.Precio2 AS precio2,
          s.Precio4 AS precio4,
          s.Precio5 AS precio5
        FROM [${dbProd}].dbo.Stock s
        JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        WHERE LTRIM(RTRIM(s.Deposito)) = '0'
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND s.Costo > 0
          ${filter}
        ORDER BY p.Nombre
      `);

      return NextResponse.json({
        count: result.recordset.length,
        products: result.recordset.map((r: { sku: string; nombre: string; costo: number; precio: number; precio2: number; precio4: number; precio5: number }) => ({
          sku: r.sku,
          nombre: r.nombre,
          costoActual: Number(r.costo),
          costoNuevo: Math.round(Number(r.costo) * factor),
        })),
      });
    }

    // Apply: update costo and recalculate prices
    const result = await request.query(`
      UPDATE s SET
        s.Precio = CASE WHEN ISNULL(s.Precio, 0) > 0 AND ISNULL(s.Costo, 0) > 0 THEN ROUND(s.Costo * ${factor} * s.Precio / s.Costo, 0) ELSE s.Precio END,
        s.Precio2 = CASE WHEN ISNULL(s.Precio2, 0) > 0 AND ISNULL(s.Costo, 0) > 0 THEN ROUND(s.Costo * ${factor} * s.Precio2 / s.Costo, 0) ELSE s.Precio2 END,
        s.Precio3 = CASE WHEN ISNULL(s.Precio3, 0) > 0 AND ISNULL(s.Costo, 0) > 0 THEN ROUND(s.Costo * ${factor} * s.Precio3 / s.Costo, 0) ELSE s.Precio3 END,
        s.Precio4 = CASE WHEN ISNULL(s.Precio4, 0) > 0 AND ISNULL(s.Costo, 0) > 0 THEN ROUND(s.Costo * ${factor} * s.Precio4 / s.Costo, 0) ELSE s.Precio4 END,
        s.Precio5 = CASE WHEN ISNULL(s.Precio5, 0) > 0 AND ISNULL(s.Costo, 0) > 0 THEN ROUND(s.Costo * ${factor} * s.Precio5 / s.Costo, 0) ELSE s.Precio5 END,
        s.Costo = ROUND(s.Costo * ${factor}, 3)
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = '0'
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Costo > 0
        ${filter}
    `);

    return NextResponse.json({ updated: result.rowsAffected[0] || 0 });
  } catch (error) {
    console.error("Error precios masivos:", error);
    return NextResponse.json({ error: "Error al actualizar" }, { status: 500 });
  }
}
