import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { VALID_PERM_KEYS } from "@/lib/permissions";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const user = session.user as { role?: string; permissions?: string[] };
  // Only users with "usuarios" permission (or admin role) can manage users
  if (user.role === "admin") return session;
  if (user.permissions?.includes("usuarios")) return session;
  return null;
}

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const users = await prisma.user.findMany({
    select: { id: true, username: true, role: true, permissions: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const parsed = users.map((u) => {
    let perms: string[] = [];
    try { perms = JSON.parse(u.permissions || "[]"); } catch { /* ignore */ }
    return { ...u, permissions: perms };
  });

  return NextResponse.json({ users: parsed });
}

export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { username, password, permissions } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Usuario y contraseña son obligatorios" }, { status: 400 });
  }

  if (!Array.isArray(permissions) || permissions.length === 0) {
    return NextResponse.json({ error: "Selecciona al menos un permiso" }, { status: 400 });
  }

  const validPerms = permissions.filter((p: string) => VALID_PERM_KEYS.includes(p));
  if (validPerms.length === 0) {
    return NextResponse.json({ error: "Permisos inválidos" }, { status: 400 });
  }

  if (password.length < 4) {
    return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return NextResponse.json({ error: "El usuario ya existe" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  // If all permissions selected, role = admin; otherwise staff
  const isFullAccess = VALID_PERM_KEYS.every((k) => validPerms.includes(k));
  const role = isFullAccess ? "admin" : "staff";

  const user = await prisma.user.create({
    data: { username, passwordHash, role, permissions: JSON.stringify(validPerms) },
    select: { id: true, username: true, role: true, permissions: true, createdAt: true },
  });

  let perms: string[] = [];
  try { perms = JSON.parse(user.permissions || "[]"); } catch { /* ignore */ }

  return NextResponse.json({ user: { ...user, permissions: perms } });
}

export async function PUT(req: NextRequest) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id, username, password, permissions } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  if (username && username !== existing.username) {
    const duplicate = await prisma.user.findUnique({ where: { username } });
    if (duplicate) {
      return NextResponse.json({ error: "El nombre de usuario ya está en uso" }, { status: 409 });
    }
  }

  const data: { username?: string; passwordHash?: string; role?: string; permissions?: string } = {};
  if (username) data.username = username;
  if (password) {
    if (password.length < 4) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 4 caracteres" }, { status: 400 });
    }
    data.passwordHash = await bcrypt.hash(password, 10);
  }
  if (Array.isArray(permissions)) {
    const validPerms = permissions.filter((p: string) => VALID_PERM_KEYS.includes(p));
    data.permissions = JSON.stringify(validPerms);
    const isFullAccess = VALID_PERM_KEYS.every((k) => validPerms.includes(k));
    data.role = isFullAccess ? "admin" : "staff";
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, username: true, role: true, permissions: true, createdAt: true },
  });

  let perms: string[] = [];
  try { perms = JSON.parse(user.permissions || "[]"); } catch { /* ignore */ }

  return NextResponse.json({ user: { ...user, permissions: perms } });
}

export async function DELETE(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await req.json();

  if (!id) {
    return NextResponse.json({ error: "ID requerido" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
  }

  const currentUser = session.user as { name?: string };
  if (user.username === currentUser.name) {
    return NextResponse.json({ error: "No puedes eliminar tu propio usuario" }, { status: 400 });
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
