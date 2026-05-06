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
    const codRaw = searchParams.get("cod");
    if (!codRaw) {
      return NextResponse.json({ error: "Falta parametro cod" }, { status: 400 });
    }
    const cod = codRaw.trim();
    const meses = Math.min(Math.max(Number(searchParams.get("meses")) || 6, 1), 36);

    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");
    const dbClientes = getDbName("clientes");
    const dbVarios = getDbName("transas").replace("BDTRANSAS", "BDVARIOS");

    // Date range: N months back from today
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const hastaYear = now.getFullYear();
    const hastaMonth = now.getMonth() + 2; // next month start
    let hastaY = hastaYear;
    let hastaM = hastaMonth;
    if (hastaM > 12) { hastaM -= 12; hastaY++; }
    const hasta = `${hastaY}${String(hastaM).padStart(2, "0")}01000000`;

    const desdeDate = new Date(now.getFullYear(), now.getMonth() - meses, 1);
    const desde = `${desdeDate.getFullYear()}${String(desdeDate.getMonth() + 1).padStart(2, "0")}01000000`;

    const clienteFilter = `AND LTRIM(RTRIM(t.Cliente)) COLLATE Modern_Spanish_CI_AS = @cod COLLATE Modern_Spanish_CI_AS`;

    // ── 1. Client info ──
    const clienteQuery = `
      SELECT TOP 1
        LTRIM(RTRIM(c.Cod)) AS cod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        LTRIM(RTRIM(c.Calle)) AS calle,
        LTRIM(RTRIM(c.TelClave1)) AS telefono,
        LTRIM(RTRIM(c.CUIT)) AS cuit,
        CASE WHEN ISNULL(c.FillerBit2, 0) = 1 THEN ISNULL(c.Saldo, 0) * 100 ELSE ISNULL(c.Saldo, 0) END AS saldo,
        c.FechaAlta AS fechaAlta
      FROM [${dbClientes}].dbo.Clientes c
      WHERE LTRIM(RTRIM(c.Cod)) COLLATE Modern_Spanish_CI_AS = @cod COLLATE Modern_Spanish_CI_AS
    `;

    // ── 2. Compras mensuales ──
    const comprasMensualesQuery = `
      SELECT
        SUBSTRING(t.Fechora, 1, 4) + '-' + SUBSTRING(t.Fechora, 5, 2) AS mes,
        COUNT(DISTINCT t.Boleta) AS cantCompras,
        SUM(t.Impo) AS totalVenta,
        SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS ganancia
      FROM [${dbTransas}].dbo.Transas t
      OUTER APPLY (
        SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s
        WHERE s.CodProducto = t.Producto
          AND LTRIM(RTRIM(s.Deposito)) = '0'
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND s.Costo > 0
      ) s
      WHERE t.Tipo = 'I'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${clienteFilter}
        ${ANULADO_FILTER}
        AND t.Cant > 0
      GROUP BY SUBSTRING(t.Fechora, 1, 4) + '-' + SUBSTRING(t.Fechora, 5, 2)
      ORDER BY mes
    `;

    // ── 3. Top productos ──
    const topProductosQuery = `
      SELECT TOP 15
        LTRIM(RTRIM(t.Producto)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        SUM(t.Cant) AS cantidad,
        SUM(t.Impo) AS totalVenta
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos p ON LTRIM(RTRIM(p.Cod)) = LTRIM(RTRIM(t.Producto))
      WHERE t.Tipo = 'I'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${clienteFilter}
        ${ANULADO_FILTER}
        AND t.Cant > 0
      GROUP BY LTRIM(RTRIM(t.Producto)), LTRIM(RTRIM(p.Nombre))
      ORDER BY cantidad DESC
    `;

    // ── 4. Metodos de pago ──
    const metodosPagoQuery = `
      SELECT
        LTRIM(RTRIM(t.CodTarjeta)) AS codTarjeta,
        LTRIM(RTRIM(ISNULL(tj.[Desc], ''))) AS nombreTarjeta,
        SUM(t.Tarjeta) AS total,
        COUNT(DISTINCT t.Boleta) AS cantidad
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbVarios}].dbo.Tarjetas tj ON LTRIM(RTRIM(tj.Cod)) COLLATE Modern_Spanish_CI_AS = LTRIM(RTRIM(t.CodTarjeta)) COLLATE Modern_Spanish_CI_AS
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${clienteFilter}
        ${ANULADO_FILTER}
        AND t.Tarjeta > 0
      GROUP BY LTRIM(RTRIM(t.CodTarjeta)), LTRIM(RTRIM(ISNULL(tj.[Desc], '')))
      ORDER BY total DESC
    `;

    const efectivoQuery = `
      SELECT
        SUM(t.Efectivo) AS total,
        COUNT(DISTINCT t.Boleta) AS cantidad
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${clienteFilter}
        ${ANULADO_FILTER}
        AND t.Efectivo > 0
    `;

    // ── 5. Ultimas compras ──
    const ultimasComprasQuery = `
      SELECT TOP 10
        LTRIM(RTRIM(t.Boleta)) AS boleta,
        t.Fechora AS fecha,
        t.Impo AS total,
        (SELECT COUNT(*) FROM [${dbTransas}].dbo.Transas t2
          WHERE t2.Tipo = 'I' AND t2.Boleta = t.Boleta
          AND (t2.Anulado IS NULL OR LTRIM(RTRIM(t2.Anulado)) = '' OR t2.Anulado = ' ')
        ) AS cantItems
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        ${clienteFilter}
        ${ANULADO_FILTER}
      ORDER BY t.Fechora DESC
    `;

    // ── Execute all queries in parallel ──
    const [
      clienteRes,
      comprasMensualesRes,
      topProductosRes,
      metodosPagoRes,
      efectivoRes,
      ultimasComprasRes,
    ] = await Promise.all([
      pool.request().input("cod", cod).query(clienteQuery),
      pool.request().input("cod", cod).input("desde", desde).input("hasta", hasta).query(comprasMensualesQuery),
      pool.request().input("cod", cod).input("desde", desde).input("hasta", hasta).query(topProductosQuery),
      pool.request().input("cod", cod).input("desde", desde).input("hasta", hasta).query(metodosPagoQuery),
      pool.request().input("cod", cod).input("desde", desde).input("hasta", hasta).query(efectivoQuery),
      pool.request().input("cod", cod).query(ultimasComprasQuery),
    ]);

    // ── Format: cliente ──
    const cRow = clienteRes.recordset[0];
    if (!cRow) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }
    const cliente = {
      cod: cRow.cod || "",
      nombre: cRow.nombre || "",
      calle: cRow.calle || "",
      telefono: cRow.telefono || "",
      cuit: cRow.cuit || "",
      saldo: Number(cRow.saldo) || 0,
      fechaAlta: cRow.fechaAlta || "",
    };

    // ── Format: compras mensuales ──
    const comprasMensuales = comprasMensualesRes.recordset.map((r) => ({
      mes: r.mes,
      cantCompras: Number(r.cantCompras) || 0,
      totalVenta: Number(r.totalVenta) || 0,
      ganancia: Number(r.ganancia) || 0,
    }));

    // ── Format: top productos ──
    const topProductos = topProductosRes.recordset.map((r) => ({
      sku: r.sku || "",
      nombre: r.nombre || "",
      cantidad: Number(r.cantidad) || 0,
      totalVenta: Number(r.totalVenta) || 0,
    }));

    // ── Format: metodos de pago ──
    const metodosPago = metodosPagoRes.recordset.map((r) => ({
      nombre: r.nombreTarjeta || `Tarjeta ${r.codTarjeta}`,
      total: Number(r.total) || 0,
      cantidad: Number(r.cantidad) || 0,
    }));

    const efRow = efectivoRes.recordset[0];
    if (efRow && Number(efRow.total) > 0) {
      metodosPago.unshift({
        nombre: "Efectivo",
        total: Number(efRow.total) || 0,
        cantidad: Number(efRow.cantidad) || 0,
      });
    }

    // ── Format: ultimas compras ──
    const ultimasCompras = ultimasComprasRes.recordset.map((r) => ({
      boleta: r.boleta || "",
      fecha: r.fecha || "",
      total: Number(r.total) || 0,
      cantItems: Number(r.cantItems) || 0,
    }));

    return NextResponse.json({
      cliente,
      comprasMensuales,
      topProductos,
      metodosPago,
      ultimasCompras,
    });
  } catch (error) {
    console.error("Dashboard cliente API error:", error);
    return NextResponse.json(
      { error: "Error al cargar datos del cliente" },
      { status: 500 }
    );
  }
}
