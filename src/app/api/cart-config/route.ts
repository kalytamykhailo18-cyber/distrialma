import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [promos, minSetting, shippingSetting, shippingSkuSetting] = await Promise.all([
      prisma.articuloPromocional.findMany(),
      prisma.setting.findUnique({ where: { key: "promo_min_subtotal" } }),
      prisma.setting.findUnique({ where: { key: "shipping_threshold" } }),
      prisma.setting.findUnique({ where: { key: "shipping_sku" } }),
    ]);

    const shippingSku = shippingSkuSetting?.value || "1";

    // Get shipping price from PunTouch SKU (Gaston stores it in SKU 1)
    let shippingPrice = 0;
    try {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      const r = await pool.request().input("sku", shippingSku.padStart(7, " ")).query(`
        SELECT TOP 1 ISNULL(s.Precio2, 0) AS precio
        FROM [${dbProd}].dbo.Stock s
        WHERE s.CodProducto = @sku
          AND LTRIM(RTRIM(s.Deposito)) = '0'
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
      `);
      if (r.recordset.length > 0) shippingPrice = Number(r.recordset[0].precio);
    } catch { /* fallback to 0 */ }

    return NextResponse.json({
      promoSkus: promos.map((p) => p.sku.trim()),
      minSubtotal: parseFloat(minSetting?.value || "60000"),
      shippingThreshold: parseFloat(shippingSetting?.value || "200000"),
      shippingSku,
      shippingPrice,
    });
  } catch (error) {
    console.error("Error loading cart config:", error);
    return NextResponse.json({ promoSkus: [], minSubtotal: 60000, shippingThreshold: 200000, shippingSku: "1", shippingPrice: 0 });
  }
}
