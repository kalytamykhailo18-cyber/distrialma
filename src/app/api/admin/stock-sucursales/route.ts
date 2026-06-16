import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// Default human labels for deposits — fall back when the Setting row is absent.
// Source of truth: Gastón's mapping (2026-06-13).
const DEFAULT_DEPOSITO_NAMES: Record<string, string> = {
  "0": "Distribuidora / Mayorista",
  "1": "Pontevedra",
  "2": "Minorista",
  "3": "Cervantes",
};

async function getDepositoNames(): Promise<Record<string, string>> {
  const settings = await prisma.setting.findMany({
    where: { key: { startsWith: "deposito_name_" } },
  });
  const map: Record<string, string> = { ...DEFAULT_DEPOSITO_NAMES };
  for (const s of settings) {
    const dep = s.key.replace("deposito_name_", "");
    if (s.value) map[dep] = s.value;
  }
  return map;
}

/**
 * GET ?sku=X  → returns product info + per-deposit stock rows + recent audit entries.
 */
export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as { role?: string; permissions?: string[] };
  if (user.role !== "admin" && !(user.permissions || []).includes("stock-sucursales")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const sku = new URL(req.url).searchParams.get("sku");
  if (!sku) return NextResponse.json({ error: "sku requerido" }, { status: 400 });

  const pool = await getPool();
  const dbProd = getDbName("productos");
  const codPadded = String(sku).padStart(7, " ");

  const [prodQ, stockQ, audit, names] = await Promise.all([
    pool.request().input("cod", codPadded).query(`
      SELECT LTRIM(RTRIM(Cod)) AS sku,
             LTRIM(RTRIM(Nombre)) AS nombre,
             LTRIM(RTRIM(ISNULL(Codbar, ''))) AS barcode,
             LTRIM(RTRIM(ISNULL(Unidad, ''))) AS unidad
      FROM [${dbProd}].dbo.Productos
      WHERE Cod = @cod
    `),
    pool.request().input("cod", codPadded).query(`
      SELECT LTRIM(RTRIM(Deposito)) AS deposito,
             ISNULL(Stk, 0) AS stk,
             ISNULL(StkMin, 0) AS stkMin,
             ISNULL(StkMax, 0) AS stkMax,
             ISNULL(Costo, 0) AS costo,
             ISNULL(DeBaja, 0) AS deBaja
      FROM [${dbProd}].dbo.Stock
      WHERE CodProducto = @cod
        AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
      ORDER BY Deposito
    `),
    prisma.stockAuditEntry.findMany({
      where: { sku: String(sku) },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getDepositoNames(),
  ]);

  if (prodQ.recordset.length === 0) {
    return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
  }

  return NextResponse.json({
    producto: prodQ.recordset[0],
    rows: (stockQ.recordset as { deposito: string; stk: number; stkMin: number; stkMax: number; costo: number; deBaja: boolean }[]).map((r) => ({
      deposito: r.deposito,
      depositoName: names[r.deposito] || `Deposito ${r.deposito}`,
      stk: Number(r.stk),
      stkMin: Number(r.stkMin),
      stkMax: Number(r.stkMax),
      costo: Number(r.costo),
      deBaja: !!r.deBaja,
    })),
    depositosKnown: Object.entries(names).map(([cod, name]) => ({ cod, name })),
    audit: audit.map((a) => ({
      id: a.id,
      deposito: a.deposito,
      depositoName: names[a.deposito] || `Deposito ${a.deposito}`,
      stkAnterior: Number(a.stkAnterior),
      stkNuevo: Number(a.stkNuevo),
      motivo: a.motivo,
      usuario: a.usuario,
      origen: a.origen,
      createdAt: a.createdAt.toISOString(),
    })),
  });
}

/**
 * PUT { sku, deposito, stk, motivo } — admin only.
 * Sets Stk for that (sku, deposito). Creates the Stock row if it doesn't exist
 * (this is the "habilitar producto en deposito" path). Always writes an audit row.
 */
export async function PUT(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as { role?: string; name?: string; permissions?: string[] };
  if (user.role !== "admin" && !(user.permissions || []).includes("stock-sucursales")) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const sku = String(body.sku || "").trim();
    const deposito = String(body.deposito || "").trim();
    const stkNuevo = Number(body.stk);
    const motivo = String(body.motivo || "").trim();

    if (!sku) return NextResponse.json({ error: "sku requerido" }, { status: 400 });
    if (!deposito) return NextResponse.json({ error: "deposito requerido" }, { status: 400 });
    if (!isFinite(stkNuevo)) return NextResponse.json({ error: "stk debe ser un numero" }, { status: 400 });
    if (!motivo) return NextResponse.json({ error: "motivo requerido" }, { status: 400 });

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = String(sku).padStart(7, " ");
    const depPadded = String(deposito).padEnd(3, " ");
    const userName = user.name || "admin";

    // Read product name + current Stk (or null if no row)
    const existsQ = await pool.request().input("cod", codPadded).input("dep", depPadded).query(`
      SELECT TOP 1 ISNULL(Stk, 0) AS stk FROM [${dbProd}].dbo.Stock
      WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
        AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
    `);
    const prodQ = await pool.request().input("cod", codPadded).query(
      `SELECT LTRIM(RTRIM(Nombre)) AS nombre FROM [${dbProd}].dbo.Productos WHERE Cod = @cod`
    );
    const productName = prodQ.recordset[0]?.nombre || sku;
    const stkAnterior = existsQ.recordset.length > 0 ? Number(existsQ.recordset[0].stk) : 0;

    if (existsQ.recordset.length === 0) {
      // Cod is a char(14) PK in PunTouch's Stock — must be unique. Follow the dep-0
      // convention used by the rest of the data:
      //   Cod = RIGHT('   ' + Deposito, 3) + CodProducto(7) + 4 spaces
      const depTrimmed = deposito.trim().padStart(3, " ");
      const stockCod = depTrimmed + codPadded + "    "; // 3 + 7 + 4 = 14 chars

      // First check if we have a snapshot of this (sku, dep) from a previous
      // deshabilitar — restoring it preserves prices/costos/proveedor exactly as
      // they were before, instead of falling back to defaults or to another dep.
      const backup = await prisma.disabledStockBackup.findUnique({
        where: { sku_deposito: { sku, deposito } },
      });
      if (backup) {
        try {
          const snap = JSON.parse(backup.snapshot) as Record<string, unknown>;
          // Helper to safely get a numeric field with fallback
          const n = (k: string) => {
            const v = snap[k];
            if (v === null || v === undefined) return null;
            return typeof v === "number" ? v : Number(v);
          };
          const s = (k: string) => {
            const v = snap[k];
            if (v === null || v === undefined) return null;
            return String(v);
          };
          const b = (k: string) => {
            const v = snap[k];
            return v ? 1 : 0;
          };
          await pool.request()
            .input("cod", stockCod)
            .input("dep", depPadded)
            .input("codProd", codPadded)
            .input("stk", stkNuevo)
            .input("costo", n("Costo") ?? 0)
            .input("moneda", s("Moneda") ?? "0")
            .input("precio", n("Precio"))
            .input("precio2", n("Precio2"))
            .input("precio3", n("Precio3"))
            .input("precio4", n("Precio4"))
            .input("precio5", n("Precio5"))
            .input("porceGan", n("PorceGan"))
            .input("porceGan2", n("PorceGan2"))
            .input("porceGan3", n("PorceGan3"))
            .input("porceGan4", n("PorceGan4"))
            .input("porceGan5", n("PorceGan5"))
            .input("stkMin", n("StkMin"))
            .input("stkMax", n("StkMax"))
            .input("prov1", s("Proveedor1"))
            .input("prov2", s("Proveedor2"))
            .input("prov3", s("Proveedor3"))
            .input("fechaVto", s("FechaVto"))
            .input("fn1", n("FillerNum1"))
            .input("fn2", n("FillerNum2"))
            .input("fn3", n("FillerNum3"))
            .input("fn4", n("FillerNum4"))
            .input("f1", s("Filler1"))
            .input("f2", s("Filler2"))
            .input("f3", s("Filler3"))
            .input("fb1", b("FillerBit1"))
            .input("fb2", b("FillerBit2"))
            .input("fb3", b("FillerBit3"))
            .input("fb4", b("FillerBit4"))
            .query(`
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
              VALUES
                (@cod, @dep, @codProd, '', @stk, 0,
                 @costo, @moneda,
                 @precio, @precio2, @precio3, @precio4, @precio5,
                 @porceGan, @porceGan2, @porceGan3, @porceGan4, @porceGan5,
                 @stkMin, @stkMax,
                 @prov1, @prov2, @prov3,
                 @fechaVto,
                 @fn1, @fn2, @fn3, @fn4,
                 @f1, @f2, @f3,
                 @fb1, @fb2, @fb3, @fb4)
            `);
          // Remove backup so a future deshabilitar gets a fresh snapshot
          await prisma.disabledStockBackup.delete({ where: { id: backup.id } });

          await prisma.stockAuditEntry.create({
            data: {
              sku, productName: productName.substring(0, 120), deposito,
              stkAnterior, stkNuevo,
              motivo: motivo.substring(0, 200),
              usuario: userName, origen: "rehabilitar-restore",
            },
          });
          return NextResponse.json({ ok: true, stkAnterior, stkNuevo, restoredFromBackup: true });
        } catch (e) {
          console.error("Backup restore failed, falling back to copy/defaults:", e);
        }
      }

      // No backup: copy product-meta from any existing dep row (prefer dep 0).
      // If nothing exists anywhere, fall back to a basic INSERT below.
      const insertRes = await pool.request()
        .input("cod", stockCod)
        .input("dep", depPadded)
        .input("codProd", codPadded)
        .input("stk", stkNuevo)
        .query(`
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
          SELECT TOP 1
            @cod, @dep, @codProd, '', @stk, 0,
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
          WHERE s.CodProducto = @codProd
            AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          ORDER BY CASE WHEN LTRIM(RTRIM(s.Deposito)) = '0' THEN 0 ELSE 1 END, s.Deposito
        `);

      // If no source row was found anywhere for this product, fall back to a basic
      // INSERT with sensible defaults so we don't silently no-op.
      if ((insertRes.rowsAffected?.[0] || 0) === 0) {
        await pool.request()
          .input("cod", stockCod)
          .input("dep", depPadded)
          .input("codProd", codPadded)
          .input("stk", stkNuevo)
          .query(`
            INSERT INTO [${dbProd}].dbo.Stock (Cod, Deposito, CodProducto, TalleColor, Stk, Costo, DeBaja, Moneda)
            VALUES (@cod, @dep, @codProd, '', @stk, 0, 0, '0')
          `);
      }
    } else {
      // Update Stk and re-enable the row (DeBaja=0) — manual edit is an explicit
      // habilitar even if the row was previously disabled.
      await pool.request()
        .input("cod", codPadded)
        .input("dep", depPadded)
        .input("stk", stkNuevo)
        .query(`
          UPDATE [${dbProd}].dbo.Stock
          SET Stk = @stk, DeBaja = 0
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
            AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);
    }

    // Audit
    await prisma.stockAuditEntry.create({
      data: {
        sku,
        productName: productName.substring(0, 120),
        deposito,
        stkAnterior,
        stkNuevo,
        motivo: motivo.substring(0, 200),
        usuario: userName,
        origen: "manual",
      },
    });

    return NextResponse.json({ ok: true, stkAnterior, stkNuevo });
  } catch (e) {
    console.error("PUT stock-sucursales error:", e);
    return NextResponse.json({ error: "Error al guardar: " + (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE { sku, deposito, motivo } — admin only.
 * Removes the (sku, deposito) Stock row entirely. PunTouch crashes when it finds
 * a row with DeBaja=1 in a non-default sucursal (FormVentas.Teclado_Ok throws
 * ArgumentOutOfRangeException on the DataGridView), but it handles "no row" path
 * gracefully with the "Producto no disponible en esta sucursal" dialog. So
 * deshabilitar = delete the row. Re-habilitar = INSERT again via the PUT path.
 */
export async function DELETE(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = session.user as { role?: string; name?: string };
  if (user.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  try {
    const body = await req.json();
    const sku = String(body.sku || "").trim();
    const deposito = String(body.deposito || "").trim();
    const motivo = String(body.motivo || "").trim();
    if (!sku) return NextResponse.json({ error: "sku requerido" }, { status: 400 });
    if (!deposito) return NextResponse.json({ error: "deposito requerido" }, { status: 400 });
    if (!motivo) return NextResponse.json({ error: "motivo requerido" }, { status: 400 });

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = String(sku).padStart(7, " ");
    const depPadded = String(deposito).padEnd(3, " ");
    const userName = user.name || "admin";

    // Snapshot the row BEFORE deleting so re-habilitar can restore the same
    // prices/costos/proveedor/etc instead of falling back to defaults.
    const snapshotQ = await pool.request().input("cod", codPadded).input("dep", depPadded).query(`
      SELECT TOP 1 * FROM [${dbProd}].dbo.Stock
      WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
        AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
    `);
    if (snapshotQ.recordset.length === 0) {
      return NextResponse.json({ error: "El producto no esta habilitado en ese deposito" }, { status: 404 });
    }
    const snapshotRow = snapshotQ.recordset[0];
    const stkActual = Number(snapshotRow.Stk || 0);

    const prodQ = await pool.request().input("cod", codPadded).query(
      `SELECT LTRIM(RTRIM(Nombre)) AS nombre FROM [${dbProd}].dbo.Productos WHERE Cod = @cod`
    );
    const productName = prodQ.recordset[0]?.nombre || sku;

    // Persist snapshot in Postgres keyed by (sku, deposito). Upsert so a fresh
    // disable replaces any older backup.
    await prisma.disabledStockBackup.upsert({
      where: { sku_deposito: { sku, deposito } },
      create: { sku, deposito, snapshot: JSON.stringify(snapshotRow), motivo: motivo.substring(0, 200), usuario: userName },
      update: { snapshot: JSON.stringify(snapshotRow), motivo: motivo.substring(0, 200), usuario: userName, createdAt: new Date() },
    });

    await pool.request().input("cod", codPadded).input("dep", depPadded).query(`
      DELETE FROM [${dbProd}].dbo.Stock
      WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
        AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
    `);

    await prisma.stockAuditEntry.create({
      data: {
        sku,
        productName: productName.substring(0, 120),
        deposito,
        stkAnterior: stkActual,
        stkNuevo: stkActual,
        motivo: ("Deshabilitado: " + motivo).substring(0, 200),
        usuario: userName,
        origen: "deshabilitar",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE stock-sucursales error:", e);
    return NextResponse.json({ error: "Error al deshabilitar: " + (e as Error).message }, { status: 500 });
  }
}
