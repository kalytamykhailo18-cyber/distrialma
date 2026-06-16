import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// Sucursales que se compensan desde depo 0 cada noche.
const SUCURSALES = ["1", "2", "3"];

/**
 * EOD cron — corre todas las noches.
 *
 * Para cada sucursal (deps 1, 2, 3) busca Stock con Stk < 0 y crea
 * automaticamente un traslado desde el deposito 0 al destino para llevar el
 * negativo a 0:
 *   - dep 0: Stk -= |negativo|
 *   - dep N: Stk += |negativo|  (queda en 0)
 * Genera un StockTransfer por sucursal con todos los items + audit log + PDF
 * accesible como cualquier otro traslado. Si no hay negativos en una sucursal
 * la saltea sin crear traslado vacio.
 *
 * Si ?dryRun=1, devuelve la lista de lo que crearia sin tocar nada.
 */
export async function POST(req: NextRequest) {
  const url = new URL(req.url);
  const secret = url.searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const dryRun = url.searchParams.get("dryRun") === "1";

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    const results: Array<{ sucursal: string; transferId?: number; items: number; totalCantidad: number; skipped?: string }> = [];

    for (const dep of SUCURSALES) {
      // Find all (sku, dep) where Stk < 0 — these need compensation from dep 0
      const negQ = await pool.request().input("dep", dep).query(`
        SELECT
          LTRIM(RTRIM(s.CodProducto)) AS sku,
          ISNULL(p.Nombre, '') AS nombre,
          -ISNULL(s.Stk, 0) AS need
        FROM [${dbProd}].dbo.Stock s
        LEFT JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        WHERE LTRIM(RTRIM(s.Deposito)) = LTRIM(RTRIM(@dep))
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND ISNULL(s.Stk, 0) < 0
        ORDER BY s.CodProducto
      `);

      const items = negQ.recordset as Array<{ sku: string; nombre: string; need: number }>;
      if (items.length === 0) {
        results.push({ sucursal: dep, items: 0, totalCantidad: 0, skipped: "sin negativos" });
        continue;
      }

      const totalCantidad = items.reduce((s, i) => s + Number(i.need), 0);

      if (dryRun) {
        results.push({ sucursal: dep, items: items.length, totalCantidad });
        continue;
      }

      // Apply: dep 0 -= need ; dep N += need (becomes 0). Transactional.
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const it of items) {
          const codPadded = it.sku.padStart(7, " ");
          const need = Number(it.need);
          // dep 0 down
          await new sql.Request(tx).input("cod", codPadded).input("cant", need).query(`
            UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) - @cant
            WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
              AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
          `);
          // dep N up
          await new sql.Request(tx).input("cod", codPadded).input("dep", dep).input("cant", need).query(`
            UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) + @cant
            WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
              AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
          `);
        }
        await tx.commit();
      } catch (e) {
        try { await tx.rollback(); } catch { /* ignore */ }
        throw e;
      }

      // Persist StockTransfer + items so it shows in /admin/traslados with PDF
      const transfer = await prisma.stockTransfer.create({
        data: {
          depositoOrigen: "0",
          depositoDestino: dep,
          usuario: "cron-eod",
          notas: `Compensacion automatica EOD — ${items.length} item(s) salieron de negativo en depo ${dep}.`,
          estado: "realizado",
          items: {
            create: items.map((i) => ({
              sku: i.sku,
              productName: String(i.nombre).substring(0, 120),
              cantidad: Number(i.need),
            })),
          },
        },
      });

      // Audit per side
      const motivoTag = `EOD #${transfer.id} (0→${dep})`;
      await prisma.stockAuditEntry.createMany({
        data: items.flatMap((i) => [
          {
            sku: i.sku,
            productName: String(i.nombre).substring(0, 120),
            deposito: "0",
            stkAnterior: 0,
            stkNuevo: 0,
            motivo: motivoTag,
            usuario: "cron-eod",
            origen: "eod-compensate",
          },
          {
            sku: i.sku,
            productName: String(i.nombre).substring(0, 120),
            deposito: dep,
            stkAnterior: 0,
            stkNuevo: 0,
            motivo: motivoTag,
            usuario: "cron-eod",
            origen: "eod-compensate",
          },
        ]),
      });

      results.push({ sucursal: dep, transferId: transfer.id, items: items.length, totalCantidad });
      console.log(`[EOD-COMPENSATE] dep ${dep} ← dep 0: ${items.length} item(s), ${totalCantidad} unid total. Traslado #${transfer.id}.`);
    }

    return NextResponse.json({ ok: true, dryRun, results });
  } catch (e) {
    console.error("EOD compensate error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
