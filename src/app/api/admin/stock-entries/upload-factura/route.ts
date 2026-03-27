import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { v2 as cloudinary } from "cloudinary";
import { requireStaff } from "@/lib/api-auth";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    const entryId = formData.get("entryId") as string;

    if (!file || !entryId) {
      return NextResponse.json({ error: "Imagen e ID requeridos" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder: "distrialma/facturas",
      public_id: `factura-${entryId}-${Date.now()}`,
    });

    // Save URL to entry
    await prisma.stockEntry.update({
      where: { id: parseInt(entryId) },
      data: { facturaImage: result.secure_url },
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    console.error("Error uploading factura:", error);
    return NextResponse.json({ error: "Error al subir imagen" }, { status: 500 });
  }
}
