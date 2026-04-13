import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const ANULADO_FILTER = `AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')`;

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const semanas = Math.max(1, parseInt(searchParams.get("semanas") || "4"));
    const proveedorFilter = searchParams.get("proveedor") || "";
    const deposito = searchParams.get("deposito") || "0";
    const loadAll = searchParams.get("all") === "1";

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const dbTransas = getDbName("transas");

    // If no proveedor specified and not loading all, return just the supplier summary (fast)
    if (!proveedorFilter && !loadAll) {
      const summary = await pool.request().input("dep", deposito).query(`
        SELECT
          LTRIM(RTRIM(s.Proveedor1)) AS provCod,
          LTRIM(RTRIM(pv.Nombre)) AS provNombre,
          COUNT(*) AS cantProductos
        FROM [${dbProd}].dbo.Stock s
        JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        LEFT JOIN [${dbProd}].dbo.Proveedores pv ON pv.Cod = s.Proveedor1
        WHERE LTRIM(RTRIM(s.Deposito)) = @dep
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND s.Precio2 > 0
          AND LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) != ''
        GROUP BY LTRIM(RTRIM(s.Proveedor1)), LTRIM(RTRIM(pv.Nombre))
        ORDER BY LTRIM(RTRIM(pv.Nombre))
      `);

      // Also count web-only mappings
      const webMappings = await prisma.productoProveedor.groupBy({
        by: ["proveedorCod", "proveedorName"],
        _count: true,
      });

      const provMap = new Map<string, { cod: string; nombre: string; cantProductos: number }>();
      for (const r of summary.recordset) {
        provMap.set(r.provCod, { cod: r.provCod, nombre: r.provNombre || `Prov ${r.provCod}`, cantProductos: Number(r.cantProductos) });
      }
      for (const w of webMappings) {
        const existing = provMap.get(w.proveedorCod);
        if (existing) {
          existing.cantProductos += w._count;
        } else {
          provMap.set(w.proveedorCod, { cod: w.proveedorCod, nombre: w.proveedorName, cantProductos: w._count });
        }
      }

      return NextResponse.json({
        mode: "summary",
        proveedores: Array.from(provMap.values()).sort((a, b) => a.nombre.localeCompare(b.nombre)),
      });
    }

    // 1. Get all products with stock + proveedor from PunTouch directly
    const provFilter = proveedorFilter ? `AND (LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) = @prov OR LTRIM(RTRIM(ISNULL(s.Proveedor2,''))) = @prov OR LTRIM(RTRIM(ISNULL(s.Proveedor3,''))) = @prov)` : `AND LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) != ''`;

    const stockReq = pool.request().input("dep", deposito);
    if (proveedorFilter) stockReq.input("prov", proveedorFilter);

    const stockResult = await stockReq.query(`
      SELECT
        LTRIM(RTRIM(s.CodProducto)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad,
        s.Stk AS stockActual,
        s.Costo AS costoUnit,
        LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) AS prov1,
        LTRIM(RTRIM(ISNULL(s.Proveedor2,''))) AS prov2,
        LTRIM(RTRIM(ISNULL(s.Proveedor3,''))) AS prov3
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = @dep
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Precio2 > 0
        ${provFilter}
    `);

    // Also get web mappings from PostgreSQL
    const webMappings = await prisma.productoProveedor.findMany({
      where: proveedorFilter ? { proveedorCod: proveedorFilter } : undefined,
    });

    // Get stock for web-mapped products not already in PunTouch results
    const ptSkus = new Set(stockResult.recordset.map((r: { sku: string }) => r.sku));
    const webOnlySkus = webMappings.filter((m) => !ptSkus.has(m.sku)).map((m) => m.sku);

    if (webOnlySkus.length > 0) {
      const webStockReq = pool.request().input("dep", deposito);
      const placeholders = webOnlySkus.map((sku, i) => {
        webStockReq.input(`ws${i}`, sku.padStart(7, " "));
        return `@ws${i}`;
      });
      const webStockResult = await webStockReq.query(`
        SELECT
          LTRIM(RTRIM(s.CodProducto)) AS sku,
          LTRIM(RTRIM(p.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad,
          s.Stk AS stockActual,
          s.Costo AS costoUnit,
          '' AS prov1, '' AS prov2, '' AS prov3
        FROM [${dbProd}].dbo.Stock s
        JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        WHERE LTRIM(RTRIM(s.Deposito)) = @dep
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND s.CodProducto IN (${placeholders.join(",")})
      `);
      // Add to stockResult, tag with web proveedor
      for (const r of webStockResult.recordset) {
        const mapping = webMappings.find((m) => m.sku === r.sku);
        if (mapping) {
          r.prov1 = mapping.proveedorCod;
          stockResult.recordset.push(r);
        }
      }
    }

    if (stockResult.recordset.length === 0) {
      return NextResponse.json({ proveedores: [] });
    }

    // 2. Get proveedor names
    const provNamesResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbProd}].dbo.Proveedores
    `);
    const provNames = new Map<string, string>();
    for (const r of provNamesResult.recordset) {
      provNames.set(r.cod, r.nombre);
    }

    // 3. Group products by proveedor1 (primary supplier)
    const proveedorMap = new Map<string, Array<{ sku: string; nombre: string; unidad: string; stockActual: number; costoUnit: number }>>();

    for (const r of stockResult.recordset) {
      const provCod = proveedorFilter || r.prov1;
      if (!provCod) continue;
      if (!proveedorMap.has(provCod)) proveedorMap.set(provCod, []);
      proveedorMap.get(provCod)!.push({
        sku: r.sku,
        nombre: r.nombre,
        unidad: r.unidad,
        stockActual: Number(r.stockActual),
        costoUnit: Number(r.costoUnit),
      });
    }

    // 4. Query weekly sales for all SKUs in one batch
    const allSkus = stockResult.recordset.map((r: { sku: string }) => r.sku);
    const since = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    since.setDate(since.getDate() - semanas * 7);
    const sinceStr = `${since.getFullYear()}${String(since.getMonth() + 1).padStart(2, "0")}${String(since.getDate()).padStart(2, "0")}000000`;

    // Build SKU list for IN clause (batch in groups of 500 to avoid param limits)
    const salesMap = new Map<string, number>();
    for (let i = 0; i < allSkus.length; i += 500) {
      const batch = allSkus.slice(i, i + 500);
      const salesReq = pool.request().input("desde", sinceStr).input("semanas", semanas);
      const placeholders = batch.map((sku: string, j: number) => {
        salesReq.input(`p${j}`, sku.padStart(7, " "));
        return `@p${j}`;
      });

      const salesResult = await salesReq.query(`
        SELECT
          LTRIM(RTRIM(t.Producto)) AS sku,
          SUM(t.Cant) / @semanas AS ventaSemanal
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'I'
          AND t.Fechora >= @desde
          ${ANULADO_FILTER}
          AND t.Cant > 0
          AND t.Producto IN (${placeholders.join(",")})
        GROUP BY LTRIM(RTRIM(t.Producto))
      `);

      for (const r of salesResult.recordset) {
        salesMap.set(r.sku, Number(r.ventaSemanal));
      }
    }

    // 5. Build results
    const proveedores = Array.from(proveedorMap.entries()).map(([provCod, productos]) => {
      const items = productos.map((p) => {
        const ventaSemanal = salesMap.get(p.sku) || 0;
        const sugerido = Math.max(0, Math.ceil(ventaSemanal * 1.2 - p.stockActual));
        const costoTotal = sugerido * p.costoUnit;
        return {
          ...p,
          ventaSemanal: Math.round(ventaSemanal * 100) / 100,
          sugerido,
          costoTotal: Math.round(costoTotal * 100) / 100,
        };
      });

      return {
        cod: provCod,
        nombre: provNames.get(provCod) || `Proveedor ${provCod}`,
        totalSugerido: Math.round(items.reduce((s, p) => s + p.costoTotal, 0) * 100) / 100,
        productos: items.sort((a, b) => b.sugerido - a.sugerido),
      };
    }).sort((a, b) => b.totalSugerido - a.totalSugerido);

    return NextResponse.json({ proveedores });
  } catch (error) {
    console.error("Error en reposicion:", error);
    return NextResponse.json({ error: "Error al calcular reposicion" }, { status: 500 });
  }
}
