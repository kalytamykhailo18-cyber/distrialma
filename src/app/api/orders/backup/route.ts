import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Save a WhatsApp order to PedidoBackup so it's not lost
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = session.user as { clientId?: string; name?: string };

  try {
    const { items, total } = await req.json();

    if (!items?.length) {
      return NextResponse.json({ error: "items requeridos" }, { status: 400 });
    }

    const clienteCod = user.clientId?.trim() || "0";
    const clienteName = user.name || "";
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fechora = now.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);
    const boleta = `WA${Date.now().toString().slice(-7)}`;

    await prisma.pedidoBackup.create({
      data: {
        boleta,
        clienteCod,
        clienteName,
        total: total || 0,
        fechora,
        nroped: null,
        items: JSON.stringify(items.map((i: { sku: string; name: string; quantity: number; price: number; listaPrecio?: number }) => ({
          sku: i.sku?.trim() || "",
          name: i.name || "",
          cant: i.quantity || 0,
          price: i.price || 0,
          listaPrecio: i.listaPrecio || 2,
        }))),
        active: true,
      },
    });

    return NextResponse.json({ ok: true, boleta });
  } catch (error) {
    console.error("WhatsApp order backup error:", error);
    return NextResponse.json({ error: "Error al guardar backup" }, { status: 500 });
  }
}
