import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: fetch pending print jobs (used by the Windows client)
// Auth via secret token (no browser session needed)
export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || process.env.RESEND_API_KEY?.slice(0, 16);
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const jobs = await prisma.printJob.findMany({
      where: { printed: false },
      orderBy: { createdAt: "asc" },
      select: { id: true, tipo: true, filename: true, pdfBase64: true, sucursal: true, createdAt: true },
    });
    return NextResponse.json({ jobs });
  } catch (error) {
    console.error("print-queue GET error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// PATCH: mark job as printed
export async function PATCH(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || process.env.RESEND_API_KEY?.slice(0, 16);
  if (!secret || secret !== cronSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { id } = await req.json();
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    await prisma.printJob.update({
      where: { id },
      data: { printed: true, printedAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("print-queue PATCH error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
