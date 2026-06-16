import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * POST { cod, delta, motivo } — admin only.
 *
 * Applies a signed delta to PunTouch Proveedores.Saldo (Saldo += delta) and
 * records an audit row in SupplierPayment with tipoPago="ajuste-manual" so it
 * shows up in the proveedor history. `delta` is signed: positive ADDS to the
 * saldo (clears a "saldo a favor" / negative balance), negative SUBTRACTS
 * (clears a "deuda" / positive balance).
 *
 * `motivo` is required for the audit trail.
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
    const body = await req.json();
    const cod: string = body.cod;
    const delta: number = Number(body.delta);
    const motivo: string = (body.motivo || "").trim();

    if (!cod) return NextResponse.json({ error: "Cod requerido" }, { status: 400 });
    if (!isFinite(delta) || delta === 0) {
      return NextResponse.json({ error: "Delta debe ser un numero distinto de 0" }, { status: 400 });
    }
    if (!motivo) return NextResponse.json({ error: "Motivo requerido" }, { status: 400 });

    const codPadded = String(cod).padStart(7, " ");
    const userName = user.name || "admin";

    // Apply delta on PunTouch
    const pool = await getPool();
    const dbProd = getDbName("productos");
    await pool
      .request()
      .input("cod", codPadded)
      .input("delta", Math.round(delta * 100) / 100)
      .query(`
        UPDATE [${dbProd}].dbo.Proveedores
        SET Saldo = ISNULL(Saldo, 0) + @delta
        WHERE Cod = @cod
      `);

    // Read back nombre + new saldo
    const r = await pool.request().input("cod", codPadded).query(`
      SELECT LTRIM(RTRIM(Nombre)) AS nombre, ISNULL(Saldo, 0) AS saldo
      FROM [${dbProd}].dbo.Proveedores
      WHERE Cod = @cod
    `);
    const proveedorName: string = r.recordset[0]?.nombre || "";
    const nuevoSaldo: number = Number(r.recordset[0]?.saldo || 0);

    // Audit: store a SupplierPayment with the special tipoPago.  We allow a
    // negative `monto` here because it represents a saldo addition.
    const payment = await prisma.supplierPayment.create({
      data: {
        proveedorCod: String(cod),
        proveedorName: proveedorName.substring(0, 60),
        monto: Math.round(delta * 100) / 100,
        concepto: `Ajuste manual: ${motivo}`.substring(0, 100),
        usuario: userName,
        tipoPago: "ajuste-manual",
        montoAjuste: Math.round(delta * 100) / 100,
        ajusteMotivo: motivo.substring(0, 200),
      },
    });

    return NextResponse.json({ ok: true, paymentId: payment.id, nuevoSaldo, delta });
  } catch (error) {
    console.error("Error en ajuste-saldo:", error);
    return NextResponse.json({ error: "Error al ajustar saldo: " + (error as Error).message }, { status: 500 });
  }
}
