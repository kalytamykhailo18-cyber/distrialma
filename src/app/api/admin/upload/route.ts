import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user ||
    (session.user as { role?: string }).role !== "admin"
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("image") as File;
  const sku = formData.get("sku") as string;

  if (!file || !sku) {
    return NextResponse.json(
      { error: "Imagen y SKU requeridos" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(base64, {
    folder: "distrialma",
    public_id: `${sku.trim()}-${Date.now()}`,
    transformation: [
      { width: 800, height: 800, crop: "limit", quality: "auto", format: "webp" },
    ],
  });

  const count = await prisma.productImage.count({ where: { sku: sku.trim() } });

  const image = await prisma.productImage.create({
    data: {
      sku: sku.trim(),
      filename: result.secure_url,
      position: count,
    },
  });

  return NextResponse.json(image);
}
