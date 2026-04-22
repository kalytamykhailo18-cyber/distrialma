import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { boleta, pin } = await req.json();
    if (!boleta || !pin) {
      return NextResponse.json({ error: "boleta y pin requeridos" }, { status: 400 });
    }

    // Verify PIN against admin/encargado users
    const bcrypt = await import("bcryptjs");
    const users = await prisma.user.findMany({
      where: { role: { in: ["admin", "staff"] } },
    });

    let authorized = false;
    let authorizedBy = "";
    for (const user of users) {
      if (await bcrypt.compare(pin, user.passwordHash)) {
        authorized = true;
        authorizedBy = user.username;
        break;
      }
    }

    // Also allow a simple PIN from settings
    const pinSetting = await prisma.setting.findUnique({ where: { key: "encargado_pin" } });
    if (pinSetting && pin === pinSetting.value) {
      authorized = true;
      authorizedBy = "encargado";
    }

    if (!authorized) {
      return NextResponse.json({ error: "PIN incorrecto" }, { status: 403 });
    }

    const pool = await getPool();
    const dbTransas = getDbName("transas");

    // Mark the sale as voided (Anulado = 'S')
    const result = await pool.request()
      .input("boleta", boleta.padStart(9, " "))
      .query(`
        UPDATE [${dbTransas}].dbo.Transas
        SET Anulado = 'S'
        WHERE Boleta = @boleta
          AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
      `);

    if (result.rowsAffected[0] === 0) {
      return NextResponse.json({ error: "Venta no encontrada o ya anulada" }, { status: 404 });
    }

    console.log(`[VOID] Boleta ${boleta} anulada por ${authorizedBy}`);

    return NextResponse.json({ ok: true, boleta, authorizedBy, rowsAffected: result.rowsAffected[0] });
  } catch (error) {
    console.error("POS void error:", error);
    return NextResponse.json({ error: "Error al anular" }, { status: 500 });
  }
}
