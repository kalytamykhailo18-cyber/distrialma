import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = session.user as { clientId?: string; role?: string };
  if (!user.clientId || user.role === "admin") {
    return NextResponse.json({ error: "Solo clientes" }, { status: 403 });
  }

  try {
    const pool = await getPool();
    const dbClientes = getDbName("clientes");
    const dbTransas = "c:\\puntouch\\bdtransas.mdf";

    // Get client balance
    const clientResult = await pool
      .request()
      .input("cod", user.clientId.padStart(7, " "))
      .query(
        `SELECT LTRIM(RTRIM(c.Nombre)) AS nombre,
                c.Saldo AS saldo,
                c.TotalCompras AS totalCompras,
                c.TotalVeces AS totalVeces
         FROM [${dbClientes}].dbo.Clientes c
         WHERE c.Cod = @cod`
      );

    if (clientResult.recordset.length === 0) {
      return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
    }

    const client = clientResult.recordset[0];

    // Get monthly purchases (current month, Argentina time UTC-3)
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const monthStart = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}01000000`;
    const monthlyResult = await pool
      .request()
      .input("cod2", user.clientId.padStart(7, " "))
      .input("monthStart", monthStart)
      .query(
        `SELECT ISNULL(SUM(t.Total), 0) AS monthlyTotal
         FROM [${dbTransas}].dbo.Transas t
         WHERE t.Cliente = @cod2
           AND t.Tipo IN ('N', 'V')
           AND LTRIM(RTRIM(t.Itm)) = '0'
           AND t.Fechora >= @monthStart`
      );

    // Get last payment
    const lastPayResult = await pool
      .request()
      .input("cod3", user.clientId.padStart(7, " "))
      .query(
        `SELECT TOP 1
          LTRIM(RTRIM(t.Fechora)) AS fechora,
          ABS(t.Deuda) AS amount
         FROM [${dbTransas}].dbo.Transas t
         WHERE t.Cliente = @cod3
           AND t.MovCaja = 'P'
           AND LTRIM(RTRIM(t.Itm)) = '0'
         ORDER BY t.Fechora DESC`
      );

    const monthlyTotal = monthlyResult.recordset[0]?.monthlyTotal || 0;
    const lastPayment = lastPayResult.recordset[0] || null;
    let lastPaymentDate = null;
    let lastPaymentAmount = 0;
    if (lastPayment) {
      const f = lastPayment.fechora;
      lastPaymentDate = f.length >= 8 ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}` : null;
      lastPaymentAmount = lastPayment.amount;
    }

    // Get recent transactions (sales + payments)
    const transResult = await pool
      .request()
      .input("cod", user.clientId.padStart(7, " "))
      .query(
        `SELECT TOP 50
          LTRIM(RTRIM(t.Tipo)) AS tipo,
          LTRIM(RTRIM(t.Fechora)) AS fechora,
          LTRIM(RTRIM(t.Boleta)) AS boleta,
          t.Total AS total,
          t.Deuda AS deuda,
          t.Efectivo AS efectivo,
          t.Tarjeta AS tarjeta,
          LTRIM(RTRIM(ISNULL(t.MovCaja, ''))) AS movCaja
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Cliente = @cod
          AND t.Tipo IN ('N', 'V', 'M')
          AND LTRIM(RTRIM(t.Itm)) = '0'
        ORDER BY t.Fechora DESC`
      );

    const transactions = transResult.recordset.map((t) => {
      let type: string;
      let amount: number;
      if (t.movCaja === "P") {
        type = "Pago";
        amount = Math.abs(t.deuda);
      } else if (t.deuda < 0) {
        type = "Venta (cuenta corriente)";
        amount = t.total;
      } else {
        type = "Venta (contado)";
        amount = t.total;
      }

      const f = t.fechora;
      const date = f.length >= 8
        ? `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`
        : f;
      const time = f.length >= 12
        ? `${f.slice(8, 10)}:${f.slice(10, 12)}`
        : "";

      return {
        type,
        date,
        time,
        boleta: t.boleta,
        total: t.total,
        amount,
        deuda: t.deuda,
        efectivo: t.efectivo,
        tarjeta: t.tarjeta,
        isPago: t.movCaja === "P",
        isDeuda: t.deuda < 0 && t.movCaja !== "P",
      };
    });

    return NextResponse.json({
      nombre: client.nombre,
      saldo: client.saldo,
      monthlyTotal: monthlyTotal,
      lastPaymentDate,
      lastPaymentAmount,
      transactions,
    });
  } catch (error) {
    console.error("Balance error:", error);
    return NextResponse.json({ error: "Error al obtener estado de cuenta" }, { status: 500 });
  }
}
