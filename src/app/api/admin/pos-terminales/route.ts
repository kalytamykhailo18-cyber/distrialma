import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: list all terminals
export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const terminales = await prisma.posTerminal.findMany({
    orderBy: { id: "asc" },
  });

  return NextResponse.json({ terminales });
}

// POST: create or update terminal
export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = await req.json();
  const { id, nombre, sucursal, sucursalNombre, listas, cuit, razonSocial, direccion, aliasBanco, formatoImpresion, flujo, permisoAnular, permisoPrecio, permisoDevolver, requiereCliente, activa } = body;

  if (!nombre || !sucursal || !cuit || !listas) {
    return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
  }

  const data = {
    nombre,
    sucursal: String(sucursal),
    sucursalNombre: sucursalNombre || "",
    listas: String(listas),
    cuit,
    razonSocial: razonSocial || "",
    direccion: direccion || "",
    aliasBanco: aliasBanco || "",
    formatoImpresion: formatoImpresion || "ticket",
    flujo: flujo || "directo",
    permisoAnular: !!permisoAnular,
    permisoPrecio: !!permisoPrecio,
    permisoDevolver: permisoDevolver !== false,
    requiereCliente: !!requiereCliente,
    activa: activa !== false,
  };

  if (id) {
    const terminal = await prisma.posTerminal.update({
      where: { id: Number(id) },
      data,
    });
    return NextResponse.json({ terminal });
  } else {
    const terminal = await prisma.posTerminal.create({ data });
    return NextResponse.json({ terminal });
  }
}

// DELETE: delete terminal
export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

  await prisma.posTerminal.delete({ where: { id: Number(id) } });
  return NextResponse.json({ ok: true });
}
