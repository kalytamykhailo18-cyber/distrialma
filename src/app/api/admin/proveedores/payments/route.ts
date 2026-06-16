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
      efectivoImagenes: (() => {
        if (!p.efectivoImagenes) return [];
        try {
          const parsed = JSON.parse(p.efectivoImagenes);
          return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
        } catch {
          return [p.efectivoImagenes];
        }
      })(),
      tipoPago: p.tipoPago || "legacy",
      pdfUrl: p.pdfUrl || null,
      driveUrl: p.driveUrl || null,
      montoCheques: Number(p.montoCheques),
      montoEfectivo: Number(p.montoEfectivo),
      montoTransferencia: Number(p.montoTransferencia),
      montoAjuste: Number(p.montoAjuste),
      ajusteMotivo: p.ajusteMotivo || null,
      anuladoAt: p.anuladoAt ? p.anuladoAt.toISOString() : null,
      anuladoBy: p.anuladoBy || null,
    })),
  });
}
