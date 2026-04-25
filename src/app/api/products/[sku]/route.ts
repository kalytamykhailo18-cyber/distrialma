import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProductBySku } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: { sku: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const user = session?.user as { role?: string; id?: string } | undefined;
    const userRole = user?.role;
    const canSeeEspecial = userRole === "especial" || userRole === "admin";

    const product = await getProductBySku(params.sku, canSeeEspecial);

    if (!product) {
      return NextResponse.json(
        { error: "Producto no encontrado" },
        { status: 404 }
      );
    }

    const [images, desc] = await Promise.all([
      prisma.productImage.findMany({
        where: { sku: product.sku },
        orderBy: { position: "asc" },
      }),
      prisma.productDescription.findFirst({
        where: { sku: product.sku },
      }),
    ]);

    product.images = images.map((img) => ({ id: img.id, url: img.filename }));
    product.description = desc?.description;

    // Reparto clients: restrict specific products to mayorista only
    const REPARTO_MAYORISTA_ONLY = ["482"];
    if (user?.id && (userRole === "customer" || userRole === "especial") && REPARTO_MAYORISTA_ONLY.includes(product.sku)) {
      const deliveryDays = await prisma.clientDeliveryDay.count({ where: { clientId: user.id } });
      if (deliveryDays > 0) {
        product.precioCajaCerrada = 0;
        product.cantidadPorCaja = 0;
      }
    }

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Error al cargar el producto" },
      { status: 500 }
    );
  }
}
