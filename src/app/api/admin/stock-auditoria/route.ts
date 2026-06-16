import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function padLeft(s: string, n: number): string {
  return s.padStart(n, " ");
}

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const days = Math.min(parseInt(req.nextUrl.searchParams.get("days") || "60"), 365);
    const search = (req.nextUrl.searchParams.get("search") || "").trim();

    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr =
      since.getFullYear().toString() +
      String(since.getMonth() + 1).padStart(2, "0") +
      String(since.getDate()).padStart(2, "0") +
      "000000";

    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbPedidos = getDbName("pedidos");
    const dbProductos = getDbName("productos");

    // 1. Ventas (Transas items, not anulated)
    const ventas = await pool.request().input("since", sinceStr).query(`
      SELECT
        LTRIM(RTRIM(t.Producto)) AS sku,
        SUM(t.Cant) AS cant
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'I'
        AND t.Fechora >= @since
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
      GROUP BY LTRIM(RTRIM(t.Producto))
    `);

    // 2. Anulaciones de pendientes (Pedidos items, Anulado != '') — bug victims
    const anulPend = await pool.request().input("since", sinceStr).query(`
      SELECT
        LTRIM(RTRIM(p.Producto)) AS sku,
        SUM(p.Cant) AS cant,
        COUNT(DISTINCT p.Boleta) AS boletas
      FROM [${dbPedidos}].dbo.Pedidos p
      WHERE p.Tipo = 'I'
        AND p.Fechora >= @since
        AND p.Anulado IS NOT NULL AND LTRIM(RTRIM(p.Anulado)) != '' AND p.Anulado != ' '
      GROUP BY LTRIM(RTRIM(p.Producto))
    `);

    // 3. Movimientos aprobados (PostgreSQL, since the same date)
    const movs = await prisma.internalMovementItem.groupBy({
      by: ["sku"],
      _sum: { cantidad: true },
      _count: { _all: true },
      where: {
        movement: { estado: "aprobado", aprobadoAt: { gte: since } },
      },
    });

    // 4. Ingresos (StockEntry items archived)
    const ingresos = await prisma.stockEntryItem.groupBy({
      by: ["sku"],
      _sum: { cantidad: true },
      where: {
        entry: { createdAt: { gte: since } },
      },
    });

    // Build SKU map
    type Row = { sku: string; productName: string; ingresos: number; ventas: number; anulacionesPendientes: number; boletasAnul: number; movimientos: number; stockActual: number };
    const map = new Map<string, Row>();

    const ensure = (sku: string): Row => {
      if (!map.has(sku)) {
        map.set(sku, { sku, productName: "", ingresos: 0, ventas: 0, anulacionesPendientes: 0, boletasAnul: 0, movimientos: 0, stockActual: 0 });
      }
      return map.get(sku)!;
    };

    for (const r of ventas.recordset) ensure(r.sku).ventas = Number(r.cant);
    for (const r of anulPend.recordset) {
      const row = ensure(r.sku);
      row.anulacionesPendientes = Number(r.cant);
      row.boletasAnul = Number(r.boletas);
    }
    for (const m of movs) ensure(m.sku).movimientos = Number(m._sum.cantidad || 0);
    for (const ing of ingresos) ensure(ing.sku).ingresos = Number(ing._sum.cantidad || 0);

    if (map.size === 0) {
      return NextResponse.json({ rows: [], days });
    }

    // Fetch product names + current stock
    const skus = Array.from(map.keys());
    const skuList = skus.map((s) => `'${padLeft(s, 7)}'`).join(",");
    const prodResult = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        ISNULL(s.Stk, 0) AS stk
      FROM [${dbProductos}].dbo.Productos p
      LEFT JOIN [${dbProductos}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
      WHERE p.Cod IN (${skuList})
    `);
    for (const r of prodResult.recordset) {
      const row = map.get(r.sku);
      if (row) {
        row.productName = r.nombre;
        row.stockActual = Number(r.stk);
      }
    }

    let rows = Array.from(map.values());

    if (search) {
      const q = search.toUpperCase();
      rows = rows.filter((r) => r.sku.includes(q) || r.productName.toUpperCase().includes(q));
    }

    // Sort by anulacionesPendientes (bug impact) desc by default
    rows.sort((a, b) => b.anulacionesPendientes - a.anulacionesPendientes);

    return NextResponse.json({
      rows,
      days,
      sinceStr,
      totals: {
        ingresos: rows.reduce((s, r) => s + r.ingresos, 0),
        ventas: rows.reduce((s, r) => s + r.ventas, 0),
        anulacionesPendientes: rows.reduce((s, r) => s + r.anulacionesPendientes, 0),
        movimientos: rows.reduce((s, r) => s + r.movimientos, 0),
      },
    });
  } catch (e) {
    console.error("Stock auditoria GET error:", e);
    return NextResponse.json({ error: "Error al cargar auditoria" }, { status: 500 });
  }
}

// POST: Apply a stock correction (subtract qty from PunTouch for a SKU)
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = session.user as { role?: string; name?: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  try {
    const { sku, cantidad, motivo } = await req.json();
    if (!sku || !cantidad || isNaN(Number(cantidad))) {
      return NextResponse.json({ error: "sku y cantidad requeridos" }, { status: 400 });
    }
    const cant = Number(cantidad);

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const result = await pool.request()
      .input("cod", padLeft(String(sku).trim(), 7))
      .input("cant", cant)
      .query(`UPDATE [${dbProd}].dbo.Stock
              SET Stk = ISNULL(Stk, 0) - @cant
              WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'`);

    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: "SKU no encontrado en stock" }, { status: 404 });
    }

    await prisma.notificationLog.create({
      data: {
        clientId: String(sku).trim().substring(0, 20),
        tipo: "stock_auditoria",
        mensaje: `Ajuste manual stock: ${cant} unidades (${motivo || "sin motivo"}) por ${user.name || "admin"}`,
        telefono: null,
        enviadoPor: (user.name || "admin").substring(0, 60),
        ok: true,
      },
    }).catch((e) => console.error("Log error:", e));

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("Stock auditoria POST error:", e);
    return NextResponse.json({ error: "Error al aplicar ajuste" }, { status: 500 });
  }
}
