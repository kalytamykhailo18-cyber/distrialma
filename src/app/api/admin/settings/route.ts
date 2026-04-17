import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const key = request.nextUrl.searchParams.get("key");
  if (key) {
    const setting = await prisma.setting.findUnique({ where: { key } });
    return NextResponse.json({ key, value: setting?.value || "" });
  }

  const settings = await prisma.setting.findMany();
  const map: Record<string, string> = {};
  for (const s of settings) {
    map[s.key] = s.value;
  }
  return NextResponse.json(map);
}

export async function POST(request: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { key, value } = await request.json();

  if (!key) {
    return NextResponse.json({ error: "key requerido" }, { status: 400 });
  }

  await prisma.setting.upsert({
    where: { key },
    update: { value: String(value) },
    create: { key, value: String(value) },
  });

  return NextResponse.json({ ok: true });
}
