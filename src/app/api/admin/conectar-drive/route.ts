import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { buildConsentUrl, getDriveStatus, clearRefreshToken } from "@/lib/gdrive";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// GET — return current connection state (used by the admin page)
export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = session.user as { role?: string };
  if (user.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const status = await getDriveStatus();
  return NextResponse.json(status);
}

// POST { action: "connect" | "disconnect" }
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  const user = session.user as { role?: string };
  if (user.role !== "admin") return NextResponse.json({ error: "Solo admin" }, { status: 403 });

  const { action } = await req.json();
  if (action === "disconnect") {
    await clearRefreshToken();
    return NextResponse.json({ ok: true });
  }
  if (action === "connect") {
    const state = randomBytes(16).toString("hex");
    const url = buildConsentUrl(state);
    if (!url) {
      return NextResponse.json({ error: "OAuth no configurado (faltan env vars GOOGLE_OAUTH_*)" }, { status: 500 });
    }
    return NextResponse.json({ url });
  }
  return NextResponse.json({ error: "Accion invalida" }, { status: 400 });
}
