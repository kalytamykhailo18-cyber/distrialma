import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const DESTINOS = [
  "Local 1 Minorista",
  "Local 2 Envío a Vimar",
  "Local 3 Mayorista Merlo",
  "Local 4 Mayorista Pontevedra",
];

const SUBTIPOS = ["Descuento empleados", "Descuento local"];

function padLeft(value: string | number, length: number): string {
  return String(value).padStart(length, " ");
}

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const estado = req.nextUrl.searchParams.get("estado") || "pendiente";
  const destino = req.nextUrl.searchParams.get("destino") || "";
  const mes = req.nextUrl.searchParams.get("mes") || "";
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "200");

  try {
    const where: Record<string, unknown> = {};
    if (estado !== "all") where.estado = estado;
    if (destino) where.destino = destino;
    if (mes) {
      // mes format: "2026-04"
      const start = new Date(`${mes}-01T00:00:00Z`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.createdAt = { gte: start, lt: end };
    }

    const [movements, total] = await Promise.all([
      prisma.internalMovement.findMany({
        where,
        include: { items: true },
        orderBy: { createdAt: "desc" },
        take: limit,
      }),
      prisma.internalMovement.count({ where }),
    ]);

    const result = movements.map((m) => ({
      id: m.id,
      destino: m.destino,
      subtipo: m.subtipo,
      usuario: m.usuario,
      estado: m.estado,
      notas: m.notas,
      aprobadoPor: m.aprobadoPor,
      aprobadoAt: m.aprobadoAt?.toISOString() || null,
      createdAt: m.createdAt.toISOString(),
      itemCount: m.items.length,
      items: m.items.map((i) => ({
        id: i.id,
        sku: i.sku,
        productName: i.productName,
        cantidad: Number(i.cantidad),
      })),
    }));

    return NextResponse.json({
      movements: result,
      total,
      destinos: DESTINOS,
      subtipos: SUBTIPOS,
    });
  } catch (error) {
    console.error("Error fetching movements:", error);
    return NextResponse.json(
      { error: "Error al cargar movimientos" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const { destino, subtipo, items, notas } = body;
    const usuario = session.user?.name || "usuario";

    if (!destino || !items?.length) {
      return NextResponse.json(
        { error: "Destino e items requeridos" },
        { status: 400 }
      );
    }

    // Validate destino or subtipo
    const validDestino = DESTINOS.includes(destino) || SUBTIPOS.includes(destino);
    if (!validDestino) {
      return NextResponse.json({ error: "Destino no válido" }, { status: 400 });
    }

    const movement = await prisma.internalMovement.create({
      data: {
        destino,
        subtipo: subtipo || null,
        usuario,
        estado: "pendiente",
        notas: notas || null,
        items: {
          create: items.map(
            (item: { sku: string; productName: string; cantidad: number }) => ({
              sku: item.sku,
              productName: item.productName,
              cantidad:
                Math.round(
                  (parseFloat(String(item.cantidad).replace(/,/g, ".")) || 0) *
                    1000
                ) / 1000,
            })
          ),
        },
      },
      include: { items: true },
    });

    return NextResponse.json({ movement });
  } catch (error) {
    console.error("Error creating movement:", error);
    return NextResponse.json(
      { error: "Error al crear movimiento" },
      { status: 500 }
    );
  }
}

// PATCH: Approve movement (admin only) — deducts stock
export async function PATCH(req: NextRequest) {
  const session = await requireStaff();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as { role?: string; name?: string };
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Solo admin puede aprobar" },
      { status: 403 }
    );
  }

  try {
    const { id } = await req.json();
    if (!id)
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const movement = await prisma.internalMovement.findUnique({
      where: { id: parseInt(id) },
      include: { items: true },
    });

    if (!movement)
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );

    if (movement.estado !== "pendiente")
      return NextResponse.json(
        { error: "El movimiento ya fue procesado" },
        { status: 400 }
      );

    // Deduct stock in SQL Server
    const pool = await getPool();
    const dbProd = getDbName("productos");

    for (const item of movement.items) {
      const codPadded = padLeft(item.sku, 7);
      await pool
        .request()
        .input("cod", codPadded)
        .input("cant", Number(item.cantidad))
        .query(
          `UPDATE [${dbProd}].dbo.Stock
           SET Stk = ISNULL(Stk, 0) - @cant
           WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'`
        );
    }

    // Mark as approved
    await prisma.internalMovement.update({
      where: { id: parseInt(id) },
      data: {
        estado: "aprobado",
        aprobadoPor: user.name || "admin",
        aprobadoAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error approving movement:", error);
    return NextResponse.json(
      { error: "Error al aprobar movimiento" },
      { status: 500 }
    );
  }
}

// DELETE: Remove pending movement (admin only)
export async function DELETE(req: NextRequest) {
  const session = await requireStaff();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as { role?: string };
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Solo admin puede eliminar" },
      { status: 403 }
    );
  }

  try {
    const { id } = await req.json();
    if (!id)
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });

    const movement = await prisma.internalMovement.findUnique({
      where: { id: parseInt(id) },
    });

    if (!movement)
      return NextResponse.json(
        { error: "Movimiento no encontrado" },
        { status: 404 }
      );

    if (movement.estado !== "pendiente") {
      return NextResponse.json(
        { error: "Solo se pueden eliminar movimientos pendientes" },
        { status: 400 }
      );
    }

    await prisma.internalMovementItem.deleteMany({
      where: { movementId: parseInt(id) },
    });
    await prisma.internalMovement.delete({ where: { id: parseInt(id) } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting movement:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
