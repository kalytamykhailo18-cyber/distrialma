import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// Sucursales donde el cron balancea — agregar/quitar segun convenga.
const DEPOSITOS = ["0", "1", "2", "3"];

/**
 * Virtual stock cron: every (sku-pair, deposit) in `virtual_stock_mappings`
 *  - reads current Stk of the hijo in that deposit
 *  - vendido = targetStock - currentStock (units of hijo sold)
 *  - subtracts vendido * ratio from the padre in the SAME deposit
 *  - resets hijo to targetStock in that deposit
 *
 * Mappings live in the DB so admins can add/edit/delete them via
 * /admin/vinculaciones-stock instead of editing this file.
 */
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    // Order by id so "first mapping per hijo" (whose targetStock is canonical when
    // there are multiple) is deterministic — the oldest mapping wins.
    const mappings = await prisma.virtualStockMapping.findMany({
      where: { active: true },
      orderBy: { id: "asc" },
    });
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const results: Array<{ mappingId: number; skuHijo: string; skuPadre: string; ratio: number; deposito: string; stockAntes: number; vendido: number; padreDescontado: number; hijoReseteado: number; skipped?: string }> = [];

    // Group by skuHijo so we can support 1 hijo → N padres. We read the hijo's
    // current stock ONCE per (hijo, dep), compute vendido once, apply every padre's
    // deduction using its own ratio, then reset the hijo at the end. Doing it
    // mapping-by-mapping would reset the hijo after the first padre and the
    // second padre would see vendido=0.
    const groupedByHijo = new Map<string, typeof mappings>();
    for (const m of mappings) {
      const arr = groupedByHijo.get(m.skuHijo) || [];
      arr.push(m);
      groupedByHijo.set(m.skuHijo, arr);
    }

    for (const [skuHijo, group] of Array.from(groupedByHijo.entries())) {
      const hijoCode = skuHijo.padStart(7, " ");
      // All entries for the same hijo should share targetStock — use the first
      // mapping's value as the canonical one.
      const targetStock = Number(group[0].targetStock);

      for (const dep of DEPOSITOS) {
        const hijoResult = await pool.request().input("cod", hijoCode).input("dep", dep).query(`
          SELECT TOP 1 ISNULL(Stk, 0) AS stk FROM [${dbProd}].dbo.Stock
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
            AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);
        if (hijoResult.recordset.length === 0) {
          for (const m of group) {
            results.push({ mappingId: m.id, skuHijo: m.skuHijo, skuPadre: m.skuPadre, ratio: Number(m.ratio), deposito: dep, stockAntes: 0, vendido: 0, padreDescontado: 0, hijoReseteado: 0, skipped: "hijo no habilitado en este deposito" });
          }
          continue;
        }
        const currentStock = Number(hijoResult.recordset[0].stk || 0);
        const vendido = targetStock - currentStock;

        // Apply each padre's deduction using its own ratio. All deductions use the
        // SAME vendido (units of hijo sold), just multiplied by each padre's ratio.
        for (const m of group) {
          const padreCode = m.skuPadre.padStart(7, " ");
          const ratio = Number(m.ratio);
          const padreDescontado = vendido > 0 ? vendido * ratio : 0;

          if (padreDescontado > 0) {
            await pool.request().input("cod", padreCode).input("dep", dep).input("vendido", padreDescontado).query(`
              UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) - @vendido
              WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
                AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
            `);
          }

          results.push({
            mappingId: m.id,
            skuHijo: m.skuHijo,
            skuPadre: m.skuPadre,
            ratio,
            deposito: dep,
            stockAntes: currentStock,
            vendido,
            padreDescontado: Math.round(padreDescontado * 1000) / 1000,
            hijoReseteado: targetStock,
          });

          console.log(`[STOCK-VIRTUAL] dep ${dep} — ${m.skuHijo} → ${m.skuPadre} (x${ratio}): vendido ${vendido}, padre -${padreDescontado}`);
        }

        // Reset hijo ONCE after all padre deductions for this dep
        await pool.request().input("cod", hijoCode).input("dep", dep).input("target", targetStock).query(`
          UPDATE [${dbProd}].dbo.Stock SET Stk = @target
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
            AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);
      }
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("Stock virtual error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
