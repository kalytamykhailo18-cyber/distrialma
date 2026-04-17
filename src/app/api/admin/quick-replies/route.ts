import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const replies = await prisma.quickReply.findMany({ orderBy: { shortcut: "asc" } });
  return NextResponse.json({ replies });
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { shortcut, body } = await req.json();
    if (!shortcut?.trim() || !body?.trim()) {
      return NextResponse.json({ error: "shortcut y body requeridos" }, { status: 400 });
    }
    const reply = await prisma.quickReply.create({
      data: { shortcut: shortcut.trim(), body: body.trim() },
    });
    return NextResponse.json({ reply });
  } catch (e: unknown) {
    const msg = e instanceof Error && e.message.includes("Unique") ? "Ese atajo ya existe" : "Error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { id, shortcut, body } = await req.json();
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    const reply = await prisma.quickReply.update({
      where: { id },
      data: { ...(shortcut ? { shortcut: shortcut.trim() } : {}), ...(body ? { body: body.trim() } : {}) },
    });
    return NextResponse.json({ reply });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    await prisma.quickReply.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 400 });
  }
}
