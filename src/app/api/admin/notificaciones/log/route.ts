import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: returns most recent notification log entry per client, optionally filtered by tipo
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo");

  try {
    const logs = await prisma.notificationLog.findMany({
      where: { ...(tipo ? { tipo } : {}), ok: true },
      orderBy: { createdAt: "desc" },
    });

    // Keep most recent per clientId
    const byClient = new Map<string, { fecha: string; tipo: string; enviadoPor: string | null }>();
    for (const l of logs) {
      if (!byClient.has(l.clientId)) {
        byClient.set(l.clientId, {
          fecha: l.createdAt.toISOString(),
          tipo: l.tipo,
          enviadoPor: l.enviadoPor,
        });
      }
    }

    const result: Record<string, { fecha: string; tipo: string; enviadoPor: string | null }> = {};
    byClient.forEach((v, k) => { result[k] = v; });
    return NextResponse.json({ lastContact: result });
  } catch (error) {
    console.error("notif log error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
