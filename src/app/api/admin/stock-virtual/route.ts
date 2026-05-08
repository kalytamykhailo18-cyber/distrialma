import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// Virtual stock: SKU hijo sells from SKU padre stock
// Every night: reset hijo to target stock, subtract sold quantity from padre
const VIRTUAL_PRODUCTS = [
  { skuHijo: "8009", skuPadre: "482", targetStock: 1000 },
];

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const results = [];

    for (const vp of VIRTUAL_PRODUCTS) {
      const hijoCode = vp.skuHijo.padStart(7, " ");
      const padreCode = vp.skuPadre.padStart(7, " ");

      // Get current hijo stock
      const hijoResult = await pool.request().input("cod", hijoCode).query(`
        SELECT ISNULL(Stk, 0) AS stk FROM [${dbProd}].dbo.Stock
        WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
          AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
      `);
      const currentStock = Number(hijoResult.recordset[0]?.stk || 0);
      const vendido = vp.targetStock - currentStock;

      if (vendido > 0) {
        // Subtract sold from padre
        await pool.request().input("cod", padreCode).input("vendido", vendido).query(`
          UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) - @vendido
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
            AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);
      }

      // Reset hijo to target
      await pool.request().input("cod", hijoCode).input("target", vp.targetStock).query(`
        UPDATE [${dbProd}].dbo.Stock SET Stk = @target
        WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
          AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
      `);

      results.push({
        skuHijo: vp.skuHijo,
        skuPadre: vp.skuPadre,
        stockAntes: currentStock,
        vendido,
        padreDescontado: vendido > 0 ? vendido : 0,
        hijoReseteado: vp.targetStock,
      });

      console.log(`[STOCK-VIRTUAL] ${vp.skuHijo} → ${vp.skuPadre}: vendido ${vendido}kg, padre -${vendido > 0 ? vendido : 0}kg, hijo reset a ${vp.targetStock}`);
    }

    return NextResponse.json({ ok: true, results });
  } catch (error) {
    console.error("Stock virtual error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
