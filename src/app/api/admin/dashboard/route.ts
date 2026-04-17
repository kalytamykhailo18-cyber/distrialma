import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const DIAS_SEMANA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"] as const;

function mesParam(searchParams: URLSearchParams): { desde: string; hasta: string; desdeAnterior: string; hastaAnterior: string; mesLabel: string } {
  const mes = searchParams.get("mes"); // YYYY-MM
  let year: number, month: number;
  if (mes && /^\d{4}-\d{2}$/.test(mes)) {
    [year, month] = mes.split("-").map(Number);
  } else {
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    year = now.getFullYear();
    month = now.getMonth() + 1;
  }

  const desde = `${year}${String(month).padStart(2, "0")}01000000`;
  // Next month start
  let hastaYear = year;
  let hastaMonth = month + 1;
  if (hastaMonth > 12) { hastaMonth = 1; hastaYear++; }
  const hasta = `${hastaYear}${String(hastaMonth).padStart(2, "0")}01000000`;

  // Previous month
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth < 1) { prevMonth = 12; prevYear--; }
  const desdeAnterior = `${prevYear}${String(prevMonth).padStart(2, "0")}01000000`;
  const hastaAnterior = desde;

  return { desde, hasta, desdeAnterior, hastaAnterior, mesLabel: `${year}-${String(month).padStart(2, "0")}` };
}

function buildSucList(searchParams: URLSearchParams): string {
  const raw = searchParams.get("sucursales") || "1,2,6,7";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `'${s}'`)
    .join(",");
}

