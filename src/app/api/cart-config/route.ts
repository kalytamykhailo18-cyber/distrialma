import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [promos, minSetting, shippingSetting, shippingSkuSetting, shippingPriceSetting] = await Promise.all([
      prisma.articuloPromocional.findMany(),
      prisma.setting.findUnique({ where: { key: "promo_min_subtotal" } }),
      prisma.setting.findUnique({ where: { key: "shipping_threshold" } }),
      prisma.setting.findUnique({ where: { key: "shipping_sku" } }),
      prisma.setting.findUnique({ where: { key: "shipping_price" } }),
    ]);

    return NextResponse.json({
      promoSkus: promos.map((p) => p.sku.trim()),
      minSubtotal: parseFloat(minSetting?.value || "60000"),
      shippingThreshold: parseFloat(shippingSetting?.value || "200000"),
      shippingSku: shippingSkuSetting?.value || "",
      shippingPrice: parseFloat(shippingPriceSetting?.value || "0"),
    });
  } catch (error) {
    console.error("Error loading cart config:", error);
    return NextResponse.json({ promoSkus: [], minSubtotal: 60000, shippingThreshold: 200000, shippingSku: "", shippingPrice: 0 });
  }
}
