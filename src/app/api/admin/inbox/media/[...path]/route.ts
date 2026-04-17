import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Sanitize path — only allow reading from /home/distrialma/bot/session/
  const relPath = params.path.join("/");
  if (relPath.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const absPath = path.join("/home/distrialma/bot/session", relPath);
  if (!absPath.startsWith("/home/distrialma/bot/session/")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  try {
    const buf = fs.readFileSync(absPath);
    const ext = path.extname(absPath).slice(1).toLowerCase();
    const contentType = ext === "png" ? "image/png" : ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "pdf" ? "application/pdf" : "application/octet-stream";
    return new NextResponse(buf, {
      headers: { "Content-Type": contentType, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
}
