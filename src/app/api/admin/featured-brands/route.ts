import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const withLogos = searchParams.get("logos") === "1";

  const featured = await prisma.featuredBrand.findMany();
  const brandIds = featured.map((f) => f.brandId);

  if (!withLogos) {
    return NextResponse.json({ brandIds });
  }

  // Get brand logos
  const allBrandSkus = brandIds.map((id) => `brand-${id}`);
  const images = await prisma.productImage.findMany({
    where: { sku: { in: allBrandSkus } },
    orderBy: { position: "asc" },
  });

  const logos: Record<string, string> = {};
  for (const img of images) {
    const brandId = img.sku.replace("brand-", "");
    if (!logos[brandId]) logos[brandId] = img.filename;
  }

  // Also get logos for non-featured brands (for admin panel)
  const allImages = await prisma.productImage.findMany({
    where: { sku: { startsWith: "brand-" } },
    orderBy: { position: "asc" },
  });
  for (const img of allImages) {
    const brandId = img.sku.replace("brand-", "");
    if (!logos[brandId]) logos[brandId] = img.filename;
  }

  return NextResponse.json({ brandIds, logos });
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { brandId, featured } = (await req.json()) as {
    brandId: string;
    featured: boolean;
  };

  if (featured) {
    await prisma.featuredBrand.upsert({
      where: { brandId },
      update: {},
      create: { brandId },
    });
  } else {
    await prisma.featuredBrand.deleteMany({ where: { brandId } });
  }

  const all = await prisma.featuredBrand.findMany();
  return NextResponse.json({ brandIds: all.map((f) => f.brandId) });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { brandId } = (await req.json()) as { brandId: string };
  const sku = `brand-${brandId}`;

  // Delete all images for this brand
  const images = await prisma.productImage.findMany({ where: { sku } });
  for (const img of images) {
    // If using Cloudinary, delete from there too
    try {
      const publicId = img.filename.split("/").pop()?.split(".")[0];
      if (publicId) {
        await fetch(`/api/admin/delete-image`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: img.id }),
        });
      }
    } catch { /* */ }
  }
  await prisma.productImage.deleteMany({ where: { sku } });

  return NextResponse.json({ ok: true });
}
