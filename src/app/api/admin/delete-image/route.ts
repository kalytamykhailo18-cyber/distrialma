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

export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (
    !session?.user ||
    (session.user as { role?: string }).role !== "admin"
  ) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await request.json();

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const image = await prisma.productImage.findUnique({ where: { id } });
  if (!image) {
    return NextResponse.json({ error: "Imagen no encontrada" }, { status: 404 });
  }

  try {
    const urlParts = image.filename.split("/");
    const fileWithExt = urlParts[urlParts.length - 1];
    const folder = urlParts[urlParts.length - 2];
    const publicId = `${folder}/${fileWithExt.replace(/\.[^.]+$/, "")}`;
    await cloudinary.uploader.destroy(publicId);
  } catch (err) {
    console.error("Cloudinary delete error:", err);
  }

  await prisma.productImage.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
