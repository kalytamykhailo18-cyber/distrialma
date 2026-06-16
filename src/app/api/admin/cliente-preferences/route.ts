import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: returns map of clienteCod → preference flags.
//   - No args: returns all known preferences.
//   - ?cliente=COD: returns preference for a single cliente (defaults if none stored).
export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const cliente = searchParams.get("cliente");

  if (cliente) {
    const pref = await prisma.clientePreference.findUnique({ where: { clienteCod: cliente.trim() } });
    return NextResponse.json({
      clienteCod: cliente.trim(),
      boletaPdfEnabled: pref ? pref.boletaPdfEnabled : true,
    });
  }

  const all = await prisma.clientePreference.findMany({
    select: { clienteCod: true, boletaPdfEnabled: true },
  });
  return NextResponse.json({ preferences: all });
}

// POST: upsert preference for a cliente. Body: { clienteCod, boletaPdfEnabled }
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const userName = (session.user as { name?: string })?.name || "admin";

  try {
    const { clienteCod, boletaPdfEnabled } = await req.json();
    if (!clienteCod || typeof clienteCod !== "string") {
      return NextResponse.json({ error: "clienteCod requerido" }, { status: 400 });
    }
    const cod = clienteCod.trim();
    const enabled = !!boletaPdfEnabled;

    const pref = await prisma.clientePreference.upsert({
      where: { clienteCod: cod },
      update: { boletaPdfEnabled: enabled, updatedBy: userName },
      create: { clienteCod: cod, boletaPdfEnabled: enabled, updatedBy: userName },
    });
    return NextResponse.json({ ok: true, pref });
  } catch (error) {
    console.error("ClientePreference POST error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
