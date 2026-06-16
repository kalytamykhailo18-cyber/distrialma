import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * POST — anular a stock transfer.
 *
 * Reverses the original transfer atomically:
 *   - For each item, ADDS the qty back to depositoOrigen Stk
 *   - For each item, SUBTRACTS the qty from depositoDestino Stk
 * Then marks the transfer estado="anulado" + records anuladoPor/anuladoAt/motivo.
 *
 * Admin-only — operators can create transfers but only admins can unwind them.
 * A single transfer can only be anulado once.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = session.user as { role?: string; name?: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin puede anular un traslado" }, { status: 403 });
  }
  const userName = user.name || "admin";

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "id invalido" }, { status: 400 });
  }

  try {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!transfer) return NextResponse.json({ error: "Traslado no encontrado" }, { status: 404 });
    if (transfer.estado === "anulado") {
      return NextResponse.json({ error: "Este traslado ya esta anulado" }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const motivoAnulado = String(body.motivoAnulado || "").trim().substring(0, 200) || null;

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const origenPadded = transfer.depositoOrigen.padEnd(3, " ");
    const destinoPadded = transfer.depositoDestino.padEnd(3, " ");

    // Reverse each item: +cant in origen, -cant in destino
    for (const item of transfer.items) {
      const codPadded = item.sku.padStart(7, " ");
      const cant = Number(item.cantidad);
      await pool.request().input("cod", codPadded).input("dep", origenPadded).input("cant", cant).query(`
        UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) + @cant
        WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
          AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
      `);
      await pool.request().input("cod", codPadded).input("dep", destinoPadded).input("cant", cant).query(`
        UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) - @cant
        WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))
          AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
      `);
    }

    await prisma.stockTransfer.update({
      where: { id },
      data: {
        estado: "anulado",
        anuladoAt: new Date(),
        anuladoPor: userName,
        motivoAnulado,
      },
    });

    // Audit rows so the reversal shows in the per-product stock-sucursales history
    const motivoTag = `Anulado traslado #${id} (${transfer.depositoOrigen}→${transfer.depositoDestino})`;
    await prisma.stockAuditEntry.createMany({
      data: transfer.items.flatMap((it) => [
        {
          sku: it.sku,
          productName: it.productName.substring(0, 120),
          deposito: transfer.depositoOrigen,
          stkAnterior: 0,
          stkNuevo: 0,
          motivo: motivoTag,
          usuario: userName,
          origen: "traslado-anulado",
        },
        {
          sku: it.sku,
          productName: it.productName.substring(0, 120),
          deposito: transfer.depositoDestino,
          stkAnterior: 0,
          stkNuevo: 0,
          motivo: motivoTag,
          usuario: userName,
          origen: "traslado-anulado",
        },
      ]),
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("anular traslado error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
