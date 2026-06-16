import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface DupMember {
  cod: string;
  nombre: string;
  cuit: string;
  telefono: string;
  fechaAlta: string;
  fechaUlt: string;
  saldo: number;
  totalCompras: number;
  totalVeces: number;
  ultimaCompra: string | null;
  deBaja: boolean;
}

interface DupGroup {
  key: string;
  reason: "cuit" | "telefono";
  members: DupMember[];
}

// GET: list all duplicate groups
export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = getDbName("transas");

    // Pull all clientes + their relevant fields. Computing dups in JS is simpler
    // than a giant SQL self-join and lets us merge CUIT and phone groups easily.
    const allRes = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(ISNULL(Nombre,''))) AS nombre,
        REPLACE(REPLACE(LTRIM(RTRIM(ISNULL(CUIT,''))),'-',''),' ','') AS cuit,
        LTRIM(RTRIM(ISNULL(TelClave1,''))) AS tel1,
        LTRIM(RTRIM(ISNULL(Telclave3,''))) AS tel3,
        LTRIM(RTRIM(ISNULL(FechaAlta,''))) AS fechaAlta,
        LTRIM(RTRIM(ISNULL(FechaUlt,''))) AS fechaUlt,
        ISNULL(Saldo, 0) AS saldo,
        ISNULL(TotalCompras, 0) AS totalCompras,
        ISNULL(TotalVeces, 0) AS totalVeces,
        ISNULL(DeBaja, 0) AS deBaja
      FROM [${dbClientes}].dbo.Clientes
    `);
    const rows = allRes.recordset as Array<{
      cod: string; nombre: string; cuit: string;
      tel1: string; tel3: string;
      fechaAlta: string; fechaUlt: string;
      saldo: number; totalCompras: number; totalVeces: number; deBaja: number;
    }>;

    // Index by cuit and phone tail
    const byCuit = new Map<string, string[]>();
    const byPhone = new Map<string, string[]>();
    const tailOf = (s: string) => s.replace(/[^0-9]/g, "").slice(-10);

    for (const r of rows) {
      if (r.cuit && r.cuit.length >= 7) {
        if (!byCuit.has(r.cuit)) byCuit.set(r.cuit, []);
        byCuit.get(r.cuit)!.push(r.cod);
      }
      for (const t of [tailOf(r.tel1), tailOf(r.tel3)]) {
        if (t.length === 10) {
          if (!byPhone.has(t)) byPhone.set(t, []);
          byPhone.get(t)!.push(r.cod);
        }
      }
    }

    // De-dup the cod lists per group (a cliente may appear twice if both tels match)
    const dedupCods = (cods: string[]) => Array.from(new Set(cods));

    const groups: DupGroup[] = [];
    const seenCodsInGroup = new Map<string, Set<string>>(); // key -> set of cods

    Array.from(byCuit.entries()).forEach(([key, cods]) => {
      const unique = dedupCods(cods);
      if (unique.length < 2) return;
      groups.push({ key, reason: "cuit", members: [] });
      seenCodsInGroup.set("cuit:" + key, new Set(unique));
    });
    Array.from(byPhone.entries()).forEach(([key, cods]) => {
      const unique = dedupCods(cods);
      if (unique.length < 2) return;
      const alreadyCovered = unique.every((c) => {
        let covered = false;
        Array.from(seenCodsInGroup.entries()).some(([k, set]) => {
          if (k.startsWith("cuit:") && set.has(c)) { covered = true; return true; }
          return false;
        });
        return covered;
      });
      if (alreadyCovered) return;
      groups.push({ key, reason: "telefono", members: [] });
    });

    // Build cod → row map for fast lookups when filling members
    const rowByCod = new Map<string, typeof rows[number]>();
    for (const r of rows) rowByCod.set(r.cod, r);

    // Collect all cods we need ultimaCompra for
    const allDupCods = new Set<string>();
    for (const g of groups) {
      const codList = g.reason === "cuit" ? byCuit.get(g.key)! : byPhone.get(g.key)!;
      for (const c of dedupCods(codList)) allDupCods.add(c);
    }

    // Bulk query Transas for the latest Fechora per cliente
    const ultimaCompraByCod = new Map<string, string>();
    if (allDupCods.size > 0) {
      const codArr = Array.from(allDupCods);
      // Batch in chunks of 500 to keep parameter count reasonable
      const chunkSize = 500;
      for (let i = 0; i < codArr.length; i += chunkSize) {
        const chunk = codArr.slice(i, i + chunkSize);
        const req = pool.request();
        chunk.forEach((c, j) => req.input(`c${j}`, c.padStart(7, " ")));
        const ph = chunk.map((_, j) => `@c${j}`).join(",");
        const ucRes = await req.query(`
          SELECT LTRIM(RTRIM(t.Cliente)) AS cod, MAX(LTRIM(RTRIM(t.Fechora))) AS fechora
          FROM [${dbTransas}].dbo.Transas t
          WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0' AND t.Cliente IN (${ph})
          GROUP BY LTRIM(RTRIM(t.Cliente))
        `);
        for (const r of ucRes.recordset) ultimaCompraByCod.set(r.cod, r.fechora);
      }
    }

    // Materialise members
    for (const g of groups) {
      const codList = g.reason === "cuit" ? byCuit.get(g.key)! : byPhone.get(g.key)!;
      const uniqueCods = dedupCods(codList);
      const members: DupMember[] = uniqueCods.map((cod) => {
        const r = rowByCod.get(cod);
        const tel = (r?.tel1 && r.tel1.replace(/[^0-9]/g, "").length >= 8) ? r.tel1 : (r?.tel3 || "");
        return {
          cod,
          nombre: r?.nombre || "",
          cuit: r?.cuit || "",
          telefono: tel,
          fechaAlta: r?.fechaAlta || "",
          fechaUlt: r?.fechaUlt || "",
          saldo: Number(r?.saldo || 0),
          totalCompras: Number(r?.totalCompras || 0),
          totalVeces: Number(r?.totalVeces || 0),
          ultimaCompra: ultimaCompraByCod.get(cod) || null,
          deBaja: !!r?.deBaja,
        };
      });
      // Sort: keep the strongest (most compras, then most recent purchase) first
      members.sort((a, b) => {
        const aScore = a.totalVeces + (a.ultimaCompra ? 1000 : 0);
        const bScore = b.totalVeces + (b.ultimaCompra ? 1000 : 0);
        if (bScore !== aScore) return bScore - aScore;
        return (b.ultimaCompra || "").localeCompare(a.ultimaCompra || "");
      });
      g.members = members;
    }

    // Sort groups: cuit groups first (more reliable signal), then by size
    groups.sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === "cuit" ? -1 : 1;
      return b.members.length - a.members.length;
    });

    return NextResponse.json({
      total: groups.length,
      cuitGroups: groups.filter((g) => g.reason === "cuit").length,
      phoneGroups: groups.filter((g) => g.reason === "telefono").length,
      groups,
    });
  } catch (error) {
    console.error("Duplicados error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST:
//   mode: "baja"   { cods, deBaja=true|false }   — flip DeBaja on each cod
//   mode: "unify"  { keeperCod, dupCods }        — move history + saldo onto keeper,
//                                                  blank CUIT/teléfonos on dups, mark them DeBaja=1.
//                                                  Snapshots written to ClienteUnifyBackup for reversibility.
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userName = (session.user as { name?: string })?.name || "admin";
  try {
    const body = await req.json();
    const mode = body.mode === "unify" ? "unify" : "baja";

    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbPedidos = getDbName("pedidos");
    const dbTransas = getDbName("transas");

    if (mode === "baja") {
      const cods: string[] = Array.isArray(body.cods) ? body.cods.filter((c: unknown) => typeof c === "string" && c.length > 0) : [];
      const deBaja = body.deBaja !== false;
      if (cods.length === 0) {
        return NextResponse.json({ error: "cods requeridos" }, { status: 400 });
      }
      const r = pool.request().input("flag", deBaja ? 1 : 0);
      cods.forEach((c, i) => r.input(`c${i}`, c.padStart(7, " ")));
      const ph = cods.map((_, i) => `@c${i}`).join(",");
      await r.query(`
        UPDATE [${dbClientes}].dbo.Clientes
        SET DeBaja = @flag
        WHERE Cod IN (${ph})
      `);
      return NextResponse.json({ ok: true, updated: cods.length, deBaja });
    }

    // mode === "unify"
    const keeperCodRaw: string = typeof body.keeperCod === "string" ? body.keeperCod.trim() : "";
    const dupCods: string[] = Array.isArray(body.dupCods)
      ? body.dupCods.filter((c: unknown) => typeof c === "string" && c.trim().length > 0).map((c: string) => c.trim())
      : [];
    if (!keeperCodRaw || dupCods.length === 0) {
      return NextResponse.json({ error: "keeperCod y dupCods requeridos" }, { status: 400 });
    }
    if (dupCods.includes(keeperCodRaw)) {
      return NextResponse.json({ error: "keeperCod no puede estar en dupCods" }, { status: 400 });
    }

    const keeperPadded = keeperCodRaw.padStart(7, " ");
    const dupPadded = dupCods.map((c) => c.padStart(7, " "));

    // Read keeper + dups snapshot first (everything we need to revert).
    const snapReq = pool.request();
    [keeperPadded, ...dupPadded].forEach((p, i) => snapReq.input(`s${i}`, p));
    const snapPh = [keeperPadded, ...dupPadded].map((_, i) => `@s${i}`).join(",");
    const snapRes = await snapReq.query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(ISNULL(Nombre,''))) AS nombre,
        LTRIM(RTRIM(ISNULL(CUIT,''))) AS cuit,
        LTRIM(RTRIM(ISNULL(TelClave1,''))) AS tel1,
        LTRIM(RTRIM(ISNULL(Telclave3,''))) AS tel3,
        ISNULL(Saldo, 0) AS saldo,
        ISNULL(TotalCompras, 0) AS totalCompras,
        ISNULL(TotalVeces, 0) AS totalVeces,
        ISNULL(DeBaja, 0) AS deBaja,
        LTRIM(RTRIM(ISNULL(MotivoBaja,''))) AS motivoBaja
      FROM [${dbClientes}].dbo.Clientes
      WHERE Cod IN (${snapPh})
    `);
    type SnapRow = {
      cod: string; nombre: string; cuit: string; tel1: string; tel3: string;
      saldo: number; totalCompras: number; totalVeces: number;
      deBaja: number; motivoBaja: string;
    };
    const snapRows = snapRes.recordset as SnapRow[];
    const snapByCod = new Map<string, SnapRow>();
    for (const r of snapRows) snapByCod.set(r.cod, r);
    if (!snapByCod.has(keeperCodRaw)) {
      return NextResponse.json({ error: "keeper no encontrado" }, { status: 404 });
    }
    const missingDups = dupCods.filter((c) => !snapByCod.has(c));
    if (missingDups.length > 0) {
      return NextResponse.json({ error: `dups no encontrados: ${missingDups.join(",")}` }, { status: 404 });
    }

    // Sums to add to keeper.
    let addSaldo = 0;
    let addCompras = 0;
    let addVeces = 0;
    for (const c of dupCods) {
      const r = snapByCod.get(c)!;
      addSaldo += Number(r.saldo) || 0;
      addCompras += Number(r.totalCompras) || 0;
      addVeces += Number(r.totalVeces) || 0;
    }

    // Run the merge inside a single SQL transaction.
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let affectedPedidos = 0;
    let affectedTransas = 0;
    try {
      // Reassign history.
      const buildDupReq = () => {
        const r = new sql.Request(tx).input("keeper", keeperPadded);
        dupPadded.forEach((p, i) => r.input(`d${i}`, p));
        return r;
      };
      const dupPh = dupPadded.map((_, i) => `@d${i}`).join(",");

      const pedRes = await buildDupReq().query(`
        UPDATE [${dbPedidos}].dbo.Pedidos
        SET Cliente = @keeper
        WHERE Cliente IN (${dupPh})
      `);
      affectedPedidos = pedRes.rowsAffected[0] || 0;

      const trRes = await buildDupReq().query(`
        UPDATE [${dbTransas}].dbo.Transas
        SET Cliente = @keeper
        WHERE Cliente IN (${dupPh})
      `);
      affectedTransas = trRes.rowsAffected[0] || 0;

      // Accumulate keeper's stats.
      await new sql.Request(tx)
        .input("keeper", keeperPadded)
        .input("addSaldo", addSaldo)
        .input("addCompras", addCompras)
        .input("addVeces", addVeces)
        .query(`
          UPDATE [${dbClientes}].dbo.Clientes
          SET Saldo = ISNULL(Saldo, 0) + @addSaldo,
              TotalCompras = ISNULL(TotalCompras, 0) + @addCompras,
              TotalVeces = ISNULL(TotalVeces, 0) + @addVeces
          WHERE Cod = @keeper
        `);

      // Mark duplicates: empty CUIT + teléfonos, zero saldo + compras, set DeBaja + MotivoBaja.
      const motivo = `Unificado en ${keeperCodRaw}`.substring(0, 40);
      const dupMarkReq = new sql.Request(tx)
        .input("motivo", motivo);
      dupPadded.forEach((p, i) => dupMarkReq.input(`d${i}`, p));
      await dupMarkReq.query(`
        UPDATE [${dbClientes}].dbo.Clientes
        SET DeBaja = 1,
            MotivoBaja = @motivo,
            Saldo = 0,
            TotalCompras = 0,
            TotalVeces = 0,
            CUIT = '              ',
            TelClave1 = '              ',
            Telclave3 = '              '
        WHERE Cod IN (${dupPh})
      `);

      await tx.commit();
    } catch (txErr) {
      try { await tx.rollback(); } catch { /* ignore */ }
      throw txErr;
    }

    // Persist the pre-merge snapshot for reversibility.
    try {
      await prisma.clienteUnifyBackup.create({
        data: {
          keeperCod: keeperCodRaw,
          dupCods: dupCods.join(","),
          snapshot: JSON.stringify({
            keeper: snapByCod.get(keeperCodRaw),
            dups: dupCods.map((c) => snapByCod.get(c)),
          }),
          affectedPedidos,
          affectedTransas,
          createdBy: userName,
        },
      });
    } catch (e) {
      // Snapshot is for revert convenience only — don't fail the call if it can't be written.
      console.error("Unify snapshot save error:", e);
    }

    return NextResponse.json({
      ok: true,
      mode: "unify",
      keeperCod: keeperCodRaw,
      dupCods,
      affectedPedidos,
      affectedTransas,
      addSaldo,
      addCompras,
      addVeces,
    });
  } catch (error) {
    console.error("Duplicados update error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
