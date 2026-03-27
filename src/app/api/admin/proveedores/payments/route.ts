import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const cod = req.nextUrl.searchParams.get("cod");
  if (!cod) {
    return NextResponse.json({ payments: [] });
  }

  const payments = await prisma.supplierPayment.findMany({
    where: { proveedorCod: cod },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    payments: payments.map((p) => ({
      id: p.id,
      monto: Number(p.monto),
      concepto: p.concepto,
      usuario: p.usuario,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
