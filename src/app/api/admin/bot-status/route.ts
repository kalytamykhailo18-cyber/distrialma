import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const bot = req.nextUrl.searchParams.get("bot") || "mily";
  const port = bot === "skynet" ? 3098 : 3099;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/status`, { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json({ ...data, bot });
  } catch {
    return NextResponse.json({ status: "bot_offline", qrUrl: null, needsQR: false, bot });
  }
}