const ANULADO_FILTER = `AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')`;

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const { desde, hasta, desdeAnterior, hastaAnterior } = mesParam(searchParams);
    const sucList = buildSucList(searchParams);

    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");
    const dbClientes = getDbName("clientes");
    const dbEmpleados = getDbName("empleados");
    const dbVarios = getDbName("transas").replace("BDTRANSAS", "BDVARIOS");

    const sucFilter = `AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})`;

    // ── 1. Ventas diarias (mes actual + mes anterior) ──
    const ventasDiariasQuery = `
      SELECT
        SUBSTRING(t.Fechora, 7, 2) AS dia,
        SUM(t.Impo) AS total,
        COUNT(DISTINCT t.Boleta) AS cantidad
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${sucFilter}
        ${ANULADO_FILTER}
      GROUP BY SUBSTRING(t.Fechora, 7, 2)
      ORDER BY dia
    `;

    const ventasDiariasAnteriorQuery = `
      SELECT
        SUBSTRING(t.Fechora, 7, 2) AS dia,
        SUM(t.Impo) AS total,
        COUNT(DISTINCT t.Boleta) AS cantidad
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desdeAnt AND t.Fechora < @hastaAnt
        ${sucFilter}
        ${ANULADO_FILTER}
      GROUP BY SUBSTRING(t.Fechora, 7, 2)
      ORDER BY dia
    `;

    // ── 2. Top clientes ──
    const topClientesQuery = `
      SELECT TOP 20
        LTRIM(RTRIM(t.Cliente)) AS clienteCod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        SUM(t.Impo) AS total,
        COUNT(DISTINCT t.Boleta) AS cantCompras,
        MAX(t.Fechora) AS ultimaCompra
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbClientes}].dbo.Clientes c ON LTRIM(RTRIM(c.Cod)) COLLATE Modern_Spanish_CI_AS = LTRIM(RTRIM(t.Cliente)) COLLATE Modern_Spanish_CI_AS
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${sucFilter}
        ${ANULADO_FILTER}
        AND LTRIM(RTRIM(t.Cliente)) <> ''
      GROUP BY LTRIM(RTRIM(t.Cliente)), LTRIM(RTRIM(c.Nombre))
      ORDER BY total DESC
    `;

    // ── 3. Metodos de pago ──
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
        ${sucFilter}
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
        ${sucFilter}
        ${ANULADO_FILTER}
        AND t.Efectivo > 0
    `;

    // ── 4. Empleados ──
    const empleadosQuery = `
      SELECT TOP 50
        LTRIM(RTRIM(t.Empleado)) AS empleadoCod,
        LTRIM(RTRIM(e.Nombre)) AS nombre,
        SUM(t.Impo) AS totalVenta,
        COUNT(DISTINCT t.Boleta) AS cantTickets
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbEmpleados}].dbo.Empleados e ON LTRIM(RTRIM(e.Cod)) COLLATE Modern_Spanish_CI_AS = LTRIM(RTRIM(t.Empleado)) COLLATE Modern_Spanish_CI_AS
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${sucFilter}
        ${ANULADO_FILTER}
        AND LTRIM(RTRIM(t.Empleado)) <> ''
      GROUP BY LTRIM(RTRIM(t.Empleado)), LTRIM(RTRIM(e.Nombre))
      ORDER BY totalVenta DESC
    `;

    // ── 5. Comparativo (mes actual vs anterior) ──
    // Use item rows (Tipo='I') for accurate ventas/ganancia, headers for ticket/client counts
    const comparativoActualQuery = `
      SELECT
        (SELECT SUM(t2.Impo) FROM [${dbTransas}].dbo.Transas t2
          WHERE t2.Tipo = 'I' AND t2.Fechora >= @desde AND t2.Fechora < @hasta
          ${sucFilter.replace(/t\./g, 't2.')} ${ANULADO_FILTER.replace(/t\./g, 't2.')} AND t2.Cant > 0) AS ventas,
        (SELECT SUM(t2.Impo - CASE WHEN t2.Costo >= 999999 THEN t2.Cant * ISNULL(s2.Costo, 0) ELSE t2.Costo END)
          FROM [${dbTransas}].dbo.Transas t2
          OUTER APPLY (SELECT TOP 1 s2.Costo FROM [${dbProd}].dbo.Stock s2 WHERE s2.CodProducto = t2.Producto AND LTRIM(RTRIM(s2.Deposito)) = '0' AND (s2.TalleColor IS NULL OR LTRIM(RTRIM(s2.TalleColor)) = '') AND s2.Costo > 0) s2
          WHERE t2.Tipo = 'I' AND t2.Fechora >= @desde AND t2.Fechora < @hasta
          ${sucFilter.replace(/t\./g, 't2.')} ${ANULADO_FILTER.replace(/t\./g, 't2.')} AND t2.Cant > 0) AS ganancia,
        COUNT(DISTINCT t.Boleta) AS cantTickets,
        COUNT(DISTINCT LTRIM(RTRIM(t.Cliente))) AS clientesUnicos
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${sucFilter}
        ${ANULADO_FILTER}
    `;

    const comparativoAnteriorQuery = `
      SELECT
        (SELECT SUM(t2.Impo) FROM [${dbTransas}].dbo.Transas t2
          WHERE t2.Tipo = 'I' AND t2.Fechora >= @desdeAnt AND t2.Fechora < @hastaAnt
          ${sucFilter.replace(/t\./g, 't2.')} ${ANULADO_FILTER.replace(/t\./g, 't2.')} AND t2.Cant > 0) AS ventas,
        (SELECT SUM(t2.Impo - CASE WHEN t2.Costo >= 999999 THEN t2.Cant * ISNULL(s2.Costo, 0) ELSE t2.Costo END)
          FROM [${dbTransas}].dbo.Transas t2
          OUTER APPLY (SELECT TOP 1 s2.Costo FROM [${dbProd}].dbo.Stock s2 WHERE s2.CodProducto = t2.Producto AND LTRIM(RTRIM(s2.Deposito)) = '0' AND (s2.TalleColor IS NULL OR LTRIM(RTRIM(s2.TalleColor)) = '') AND s2.Costo > 0) s2
          WHERE t2.Tipo = 'I' AND t2.Fechora >= @desdeAnt AND t2.Fechora < @hastaAnt
          ${sucFilter.replace(/t\./g, 't2.')} ${ANULADO_FILTER.replace(/t\./g, 't2.')} AND t2.Cant > 0) AS ganancia,
        COUNT(DISTINCT t.Boleta) AS cantTickets,
        COUNT(DISTINCT LTRIM(RTRIM(t.Cliente))) AS clientesUnicos
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desdeAnt AND t.Fechora < @hastaAnt
        ${sucFilter}
        ${ANULADO_FILTER}
    `;

    // ── 6a. Comparativo por sucursal (desglose) ──
    const comparativoSucursalesQuery = `
      SELECT
        LTRIM(RTRIM(t.Sucursal)) AS sucursal,
        SUM(t.Impo) AS ventas,
        SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS ganancia,
        COUNT(DISTINCT t.Boleta) AS cantTickets
      FROM [${dbTransas}].dbo.Transas t
      OUTER APPLY (SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s WHERE s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '') AND s.Costo > 0) s
      WHERE t.Tipo = 'I'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${sucFilter}
        ${ANULADO_FILTER}
        AND t.Cant > 0
      GROUP BY LTRIM(RTRIM(t.Sucursal))
      ORDER BY SUM(t.Impo) DESC
    `;

    // ── 6b. Ranking productos por margen ──
    const topProductosMargenQuery = `
      SELECT TOP 20
        LTRIM(RTRIM(t.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        SUM(t.Cant) AS cantidad,
        SUM(t.Impo) AS totalVenta,
        SUM(CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS totalCosto,
        SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS ganancia
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos p ON p.Cod = t.Producto
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      OUTER APPLY (SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s WHERE s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '') AND s.Costo > 0) s
      WHERE t.Tipo = 'I'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${sucFilter}
        ${ANULADO_FILTER}
        AND t.Cant > 0
        AND t.Impo > 0
      GROUP BY LTRIM(RTRIM(t.Producto)), LTRIM(RTRIM(ISNULL(p.Nombre, ''))), LTRIM(RTRIM(ISNULL(m.[Desc], '')))
      HAVING SUM(t.Impo) > 0
      ORDER BY ganancia DESC
    `;

    // ── 7. Horarios pico ──
    const horariosPicoQuery = `
      SELECT
        CAST(SUBSTRING(t.Fechora, 9, 2) AS INT) AS hora,
        DATEPART(WEEKDAY, CAST(SUBSTRING(t.Fechora, 1, 4) + '-' + SUBSTRING(t.Fechora, 5, 2) + '-' + SUBSTRING(t.Fechora, 7, 2) AS DATE)) AS diaSemana,
        COUNT(DISTINCT t.Boleta) AS cantidad
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        ${sucFilter}
        ${ANULADO_FILTER}
      GROUP BY SUBSTRING(t.Fechora, 9, 2),
        DATEPART(WEEKDAY, CAST(SUBSTRING(t.Fechora, 1, 4) + '-' + SUBSTRING(t.Fechora, 5, 2) + '-' + SUBSTRING(t.Fechora, 7, 2) AS DATE))
      ORDER BY hora
    `;

    // ── Execute all queries in parallel ──
    const [
      ventasDiariasRes,
      ventasDiariasAntRes,
      topClientesRes,
      metodosPagoRes,
      efectivoRes,
      empleadosRes,
      compActualRes,
      compAnteriorRes,
      horariosPicoRes,
      topProductosMargenRes,
      comparativoSucursalesRes,
    ] = await Promise.all([
      pool.request().input("desde", desde).input("hasta", hasta).query(ventasDiariasQuery),
      pool.request().input("desdeAnt", desdeAnterior).input("hastaAnt", hastaAnterior).query(ventasDiariasAnteriorQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(topClientesQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(metodosPagoQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(efectivoQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(empleadosQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(comparativoActualQuery),
      pool.request().input("desdeAnt", desdeAnterior).input("hastaAnt", hastaAnterior).query(comparativoAnteriorQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(horariosPicoQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(topProductosMargenQuery),
      pool.request().input("desde", desde).input("hasta", hasta).query(comparativoSucursalesQuery),
    ]);

    // ── Format: ventas diarias ──
    const ventasDiarias = ventasDiariasRes.recordset.map((r) => ({
      dia: r.dia,
      total: Number(r.total) || 0,
      cantidad: Number(r.cantidad) || 0,
      ticketPromedio: r.cantidad > 0 ? Number(r.total) / Number(r.cantidad) : 0,
    }));

    const ventasDiariasMesAnterior = ventasDiariasAntRes.recordset.map((r) => ({
      dia: r.dia,
      total: Number(r.total) || 0,
      cantidad: Number(r.cantidad) || 0,
      ticketPromedio: r.cantidad > 0 ? Number(r.total) / Number(r.cantidad) : 0,
    }));

    // ── Format: top clientes ──
    const topClientes = topClientesRes.recordset.map((r) => ({
      clienteCod: r.clienteCod || "",
      nombre: r.nombre || "Sin nombre",
      total: Number(r.total) || 0,
      cantCompras: Number(r.cantCompras) || 0,
      ultimaCompra: r.ultimaCompra || "",
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

    // ── Format: empleados ──
    const empleados = empleadosRes.recordset.map((r) => {
      const totalVenta = Number(r.totalVenta) || 0;
      const cantTickets = Number(r.cantTickets) || 0;
      return {
        empleadoCod: r.empleadoCod || "",
        nombre: r.nombre || "Sin nombre",
        totalVenta,
        cantTickets,
        ticketPromedio: cantTickets > 0 ? totalVenta / cantTickets : 0,
      };
    });

    // ── Format: comparativo ──
    const actual = compActualRes.recordset[0] || {};
    const anterior = compAnteriorRes.recordset[0] || {};

    const ventasActual = Number(actual.ventas) || 0;
    const gananciaActual = Number(actual.ganancia) || 0;
    const ticketsActual = Number(actual.cantTickets) || 0;
    const clientesActual = Number(actual.clientesUnicos) || 0;
    const ticketPromedioActual = ticketsActual > 0 ? ventasActual / ticketsActual : 0;

    const ventasAnterior = Number(anterior.ventas) || 0;
    const gananciaAnterior = Number(anterior.ganancia) || 0;
    const ticketsAnterior = Number(anterior.cantTickets) || 0;
    const clientesAnterior = Number(anterior.clientesUnicos) || 0;
    const ticketPromedioAnterior = ticketsAnterior > 0 ? ventasAnterior / ticketsAnterior : 0;

    const pctChange = (curr: number, prev: number) =>
      prev > 0 ? ((curr - prev) / prev) * 100 : curr > 0 ? 100 : 0;

    const comparativo = {
      mesActual: {
        ventas: ventasActual,
        ganancia: gananciaActual,
        ticketPromedio: ticketPromedioActual,
        clientesUnicos: clientesActual,
      },
      mesAnterior: {
        ventas: ventasAnterior,
        ganancia: gananciaAnterior,
        ticketPromedio: ticketPromedioAnterior,
        clientesUnicos: clientesAnterior,
      },
      cambios: {
        ventas: pctChange(ventasActual, ventasAnterior),
        ganancia: pctChange(gananciaActual, gananciaAnterior),
        ticketPromedio: pctChange(ticketPromedioActual, ticketPromedioAnterior),
        clientesUnicos: pctChange(clientesActual, clientesAnterior),
      },
    };

    // ── Format: horarios pico ──
    // SQL Server DATEPART(WEEKDAY) returns 1=Sunday..7=Saturday
    const horaMap = new Map<number, Record<string, number>>();
    for (const r of horariosPicoRes.recordset) {
      const hora = Number(r.hora);
      const diaSemanaIdx = Number(r.diaSemana); // 1=Sunday
      const diaNombre = DIAS_SEMANA[diaSemanaIdx - 1]; // 0-indexed
      if (!horaMap.has(hora)) {
        horaMap.set(hora, { lunes: 0, martes: 0, miercoles: 0, jueves: 0, viernes: 0, sabado: 0, domingo: 0 });
      }
      const entry = horaMap.get(hora)!;
      entry[diaNombre] = Number(r.cantidad) || 0;
    }

    const horariosPico = Array.from(horaMap.entries())
      .filter(([hora]) => hora >= 6 && hora <= 23)
      .sort(([a], [b]) => a - b)
      .map(([hora, dias]) => ({ hora, ...dias }));

    // ── Format: top productos por margen ──
    const topProductosMargen = topProductosMargenRes.recordset.map((r: { sku: string; nombre: string; marca: string; cantidad: number; totalVenta: number; totalCosto: number; ganancia: number }) => {
      const totalVenta = Number(r.totalVenta) || 0;
      const ganancia = Number(r.ganancia) || 0;
      return {
        sku: r.sku,
        nombre: r.nombre,
        marca: r.marca,
        cantidad: Number(r.cantidad) || 0,
        totalVenta,
        totalCosto: Number(r.totalCosto) || 0,
        ganancia,
        margen: totalVenta > 0 ? ((ganancia / totalVenta) * 100).toFixed(1) : "0",
      };
    });

    const comparativoSucursales = comparativoSucursalesRes.recordset.map((r: { sucursal: string; ventas: number; ganancia: number; cantTickets: number }) => {
      const ventas = Number(r.ventas) || 0;
      const ganancia = Number(r.ganancia) || 0;
      return {
        sucursal: r.sucursal,
        ventas,
        ganancia,
        cantTickets: Number(r.cantTickets) || 0,
        margen: ventas > 0 ? ((ganancia / ventas) * 100).toFixed(1) : "0",
      };
    });

    return NextResponse.json({
      ventasDiarias,
      ventasDiariasMesAnterior,
      topClientes,
      metodosPago,
      empleados,
      comparativo,
      horariosPico,
      topProductosMargen,
      comparativoSucursales,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    return NextResponse.json(
      { error: "Error al cargar datos del dashboard" },
      { status: 500 }
    );
  }
}
