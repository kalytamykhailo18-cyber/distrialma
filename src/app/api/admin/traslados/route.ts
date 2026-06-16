import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

interface TransferItemInput {
  sku: string;
  productName?: string;
  cantidad: number;
}

/**
 * GET — list recent traslados.
 *   ?limit=50  default 50, max 200
 *   ?deposito=X  filter by origen OR destino
 */
function canAccessTraslados(session: { user?: unknown }): boolean {
  const u = session.user as { role?: string; permissions?: string[] } | undefined;
  if (u?.role === "admin") return true;
  return (u?.permissions || []).includes("traslados-stock");
}

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessTraslados(session)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);
  const dep = searchParams.get("deposito");

  const where = dep ? { OR: [{ depositoOrigen: dep }, { depositoDestino: dep }] } : {};
  const transfers = await prisma.stockTransfer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: { items: true },
  });

  return NextResponse.json({
    transfers: transfers.map((t) => ({
      id: t.id,
      depositoOrigen: t.depositoOrigen,
      depositoDestino: t.depositoDestino,
      usuario: t.usuario,
      notas: t.notas,
      estado: t.estado,
      pdfUrl: t.pdfUrl,
      createdAt: t.createdAt.toISOString(),
      anuladoAt: t.anuladoAt?.toISOString() || null,
      anuladoPor: t.anuladoPor,
      motivoAnulado: t.motivoAnulado,
      itemCount: t.items.length,
      totalCantidad: t.items.reduce((sum, i) => sum + Number(i.cantidad), 0),
      items: t.items.map((i) => ({
        sku: i.sku,
        productName: i.productName,
        cantidad: Number(i.cantidad),
      })),
    })),
  });
}

