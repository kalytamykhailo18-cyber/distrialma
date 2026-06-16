import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SETTING_KEY = "movements_reconciled_until";

function padLeft(s: string, n: number): string {
  return s.padStart(n, " ");
}

async function getReconcileSince(): Promise<Date> {
  const s = await prisma.setting.findUnique({ where: { key: SETTING_KEY } });
  if (!s?.value) return new Date(0);
  const d = new Date(s.value);
  return isNaN(d.getTime()) ? new Date(0) : d;
}

export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const since = await getReconcileSince();

    const movements = await prisma.internalMovement.findMany({
      where: { estado: "aprobado", aprobadoAt: { gt: since } },
      include: { items: true },
      orderBy: { aprobadoAt: "asc" },
    });

    // Aggregate by SKU
    const bySku = new Map<string, { sku: string; productName: string; cantidad: number; movimientos: number }>();
    for (const m of movements) {
      for (const it of m.items) {
        const key = it.sku;
        const prev = bySku.get(key);
        if (prev) {
          prev.cantidad += Number(it.cantidad);
          prev.movimientos += 1;
        } else {
          bySku.set(key, {
            sku: it.sku,
            productName: it.productName,
            cantidad: Number(it.cantidad),
            movimientos: 1,
          });
        }
      }
    }

    const rows = Array.from(bySku.values()).sort((a, b) => b.cantidad - a.cantidad);

    // Fetch current PunTouch stock for these SKUs
    if (rows.length > 0) {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      const skuList = rows.map((r) => `'${padLeft(r.sku, 7)}'`).join(",");
      const stockResult = await pool.request().query(`
        SELECT LTRIM(RTRIM(CodProducto)) AS sku, ISNULL(Stk, 0) AS stk
        FROM [${dbProd}].dbo.Stock
        WHERE CodProducto IN (${skuList}) AND LTRIM(RTRIM(Deposito)) = '0'
      `);
      const stockMap = new Map<string, number>(
        stockResult.recordset.map((r: { sku: string; stk: number }) => [r.sku, Number(r.stk)])
      );
      for (const r of rows) {
        (r as unknown as { currentStock: number; newStock: number }).currentStock = stockMap.get(r.sku) || 0;
        (r as unknown as { currentStock: number; newStock: number }).newStock = (stockMap.get(r.sku) || 0) - r.cantidad;
      }
    }

    return NextResponse.json({
      rows,
      totalMovements: movements.length,
      reconciledSince: since.toISOString(),
    });
  } catch (e) {
    console.error("Reconcile GET error:", e);
    return NextResponse.json({ error: "Error al cargar reconciliacion" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = session.user as { role?: string; name?: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const markOnly: boolean = body.markOnly === true;
    const skuFilter: string[] | undefined = Array.isArray(body.skus) && body.skus.length > 0 ? body.skus : undefined;

    // Mark-only: set reconciliation marker to now without applying any deductions
    if (markOnly) {
      const since = await getReconcileSince();
      const movements = await prisma.internalMovement.findMany({
        where: { estado: "aprobado", aprobadoAt: { gt: since } },
        select: { aprobadoAt: true },
        orderBy: { aprobadoAt: "desc" },
        take: 1,
      });
      const latestAt = movements[0]?.aprobadoAt;
      if (latestAt) {
        await prisma.setting.upsert({
          where: { key: SETTING_KEY },
          create: { key: SETTING_KEY, value: latestAt.toISOString() },
          update: { value: latestAt.toISOString() },
        });
      }
      return NextResponse.json({ ok: true, markedOnly: true });
    }

    const since = await getReconcileSince();
    const movements = await prisma.internalMovement.findMany({
      where: { estado: "aprobado", aprobadoAt: { gt: since } },
      include: { items: true },
      orderBy: { aprobadoAt: "asc" },
    });

    if (movements.length === 0) {
      return NextResponse.json({ ok: true, applied: 0, message: "Nada para reconciliar" });
    }

    const bySku = new Map<string, number>();
    for (const m of movements) {
      for (const it of m.items) {
        if (skuFilter && !skuFilter.includes(it.sku)) continue;
        bySku.set(it.sku, (bySku.get(it.sku) || 0) + Number(it.cantidad));
      }
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");
    let applied = 0;
    const errors: string[] = [];

    for (const [sku, cant] of Array.from(bySku.entries())) {
      try {
        await pool.request()
          .input("cod", padLeft(sku, 7))
          .input("cant", cant)
          .query(`UPDATE [${dbProd}].dbo.Stock
                  SET Stk = ISNULL(Stk, 0) - @cant
                  WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'`);
        applied++;
      } catch (e) {
        errors.push(`${sku}: ${(e as Error).message}`);
      }
    }

    // Mark reconciliation point only if applying full reconciliation (no SKU filter)
    if (!skuFilter) {
      const latestAt = movements[movements.length - 1].aprobadoAt;
      if (latestAt) {
        await prisma.setting.upsert({
          where: { key: SETTING_KEY },
          create: { key: SETTING_KEY, value: latestAt.toISOString() },
          update: { value: latestAt.toISOString() },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      appliedSkus: applied,
      totalMovements: movements.length,
      errors,
    });
  } catch (e) {
    console.error("Reconcile POST error:", e);
    return NextResponse.json({ error: "Error al aplicar reconciliacion" }, { status: 500 });
  }
}
