import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const ANULADO_FILTER = `AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')`;

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const sku = searchParams.get("sku");
    if (!sku) {
      return NextResponse.json(
        { error: "El parámetro 'sku' es requerido" },
        { status: 400 }
      );
    }

    const meses = Math.min(Math.max(parseInt(searchParams.get("meses") || "6") || 6, 1), 36);

    // Calculate date range: N months back from today
    const now = new Date(
      new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" })
    );
    const hastaYear = now.getFullYear();
    let hastaMonth = now.getMonth() + 2; // next month start
    let hastaYearAdj = hastaYear;
    if (hastaMonth > 12) {
      hastaMonth = 1;
      hastaYearAdj++;
    }
    const hasta = `${hastaYearAdj}${String(hastaMonth).padStart(2, "0")}01000000`;

    let desdeYear = now.getFullYear();
    let desdeMonth = now.getMonth() + 1 - meses;
    while (desdeMonth < 1) {
      desdeMonth += 12;
      desdeYear--;
    }
    const desde = `${desdeYear}${String(desdeMonth).padStart(2, "0")}01000000`;

    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");
    const dbClientes = getDbName("clientes");

    // ── 1. Product info + stock ──
    const productoQuery = `
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
        LTRIM(RTRIM(p.Unidad)) AS unidad,
        ISNULL(s.Precio, 0) AS p1,
        ISNULL(s.Precio2, 0) AS p2,
        ISNULL(s.Precio3, 0) AS p3,
        ISNULL(s.Precio4, 0) AS p4,
        ISNULL(s.Precio5, 0) AS p5,
        ISNULL(s.Stk, 0) AS stockActual,
        ISNULL(s.Costo, 0) AS costoUnit
      FROM [${dbProd}].dbo.Productos p
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      LEFT JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
      WHERE LTRIM(RTRIM(p.Cod)) = @sku
    `;

    // ── 2. Monthly sales breakdown ──
    const ventasMensualesQuery = `
      SELECT
        SUBSTRING(t.Fechora, 1, 6) AS yyyymm,
        SUM(t.Cant) AS cantidad,
        SUM(t.Impo) AS totalVenta,
        SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(sc.Costo, 0) ELSE t.Costo END) AS ganancia
      FROM [${dbTransas}].dbo.Transas t
      OUTER APPLY (
        SELECT TOP 1 s.Costo
        FROM [${dbProd}].dbo.Stock s
        WHERE s.CodProducto = t.Producto
          AND LTRIM(RTRIM(s.Deposito)) = '0'
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND s.Costo > 0
      ) sc
      WHERE t.Tipo = 'I'
        AND LTRIM(RTRIM(t.Producto)) = @sku
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        AND t.Cant > 0
        ${ANULADO_FILTER}
      GROUP BY SUBSTRING(t.Fechora, 1, 6)
      ORDER BY yyyymm
    `;

    // ── 3. Sales by sucursal ──
    const porSucursalQuery = `
      SELECT
        LTRIM(RTRIM(t.Sucursal)) AS sucursal,
        SUM(t.Cant) AS cantidad,
        SUM(t.Impo) AS totalVenta,
        SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(sc.Costo, 0) ELSE t.Costo END) AS ganancia
      FROM [${dbTransas}].dbo.Transas t
      OUTER APPLY (
        SELECT TOP 1 s.Costo
        FROM [${dbProd}].dbo.Stock s
        WHERE s.CodProducto = t.Producto
          AND LTRIM(RTRIM(s.Deposito)) = '0'
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND s.Costo > 0
      ) sc
      WHERE t.Tipo = 'I'
        AND LTRIM(RTRIM(t.Producto)) = @sku
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        AND t.Cant > 0
        ${ANULADO_FILTER}
      GROUP BY LTRIM(RTRIM(t.Sucursal))
      ORDER BY totalVenta DESC
    `;

    // ── 4. Sales by price list ──
    const porListaQuery = `
      SELECT
        t.ListaPrecio AS lista,
        SUM(t.Cant) AS cantidad,
        SUM(t.Impo) AS totalVenta,
        SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(sc.Costo, 0) ELSE t.Costo END) AS ganancia
      FROM [${dbTransas}].dbo.Transas t
      OUTER APPLY (
        SELECT TOP 1 s.Costo
        FROM [${dbProd}].dbo.Stock s
        WHERE s.CodProducto = t.Producto
          AND LTRIM(RTRIM(s.Deposito)) = '0'
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND s.Costo > 0
      ) sc
      WHERE t.Tipo = 'I'
        AND LTRIM(RTRIM(t.Producto)) = @sku
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        AND t.Cant > 0
        ${ANULADO_FILTER}
      GROUP BY t.ListaPrecio
      ORDER BY lista
    `;

    // ── 5. Top 10 clients for this product ──
    const topClientesQuery = `
      SELECT TOP 10
        LTRIM(RTRIM(t.Cliente)) AS clienteCod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        SUM(t.Cant) AS cantidad,
        SUM(t.Impo) AS totalVenta
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbClientes}].dbo.Clientes c
        ON LTRIM(RTRIM(c.Cod)) COLLATE Modern_Spanish_CI_AS = LTRIM(RTRIM(t.Cliente)) COLLATE Modern_Spanish_CI_AS
      WHERE t.Tipo = 'I'
        AND LTRIM(RTRIM(t.Producto)) = @sku
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        AND t.Cant > 0
        ${ANULADO_FILTER}
        AND LTRIM(RTRIM(t.Cliente)) <> ''
      GROUP BY LTRIM(RTRIM(t.Cliente)), LTRIM(RTRIM(c.Nombre))
      ORDER BY totalVenta DESC
    `;

    // ── Execute all queries in parallel ──
    const [
      productoRes,
      ventasMensualesRes,
      porSucursalRes,
      porListaRes,
      topClientesRes,
    ] = await Promise.all([
      pool.request().input("sku", sku).query(productoQuery),
      pool.request().input("sku", sku).input("desde", desde).input("hasta", hasta).query(ventasMensualesQuery),
      pool.request().input("sku", sku).input("desde", desde).input("hasta", hasta).query(porSucursalQuery),
      pool.request().input("sku", sku).input("desde", desde).input("hasta", hasta).query(porListaQuery),
      pool.request().input("sku", sku).input("desde", desde).input("hasta", hasta).query(topClientesQuery),
    ]);

    // ── Format: producto ──
    const pRow = productoRes.recordset[0];
    if (!pRow) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const producto = {
      sku: pRow.sku || "",
      nombre: pRow.nombre || "",
      marca: pRow.marca || "",
      rubro: pRow.rubro || "",
      unidad: pRow.unidad || "",
      stockActual: Number(pRow.stockActual) || 0,
      costoUnit: Number(pRow.costoUnit) || 0,
      precios: {
        p1: Number(pRow.p1) || 0,
        p2: Number(pRow.p2) || 0,
        p3: Number(pRow.p3) || 0,
        p4: Number(pRow.p4) || 0,
        p5: Number(pRow.p5) || 0,
      },
    };

    // ── Format: ventas mensuales ──
    const ventasMensuales = ventasMensualesRes.recordset.map((r) => ({
      mes: `${r.yyyymm.substring(0, 4)}-${r.yyyymm.substring(4, 6)}`,
      cantidad: Number(r.cantidad) || 0,
      totalVenta: Number(r.totalVenta) || 0,
      ganancia: Number(r.ganancia) || 0,
    }));

    // ── Format: por sucursal ──
    const porSucursal = porSucursalRes.recordset.map((r) => ({
      sucursal: r.sucursal || "",
      cantidad: Number(r.cantidad) || 0,
      totalVenta: Number(r.totalVenta) || 0,
      ganancia: Number(r.ganancia) || 0,
    }));

    // ── Format: por lista ──
    const porLista = porListaRes.recordset.map((r) => ({
      lista: Number(r.lista) || 0,
      cantidad: Number(r.cantidad) || 0,
      totalVenta: Number(r.totalVenta) || 0,
      ganancia: Number(r.ganancia) || 0,
    }));

    // ── Format: top clientes ──
    const topClientes = topClientesRes.recordset.map((r) => ({
      clienteCod: r.clienteCod || "",
      nombre: r.nombre || "Sin nombre",
      cantidad: Number(r.cantidad) || 0,
      totalVenta: Number(r.totalVenta) || 0,
    }));

    return NextResponse.json({
      producto,
      ventasMensuales,
      porSucursal,
      porLista,
      topClientes,
    });
  } catch (error) {
    console.error("Dashboard producto API error:", error);
    return NextResponse.json(
      { error: "Error al cargar datos del producto" },
      { status: 500 }
    );
  }
}