/**
 * POST — create a transfer.
 *   body: { depositoOrigen, depositoDestino, items: [{sku, cantidad}], notas? }
 *
 * Effects:
 *  - Atomically decrements Stk on origen and increments Stk on destino for each item.
 *  - Creates the destino Stock row if missing (habilitar path).
 *  - Persists the StockTransfer + StockTransferItem rows in Prisma.
 *  - Writes a StockAuditEntry per (sku, deposito side) so it shows in the per-product history.
 */
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!canAccessTraslados(session)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }
  const userName = (session.user as { name?: string }).name || "admin";

  try {
    const body = await req.json();
    const origen = String(body.depositoOrigen || "").trim();
    const destino = String(body.depositoDestino || "").trim();
    const notas = body.notas ? String(body.notas).substring(0, 300) : null;
    const itemsIn: TransferItemInput[] = Array.isArray(body.items) ? body.items : [];

    if (!origen || !destino) return NextResponse.json({ error: "Depósito origen y destino requeridos" }, { status: 400 });
    if (origen === destino) return NextResponse.json({ error: "Origen y destino no pueden ser iguales" }, { status: 400 });
    if (itemsIn.length === 0) return NextResponse.json({ error: "No hay items para trasladar" }, { status: 400 });

    // Normalize + validate items
    const items = itemsIn.map((i) => ({
      sku: String(i.sku || "").trim(),
      cantidad: Math.round((Number(i.cantidad) || 0) * 1000) / 1000,
    })).filter((i) => i.sku && i.cantidad > 0);
    if (items.length === 0) return NextResponse.json({ error: "Items invalidos" }, { status: 400 });

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const origenPadded = origen.padEnd(3, " ");
    const destinoPadded = destino.padEnd(3, " ");

    // SQL Server transaction so both sides land or neither
    const tx = new sql.Transaction(pool);
    await tx.begin();

    const processed: Array<{ sku: string; productName: string; cantidad: number; stkOrigenBefore: number; stkOrigenAfter: number; stkDestinoBefore: number; stkDestinoAfter: number }> = [];

    try {
      for (const item of items) {
        const codPadded = item.sku.padStart(7, " ");

        // Read origen + destino current stocks + product name
        const origenQ = await new sql.Request(tx).input("cod", codPadded).input("dep", origenPadded).query(`
          SELECT TOP 1 ISNULL(Stk, 0) AS stk FROM [${dbProd}].dbo.Stock
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
            AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);
        if (origenQ.recordset.length === 0) {
          throw new Error(`El producto ${item.sku} no esta habilitado en el deposito ${origen}`);
        }
        const stkOrigenBefore = Number(origenQ.recordset[0].stk);

        const destQ = await new sql.Request(tx).input("cod", codPadded).input("dep", destinoPadded).query(`
          SELECT TOP 1 ISNULL(Stk, 0) AS stk FROM [${dbProd}].dbo.Stock
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
            AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);
        const stkDestinoBefore = destQ.recordset.length > 0 ? Number(destQ.recordset[0].stk) : 0;

        const prodQ = await new sql.Request(tx).input("cod", codPadded).query(
          `SELECT LTRIM(RTRIM(Nombre)) AS nombre FROM [${dbProd}].dbo.Productos WHERE Cod = @cod`
        );
        if (prodQ.recordset.length === 0) {
          throw new Error(`Producto ${item.sku} no encontrado`);
        }
        const productName = String(prodQ.recordset[0].nombre).substring(0, 120);

        const stkOrigenAfter = Math.round((stkOrigenBefore - item.cantidad) * 1000) / 1000;
        const stkDestinoAfter = Math.round((stkDestinoBefore + item.cantidad) * 1000) / 1000;

        // Decrement origen
        await new sql.Request(tx)
          .input("cod", codPadded)
          .input("dep", origenPadded)
          .input("stk", stkOrigenAfter)
          .query(`
            UPDATE [${dbProd}].dbo.Stock SET Stk = @stk
            WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
              AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
          `);

        // Increment destino — INSERT if missing (creates habilitacion at the same time)
        if (destQ.recordset.length === 0) {
          const depTrimmed = destino.trim().padStart(3, " ");
          const stockCod = depTrimmed + codPadded + "    "; // char(14) PK
          await new sql.Request(tx)
            .input("cod", stockCod)
            .input("dep", destinoPadded)
            .input("codProd", codPadded)
            .input("stk", stkDestinoAfter)
            .query(`
              INSERT INTO [${dbProd}].dbo.Stock (Cod, Deposito, CodProducto, TalleColor, Stk, Costo, DeBaja)
              VALUES (@cod, @dep, @codProd, '', @stk, 0, 0)
            `);
        } else {
          await new sql.Request(tx)
            .input("cod", codPadded)
            .input("dep", destinoPadded)
            .input("stk", stkDestinoAfter)
            .query(`
              UPDATE [${dbProd}].dbo.Stock SET Stk = @stk, DeBaja = 0
              WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
                AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
            `);
        }

        processed.push({ sku: item.sku, productName, cantidad: item.cantidad, stkOrigenBefore, stkOrigenAfter, stkDestinoBefore, stkDestinoAfter });
      }

      await tx.commit();
    } catch (e) {
      try { await tx.rollback(); } catch {}
      throw e;
    }

    // Persist transfer + items + audit in Postgres
    const transfer = await prisma.stockTransfer.create({
      data: {
        depositoOrigen: origen,
        depositoDestino: destino,
        usuario: userName,
        notas,
        estado: "realizado",
        items: {
          create: processed.map((p) => ({ sku: p.sku, productName: p.productName, cantidad: p.cantidad })),
        },
      },
      include: { items: true },
    });

    // Audit rows so they appear in the per-product history
    const motivoTag = `Traslado #${transfer.id} (${origen}→${destino})`;
    await prisma.stockAuditEntry.createMany({
      data: processed.flatMap((p) => [
        {
          sku: p.sku,
          productName: p.productName.substring(0, 120),
          deposito: origen,
          stkAnterior: p.stkOrigenBefore,
          stkNuevo: p.stkOrigenAfter,
          motivo: motivoTag,
          usuario: userName,
          origen: "traslado",
        },
        {
          sku: p.sku,
          productName: p.productName.substring(0, 120),
          deposito: destino,
          stkAnterior: p.stkDestinoBefore,
          stkNuevo: p.stkDestinoAfter,
          motivo: motivoTag,
          usuario: userName,
          origen: "traslado",
        },
      ]),
    });

    return NextResponse.json({ ok: true, transferId: transfer.id, processed: processed.length });
  } catch (e) {
    console.error("POST traslados error:", e);
    return NextResponse.json({ error: "Error: " + (e as Error).message }, { status: 500 });
  }
}
