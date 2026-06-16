import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { generateReciboPdf } from "@/lib/recibo-pdf";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const id = parseInt(ctx.params.id);
  if (isNaN(id)) {
    return NextResponse.json({ error: "ID invalido" }, { status: 400 });
  }

  try {
    const pdfBuffer = await generateReciboPdf(id);
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="Recibo-${id}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generando recibo PDF:", error);
    const msg = (error as Error).message || "Error generando PDF";
    const status = msg.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
