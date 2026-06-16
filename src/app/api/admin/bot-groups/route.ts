import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const res = await fetch("http://127.0.0.1:3099/groups");
    if (!res.ok) {
      return NextResponse.json({ error: "Bot no disponible", groups: [] }, { status: 503 });
    }
    const data = await res.json();
    return NextResponse.json({ groups: data.groups || [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Error", groups: [] }, { status: 503 });
  }
}
