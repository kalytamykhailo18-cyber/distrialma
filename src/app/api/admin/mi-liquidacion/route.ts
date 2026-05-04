import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// GET: returns liquidacion data for the logged-in employee
export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as { name?: string; empleadoCod?: string };
  const { searchParams } = new URL(req.url);
  const mes = searchParams.get("mes");

  // Find empleadoCod from user record or by matching name
  let empleadoCod = user.empleadoCod;

  if (!empleadoCod) {
    // Try to match by username → fichador employee
    const fichador = await prisma.fichadorEmpleado.findFirst({
      where: { nombre: { contains: user.name || "", mode: "insensitive" }, activo: true },
    });
    empleadoCod = fichador?.empleadoCod || undefined;
  }

  if (!empleadoCod) {
    return NextResponse.json({ error: "No se encontro tu codigo de empleado. Pedile al administrador que lo vincule en Usuarios." }, { status: 404 });
  }

  // Redirect to the main liquidacion API with this employee
  const liqUrl = new URL(req.url);
  liqUrl.pathname = "/api/admin/liquidacion";
  liqUrl.searchParams.set("empleado", empleadoCod);
  if (mes) liqUrl.searchParams.set("mes", mes);

  const res = await fetch(liqUrl.toString(), {
    headers: { cookie: req.headers.get("cookie") || "" },
  });
  const data = await res.json();

  return NextResponse.json(data);
}
