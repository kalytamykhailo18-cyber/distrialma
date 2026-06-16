import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST { sourceDep, targetDep, dryRun?: boolean } — admin only.
 *
 * For every Stock row that exists in `sourceDep` (typically "0") but NOT in
 * `targetDep`, insert a new Stock row in `targetDep` with Stk = 0. This is the
 * "habilitar todos los productos en este deposito" path that Gastón asked for.
 * Idempotent: products already enabled in the target are skipped.
 *
 * If `dryRun: true`, returns the count that would be inserted without inserting.
 */
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as { role?: string; name?: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  try {
    const { sourceDep, targetDep, dryRun } = (await req.json()) as { sourceDep?: string; targetDep?: string; dryRun?: boolean };
    const src = String(sourceDep || "").trim();
    const tgt = String(targetDep || "").trim();
    if (!src || !tgt) return NextResponse.json({ error: "sourceDep y targetDep requeridos" }, { status: 400 });
    if (src === tgt) return NextResponse.json({ error: "Los depositos no pueden ser iguales" }, { status: 400 });

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const srcPadded = src.padEnd(3, " ");
    const tgtPadded = tgt.padEnd(3, " ");

    // Two operations:
    //  - UPDATE: existing rows in target that correspond to an enabled product in source → Stk=0, DeBaja=0
    //  - INSERT: rows in source that have no row at all in target → create with Stk=0
    // The UPDATE handles re-habilitar of rows that were previously disabled (DeBaja=1) too.
    const countQ = await pool.request().input("src", srcPadded).input("tgt", tgtPadded).query(`
      SELECT
        (SELECT COUNT(*)
         FROM [${dbProd}].dbo.Stock s
         WHERE LTRIM(RTRIM(s.Deposito)) = LTRIM(RTRIM(@src))
           AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
           AND LTRIM(RTRIM(s.CodProducto)) <> ''
           AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
           AND NOT EXISTS (
             SELECT 1 FROM [${dbProd}].dbo.Stock t
             WHERE LTRIM(RTRIM(t.Deposito)) = LTRIM(RTRIM(@tgt))
               AND LTRIM(RTRIM(t.CodProducto)) = LTRIM(RTRIM(s.CodProducto))
               AND (t.TalleColor IS NULL OR LTRIM(RTRIM(t.TalleColor)) = '')
           )
        ) AS toInsert,
        (SELECT COUNT(*)
         FROM [${dbProd}].dbo.Stock t
         WHERE LTRIM(RTRIM(t.Deposito)) = LTRIM(RTRIM(@tgt))
           AND (t.TalleColor IS NULL OR LTRIM(RTRIM(t.TalleColor)) = '')
           AND EXISTS (
             SELECT 1 FROM [${dbProd}].dbo.Stock s
             WHERE LTRIM(RTRIM(s.Deposito)) = LTRIM(RTRIM(@src))
               AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
               AND LTRIM(RTRIM(s.CodProducto)) = LTRIM(RTRIM(t.CodProducto))
               AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
           )
        ) AS toUpdate
    `);
    const toInsert = Number(countQ.recordset[0]?.toInsert || 0);
    const toUpdate = Number(countQ.recordset[0]?.toUpdate || 0);

    if (dryRun || (toInsert === 0 && toUpdate === 0)) {
      return NextResponse.json({ ok: true, wouldInsert: toInsert, wouldUpdate: toUpdate, inserted: 0, updated: 0, dryRun: !!dryRun });
    }

    // 1) UPDATE existing target rows → Stk=0, DeBaja=0 (re-enable + reset).
    // ALSO copy every product-meta field from the source dep so PunTouch considers the
    // product available in the target sucursal. Without this, fields like Precio,
    // Moneda, Proveedor* and the FillerBit* flags stay NULL and PunTouch shows
    // "no disponible en sucursal".
    const updateQ = await pool.request().input("src", srcPadded).input("tgt", tgtPadded).query(`
      UPDATE t SET
        t.Stk = 0,
        t.DeBaja = 0,
        t.Costo = s.Costo,
        t.Moneda = s.Moneda,
        t.Precio = s.Precio, t.Precio2 = s.Precio2, t.Precio3 = s.Precio3, t.Precio4 = s.Precio4, t.Precio5 = s.Precio5,
        t.PorceGan = s.PorceGan, t.PorceGan2 = s.PorceGan2, t.PorceGan3 = s.PorceGan3, t.PorceGan4 = s.PorceGan4, t.PorceGan5 = s.PorceGan5,
        t.StkMin = s.StkMin, t.StkMax = s.StkMax,
        t.Proveedor1 = s.Proveedor1, t.Proveedor2 = s.Proveedor2, t.Proveedor3 = s.Proveedor3,
        t.FechaVto = s.FechaVto,
        t.FillerNum1 = s.FillerNum1, t.FillerNum2 = s.FillerNum2, t.FillerNum3 = s.FillerNum3, t.FillerNum4 = s.FillerNum4,
        t.Filler1 = s.Filler1, t.Filler2 = s.Filler2, t.Filler3 = s.Filler3,
        t.FillerBit1 = ISNULL(s.FillerBit1, 0), t.FillerBit2 = ISNULL(s.FillerBit2, 0), t.FillerBit3 = ISNULL(s.FillerBit3, 0), t.FillerBit4 = ISNULL(s.FillerBit4, 0)
      FROM [${dbProd}].dbo.Stock t
      INNER JOIN [${dbProd}].dbo.Stock s
        ON LTRIM(RTRIM(s.Deposito)) = LTRIM(RTRIM(@src))
        AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.CodProducto)) = LTRIM(RTRIM(t.CodProducto))
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
      WHERE LTRIM(RTRIM(t.Deposito)) = LTRIM(RTRIM(@tgt))
        AND (t.TalleColor IS NULL OR LTRIM(RTRIM(t.TalleColor)) = '')
    `);
    const updated = Number(updateQ.rowsAffected?.[0] || 0);

    // 2) INSERT missing rows. Cod is a char(14) PK in PunTouch's Stock table — must be
    // unique and non-null. The dep 0 convention (which the rest of the app uses) is:
    //   Cod = RIGHT('   ' + Deposito, 3) + CodProducto(7) + 4 spaces  (total 14 chars)
    // Also copy all product-meta fields from the source row so PunTouch shows the
    // product as available in the new sucursal.
    const insertQ = await pool.request().input("src", srcPadded).input("tgt", tgtPadded).query(`
      INSERT INTO [${dbProd}].dbo.Stock
        (Cod, Deposito, CodProducto, TalleColor, Stk, DeBaja,
         Costo, Moneda,
         Precio, Precio2, Precio3, Precio4, Precio5,
         PorceGan, PorceGan2, PorceGan3, PorceGan4, PorceGan5,
         StkMin, StkMax,
         Proveedor1, Proveedor2, Proveedor3,
         FechaVto,
         FillerNum1, FillerNum2, FillerNum3, FillerNum4,
         Filler1, Filler2, Filler3,
         FillerBit1, FillerBit2, FillerBit3, FillerBit4)
      SELECT
        RIGHT(SPACE(3) + LTRIM(RTRIM(@tgt)), 3) + s.CodProducto + SPACE(4),
        LTRIM(RTRIM(@tgt)) + REPLICATE(' ', 3 - LEN(LTRIM(RTRIM(@tgt)))),
        s.CodProducto, '', 0, 0,
        s.Costo, s.Moneda,
        s.Precio, s.Precio2, s.Precio3, s.Precio4, s.Precio5,
        s.PorceGan, s.PorceGan2, s.PorceGan3, s.PorceGan4, s.PorceGan5,
        s.StkMin, s.StkMax,
        s.Proveedor1, s.Proveedor2, s.Proveedor3,
        s.FechaVto,
        s.FillerNum1, s.FillerNum2, s.FillerNum3, s.FillerNum4,
        s.Filler1, s.Filler2, s.Filler3,
        ISNULL(s.FillerBit1, 0), ISNULL(s.FillerBit2, 0), ISNULL(s.FillerBit3, 0), ISNULL(s.FillerBit4, 0)
      FROM [${dbProd}].dbo.Stock s
      WHERE LTRIM(RTRIM(s.Deposito)) = LTRIM(RTRIM(@src))
        AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.CodProducto)) <> ''
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND NOT EXISTS (
          SELECT 1 FROM [${dbProd}].dbo.Stock t
          WHERE LTRIM(RTRIM(t.Deposito)) = LTRIM(RTRIM(@tgt))
            AND LTRIM(RTRIM(t.CodProducto)) = LTRIM(RTRIM(s.CodProducto))
            AND (t.TalleColor IS NULL OR LTRIM(RTRIM(t.TalleColor)) = '')
        )
        AND NOT EXISTS (
          SELECT 1 FROM [${dbProd}].dbo.Stock c
          WHERE c.Cod = RIGHT(SPACE(3) + LTRIM(RTRIM(@tgt)), 3) + s.CodProducto + SPACE(4)
        )
    `);
    const inserted = Number(insertQ.rowsAffected?.[0] || 0);

    // Audit log: a single summary row so we don't blow up the table with 14k entries
    const userName = user.name || "admin";
    await prisma.stockAuditEntry.create({
      data: {
        sku: "BULK",
        productName: `Habilitar ${inserted}+${updated} productos en deposito ${tgt}`,
        deposito: tgt,
        stkAnterior: 0,
        stkNuevo: 0,
        motivo: `Bulk ${src}→${tgt} — ${inserted} nuevos + ${updated} reset a Stk=0`,
        usuario: userName,
        origen: "bulk-habilitar",
      },
    });

    return NextResponse.json({ ok: true, wouldInsert: toInsert, wouldUpdate: toUpdate, inserted, updated });
  } catch (e) {
    console.error("POST habilitar-bulk error:", e);
    return NextResponse.json({ error: "Error: " + (e as Error).message }, { status: 500 });
  }
}
