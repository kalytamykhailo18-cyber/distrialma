import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: Request) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes") || new Date().toISOString().slice(0, 7); // YYYY-MM
  const sucursales = searchParams.get("sucursales") || "1,2,6,7";

  const [year, month] = mes.split("-").map(Number);
  const desde = `${year}${String(month).padStart(2, "0")}01000000`;
  const hasta = month === 12
    ? `${year + 1}0101000000`
    : `${year}${String(month + 1).padStart(2, "0")}01000000`;

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");

    const sucList = sucursales.split(",").map((s) => `'${s.trim()}'`).join(",");

    // Product sales grouped by product + lista de precios
    const result = await pool.request()
      .input("desde", desde)
      .input("hasta", hasta)
      .query(`
        SELECT
          LTRIM(RTRIM(t.Producto)) AS sku,
          LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
          LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
          LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
          LTRIM(RTRIM(ISNULL(pr.Unidad, ''))) AS unidad,
          ISNULL(TRY_CAST(LTRIM(RTRIM(pr.Palabra2)) AS FLOAT), 0) AS pesoPorPieza,
          t.ListaPrecio AS lista,
          SUM(t.Cant) AS cantidad,
          SUM(t.Impo) AS totalVenta,
          SUM(CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS totalCosto,
          SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS ganancia,
          COUNT(*) AS transacciones
        FROM [${dbTransas}].dbo.Transas t
        LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
        OUTER APPLY (SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s WHERE s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '') AND s.Costo > 0) s
        LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = pr.Marca
        LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = pr.Rubro
        WHERE t.Tipo = 'I'
          AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
          AND LTRIM(RTRIM(t.Fechora)) >= @desde
          AND LTRIM(RTRIM(t.Fechora)) < @hasta
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND t.Cant > 0
        GROUP BY LTRIM(RTRIM(t.Producto)), LTRIM(RTRIM(ISNULL(pr.Nombre, ''))),
          LTRIM(RTRIM(ISNULL(m.[Desc], ''))), LTRIM(RTRIM(ISNULL(r.[Desc], ''))),
          LTRIM(RTRIM(ISNULL(pr.Unidad, ''))), ISNULL(TRY_CAST(LTRIM(RTRIM(pr.Palabra2)) AS FLOAT), 0), t.ListaPrecio
        ORDER BY SUM(t.Impo) DESC
      `);

    // Summary totals by sucursal
    const totales = await pool.request()
      .input("desde", desde)
      .input("hasta", hasta)
      .query(`
        SELECT
          LTRIM(RTRIM(t.Sucursal)) AS sucursal,
          COUNT(DISTINCT CASE WHEN t.Tipo = 'V' THEN t.Boleta END) AS cantVentas,
          SUM(CASE WHEN t.Tipo = 'I' THEN t.Impo ELSE 0 END) AS totalVenta,
          SUM(CASE WHEN t.Tipo = 'I' THEN CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END ELSE 0 END) AS totalCosto,
          SUM(CASE WHEN t.Tipo = 'I' THEN t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END ELSE 0 END) AS ganancia
        FROM [${dbTransas}].dbo.Transas t
        OUTER APPLY (SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s WHERE s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '') AND s.Costo > 0) s
        WHERE LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
          AND LTRIM(RTRIM(t.Fechora)) >= @desde
          AND LTRIM(RTRIM(t.Fechora)) < @hasta
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND t.Cant > 0
        GROUP BY LTRIM(RTRIM(t.Sucursal))
      `);

    // Top rubros
    const rubros = await pool.request()
      .input("desde", desde)
      .input("hasta", hasta)
      .query(`
        SELECT TOP 15
          LTRIM(RTRIM(ISNULL(r.[Desc], 'Sin rubro'))) AS rubro,
          SUM(t.Impo) AS totalVenta,
          SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS ganancia
        FROM [${dbTransas}].dbo.Transas t
        LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
        OUTER APPLY (SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s WHERE s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '') AND s.Costo > 0) s
        LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = pr.Rubro
        WHERE t.Tipo = 'I'
          AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
          AND LTRIM(RTRIM(t.Fechora)) >= @desde
          AND LTRIM(RTRIM(t.Fechora)) < @hasta
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND t.Cant > 0
        GROUP BY LTRIM(RTRIM(ISNULL(r.[Desc], 'Sin rubro')))
        ORDER BY SUM(t.Impo) DESC
      `);

    // Top marcas
    const marcas = await pool.request()
      .input("desde", desde)
      .input("hasta", hasta)
      .query(`
        SELECT TOP 15
          LTRIM(RTRIM(ISNULL(m.[Desc], 'Sin marca'))) AS marca,
          SUM(t.Impo) AS totalVenta,
          SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS ganancia
        FROM [${dbTransas}].dbo.Transas t
        LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
        OUTER APPLY (SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s WHERE s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '') AND s.Costo > 0) s
        LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = pr.Marca
        WHERE t.Tipo = 'I'
          AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
          AND LTRIM(RTRIM(t.Fechora)) >= @desde
          AND LTRIM(RTRIM(t.Fechora)) < @hasta
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND t.Cant > 0
        GROUP BY LTRIM(RTRIM(ISNULL(m.[Desc], 'Sin marca')))
        ORDER BY SUM(t.Impo) DESC
      `);

    const LISTA_LABELS: Record<number, string> = { 1: "Minorista", 2: "Mayorista", 3: "Especial", 4: "Caja Cerrada", 5: "PedidosYa" };

    // Group products: merge listas into one product row
    const productMap = new Map<string, {
      sku: string; nombre: string; marca: string; rubro: string; unidad: string; pesoPorPieza: number;
      listas: Record<number, { cantidad: number; totalVenta: number; ganancia: number }>;
      totalVenta: number; totalCosto: number; ganancia: number; cantidad: number;
    }>();

    for (const row of result.recordset) {
      const key = row.sku;
      if (!productMap.has(key)) {
        productMap.set(key, {
          sku: row.sku, nombre: row.nombre, marca: row.marca, rubro: row.rubro,
          unidad: row.unidad || "", pesoPorPieza: Number(row.pesoPorPieza) || 0,
          listas: {}, totalVenta: 0, totalCosto: 0, ganancia: 0, cantidad: 0,
        });
      }
      const p = productMap.get(key)!;
      p.listas[row.lista] = {
        cantidad: Number(row.cantidad),
        totalVenta: Number(row.totalVenta),
        ganancia: Number(row.ganancia),
      };
      p.totalVenta += Number(row.totalVenta);
      p.totalCosto += Number(row.totalCosto);
      p.ganancia += Number(row.ganancia);
      p.cantidad += Number(row.cantidad);
    }

    const productos = Array.from(productMap.values()).map((p) => ({
      ...p,
      margen: p.totalVenta > 0 ? ((p.ganancia / p.totalVenta) * 100).toFixed(1) : "0",
      unidadesAprox: p.unidad === "KG" && p.pesoPorPieza > 0 ? Math.round(p.cantidad / p.pesoPorPieza) : null,
      listas: Object.entries(p.listas).map(([lista, data]) => ({
        lista: Number(lista),
        listaName: LISTA_LABELS[Number(lista)] || `Lista ${lista}`,
        ...data,
      })),
    }));

    return NextResponse.json({
      mes,
      sucursales: sucursales.split(",").map((s) => s.trim()),
      totales: totales.recordset.map((t: { sucursal: string; cantVentas: number; totalVenta: number; totalCosto: number; ganancia: number }) => ({
        sucursal: t.sucursal,
        cantVentas: t.cantVentas,
        totalVenta: Number(t.totalVenta),
        totalCosto: Number(t.totalCosto),
        ganancia: Number(t.ganancia),
        margen: Number(t.totalVenta) > 0 ? ((Number(t.ganancia) / Number(t.totalVenta)) * 100).toFixed(1) : "0",
      })),
      rubros: rubros.recordset.map((r: { rubro: string; totalVenta: number; ganancia: number }) => ({
        rubro: r.rubro, totalVenta: Number(r.totalVenta), ganancia: Number(r.ganancia),
      })),
      marcas: marcas.recordset.map((m: { marca: string; totalVenta: number; ganancia: number }) => ({
        marca: m.marca, totalVenta: Number(m.totalVenta), ganancia: Number(m.ganancia),
      })),
      productos,
    });
  } catch (error) {
    console.error("Error resumen productos:", error);
    return NextResponse.json({ error: "Error al generar resumen" }, { status: 500 });
  }
}
