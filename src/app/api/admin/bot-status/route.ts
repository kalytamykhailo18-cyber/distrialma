import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const res = await fetch("http://127.0.0.1:3099/status", { cache: "no-store" });
    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ status: "bot_offline", qrUrl: null, needsQR: false });
  }
}
