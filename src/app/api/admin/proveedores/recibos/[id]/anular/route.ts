import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * Anula un recibo (SupplierPayment):
 *   - Marca SupplierPayment.anuladoAt + anuladoBy
 *   - Marca cheques vinculados como "anulado"
 *   - Devuelve el monto al saldo del proveedor (+monto)
 *
 * No borra registros para conservar el historial. Idempotente: si ya
 * estaba anulado, no vuelve a tocar el saldo.
 */
export async function POST(_req: NextRequest, ctx: { params: { id: string } }) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as { role?: string; permissions?: string[]; name?: string };
  const hasRecibos = user.role === "admin" || (user.permissions?.includes("recibos") ?? false);
  if (!hasRecibos) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const id = parseInt(ctx.params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  try {
    const payment = await prisma.supplierPayment.findUnique({
      where: { id },
      include: { cheques: true },
    });
    if (!payment) {
      return NextResponse.json({ error: "Recibo no encontrado" }, { status: 404 });
    }
    if (payment.anuladoAt) {
      return NextResponse.json({ error: "El recibo ya esta anulado" }, { status: 400 });
    }

    const userName = user.name || "admin";
    const monto = Number(payment.monto);

    await prisma.$transaction(async (tx) => {
      await tx.supplierPayment.update({
        where: { id },
        data: {
          anuladoAt: new Date(),
          anuladoBy: userName,
        },
      });
      if (payment.cheques.length > 0) {
        await tx.cheque.updateMany({
          where: { supplierPaymentId: id },
          data: { estado: "anulado", fechaEstado: new Date() },
        });
      }
    });

    // Reverse PunTouch Proveedores.Saldo (best-effort)
    try {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      await pool
        .request()
        .input("cod", String(payment.proveedorCod).padStart(7, " "))
        .input("monto", monto)
        .query(`
          UPDATE [${dbProd}].dbo.Proveedores
          SET Saldo = ISNULL(Saldo, 0) + @monto
          WHERE Cod = @cod
        `);
    } catch (e) {
      console.error("[ANULAR-SALDO]", (e as Error).message);
    }

    return NextResponse.json({ ok: true, paymentId: id, montoRevertido: monto });
  } catch (error) {
    console.error("Error anulando recibo:", error);
    return NextResponse.json({ error: "Error al anular: " + (error as Error).message }, { status: 500 });
  }
}
