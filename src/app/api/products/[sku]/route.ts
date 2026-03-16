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
    const isAuthenticated = !!session?.user;

    const product = await getProductBySku(params.sku, isAuthenticated);

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

    product.images = images.map((img) => img.filename);
    product.description = desc?.description;

    return NextResponse.json(product);
  } catch (error) {
    console.error("Error fetching product:", error);
    return NextResponse.json(
      { error: "Error al cargar el producto" },
      { status: 500 }
    );
  }
}
