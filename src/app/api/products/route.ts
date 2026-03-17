import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getProducts } from "@/lib/queries";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const userRole = (session?.user as { role?: string } | undefined)?.role;
    const canSeeEspecial = userRole === "especial" || userRole === "admin";

    const { searchParams } = request.nextUrl;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "24");
    const categoryId = searchParams.get("category") || undefined;
    const brandId = searchParams.get("brand") || undefined;
    const search = searchParams.get("search") || undefined;

    const { products, total } = await getProducts({
      page,
      limit,
      categoryId,
      brandId,
      search,
      includeEspecial: canSeeEspecial,
    });

    // Merge with local PostgreSQL data (images + descriptions)
    const skus = products.map((p) => p.sku);
    const [images, descriptions] = await Promise.all([
      prisma.productImage.findMany({
        where: { sku: { in: skus } },
        orderBy: { position: "asc" },
      }),
      prisma.productDescription.findMany({
        where: { sku: { in: skus } },
      }),
    ]);

    const imageMap = new Map<string, { id: number; url: string }[]>();
    for (const img of images) {
      const list = imageMap.get(img.sku) || [];
      list.push({ id: img.id, url: img.filename });
      imageMap.set(img.sku, list);
    }

    const descMap = new Map<string, string>();
    for (const desc of descriptions) {
      descMap.set(desc.sku, desc.description);
    }

    for (const product of products) {
      product.images = imageMap.get(product.sku) || [];
      product.description = descMap.get(product.sku);
    }

    return NextResponse.json({
      products,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Error fetching products:", error);
    return NextResponse.json(
      { error: "Error al cargar productos" },
      { status: 500 }
    );
  }
}
