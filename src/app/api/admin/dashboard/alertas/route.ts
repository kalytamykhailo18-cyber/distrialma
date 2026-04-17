import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: returns automatic alerts for the dashboard
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const sucursales = searchParams.get("sucursales") || "1,2,6,7,10";
  const sucList = sucursales.split(",").map((s) => `'${s.trim()}'`).join(",");

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbClientes = getDbName("clientes");
    const dbProd = getDbName("productos");

    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const yyyy = now.getUTCFullYear();
    const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
    const monthStart = `${yyyy}${mm}01000000`;

    // ── Alert 1: Top clients that haven't bought in 30+ days ──
    const clientesInactivosQuery = `
      WITH TopClients AS (
        SELECT TOP 20
          LTRIM(RTRIM(t.Cliente)) AS cod,
          SUM(t.Impo) AS total
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
          AND t.Fechora >= @hace90
          AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND LTRIM(RTRIM(t.Cliente)) <> ''
        GROUP BY LTRIM(RTRIM(t.Cliente))
      )
      SELECT TOP 10
        tc.cod,
        LTRIM(RTRIM(c.Nombre)) AS nombre,
        tc.total AS totalCompras,
        (SELECT MAX(t2.Fechora) FROM [${dbTransas}].dbo.Transas t2
         WHERE t2.Tipo = 'V' AND LTRIM(RTRIM(t2.Itm)) = '0'
         AND LTRIM(RTRIM(t2.Cliente)) = tc.cod
         AND (t2.Anulado IS NULL OR LTRIM(RTRIM(t2.Anulado)) = '' OR t2.Anulado = ' ')) AS ultimaCompra
      FROM TopClients tc
      LEFT JOIN [${dbClientes}].dbo.Clientes c ON LTRIM(RTRIM(c.Cod)) COLLATE Modern_Spanish_CI_AS = tc.cod COLLATE Modern_Spanish_CI_AS
      WHERE (SELECT MAX(t2.Fechora) FROM [${dbTransas}].dbo.Transas t2
         WHERE t2.Tipo = 'V' AND LTRIM(RTRIM(t2.Itm)) = '0'
         AND LTRIM(RTRIM(t2.Cliente)) = tc.cod
         AND (t2.Anulado IS NULL OR LTRIM(RTRIM(t2.Anulado)) = '' OR t2.Anulado = ' ')) < @hace30
      ORDER BY tc.total DESC
    `;

    // ── Alert 2: Products with margin below 10% (margen bajo) ──
    const margenBajoQuery = `
      SELECT TOP 10
        LTRIM(RTRIM(t.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
        SUM(t.Impo) AS totalVenta,
        SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) AS ganancia
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos p ON p.Cod = t.Producto
      OUTER APPLY (SELECT TOP 1 s.Costo FROM [${dbProd}].dbo.Stock s WHERE s.CodProducto = t.Producto AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '') AND s.Costo > 0) s
      WHERE t.Tipo = 'I'
        AND t.Fechora >= @desdeMes
        AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        AND t.Cant > 0
        AND t.Impo > 10000
      GROUP BY LTRIM(RTRIM(t.Producto)), LTRIM(RTRIM(ISNULL(p.Nombre, '')))
      HAVING SUM(t.Impo) > 0 AND (SUM(t.Impo - CASE WHEN t.Costo >= 999999 THEN t.Cant * ISNULL(s.Costo, 0) ELSE t.Costo END) / SUM(t.Impo)) < 0.10
      ORDER BY SUM(t.Impo) DESC
    `;

    // ── Alert 3: Top selling products out of stock ──
    const sinStockQuery = `
      WITH TopVendidos AS (
        SELECT TOP 30
          LTRIM(RTRIM(t.Producto)) AS sku,
          SUM(t.Cant) AS cantidad,
          SUM(t.Impo) AS totalVenta
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'I'
          AND t.Fechora >= @desdeMes
          AND LTRIM(RTRIM(t.Sucursal)) IN (${sucList})
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND t.Cant > 0
        GROUP BY LTRIM(RTRIM(t.Producto))
      )
      SELECT TOP 10
        tv.sku,
        LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
        tv.cantidad AS cantidadVendida,
        tv.totalVenta,
        ISNULL(s.Stk, 0) AS stockActual
      FROM TopVendidos tv
      LEFT JOIN [${dbProd}].dbo.Productos p ON LTRIM(RTRIM(p.Cod)) = tv.sku
      OUTER APPLY (SELECT TOP 1 s.Stk FROM [${dbProd}].dbo.Stock s WHERE LTRIM(RTRIM(s.CodProducto)) = tv.sku AND LTRIM(RTRIM(s.Deposito)) = '0' AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')) s
      WHERE ISNULL(s.Stk, 0) <= 0
      ORDER BY tv.totalVenta DESC
    `;

    const hace30 = new Date(now);
    hace30.setDate(hace30.getDate() - 30);
    const hace30Str = hace30.getUTCFullYear().toString() + String(hace30.getUTCMonth() + 1).padStart(2, "0") + String(hace30.getUTCDate()).padStart(2, "0") + "000000";
    const hace90 = new Date(now);
    hace90.setDate(hace90.getDate() - 90);
    const hace90Str = hace90.getUTCFullYear().toString() + String(hace90.getUTCMonth() + 1).padStart(2, "0") + String(hace90.getUTCDate()).padStart(2, "0") + "000000";

    const [inactivosRes, margenBajoRes, sinStockRes] = await Promise.all([
      pool.request().input("hace30", hace30Str).input("hace90", hace90Str).query(clientesInactivosQuery),
      pool.request().input("desdeMes", monthStart).query(margenBajoQuery),
      pool.request().input("desdeMes", monthStart).query(sinStockQuery),
    ]);

    const clientesInactivos = inactivosRes.recordset.map((r: { cod: string; nombre: string; totalCompras: number; ultimaCompra: string }) => {
      const f = r.ultimaCompra || "";
      const diasDesde = f.length >= 8 ? Math.floor((now.getTime() - new Date(
        parseInt(f.slice(0, 4)),
        parseInt(f.slice(4, 6)) - 1,
        parseInt(f.slice(6, 8))
      ).getTime()) / (1000 * 60 * 60 * 24)) : null;
      return {
        cod: r.cod,
        nombre: r.nombre || "Sin nombre",
        totalCompras: Number(r.totalCompras) || 0,
        ultimaCompra: f ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : "",
        diasDesde,
      };
    });

    const margenBajo = margenBajoRes.recordset.map((r: { sku: string; nombre: string; totalVenta: number; ganancia: number }) => {
      const totalVenta = Number(r.totalVenta) || 0;
      const ganancia = Number(r.ganancia) || 0;
      return {
        sku: r.sku,
        nombre: r.nombre || "Sin nombre",
        totalVenta,
        ganancia,
        margen: totalVenta > 0 ? ((ganancia / totalVenta) * 100).toFixed(1) : "0",
      };
    });

    const sinStock = sinStockRes.recordset.map((r: { sku: string; nombre: string; cantidadVendida: number; totalVenta: number; stockActual: number }) => ({
      sku: r.sku,
      nombre: r.nombre || "Sin nombre",
      cantidadVendida: Number(r.cantidadVendida) || 0,
      totalVenta: Number(r.totalVenta) || 0,
      stockActual: Number(r.stockActual) || 0,
    }));

    return NextResponse.json({
      clientesInactivos,
      margenBajo,
      sinStock,
    });
  } catch (error) {
    console.error("Alertas error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
