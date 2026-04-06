import { NextRequest, NextResponse } from "next/server";
import { getTestPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const SUCURSALES = [
  "Local 1 Minorista",
  "Local 2 Vimar",
  "Local 3 Mayorista Merlo",
  "Local 4 Mayorista Pontevedra",
];

const MOTIVOS = [
  "Envío a local",
  "Descuento empleados",
  "Descuento local",
  "Rotura de proveedor",
  "Rotura de empleado",
  "Descuento global",
];

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
      sucursal: m.sucursal,
      destino: m.destino,
      subtipo: m.subtipo,
      empleados: m.empleados ? JSON.parse(m.empleados) : null,
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
        costo: Number(i.costo || 0),
      })),
    }));

    return NextResponse.json({
      movements: result,
      total,
      sucursales: SUCURSALES,
      motivos: MOTIVOS,
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
    const { sucursal, destino, items, notas, empleados } = body;
    const usuario = session.user?.name || "usuario";

    if (!sucursal || !destino || !items?.length) {
      return NextResponse.json(
        { error: "Sucursal, motivo e items requeridos" },
        { status: 400 }
      );
    }

    if (!SUCURSALES.includes(sucursal)) {
      return NextResponse.json({ error: "Sucursal no válida" }, { status: 400 });
    }
    if (!MOTIVOS.includes(destino)) {
      return NextResponse.json({ error: "Motivo no válido" }, { status: 400 });
    }

    // Fetch current cost for each product from SQL Server
    const pool = await getTestPool();
    const dbProd = getDbName("productos");
    const itemsWithCost = await Promise.all(
      items.map(async (item: { sku: string; productName: string; cantidad: number }) => {
        const cantidad = Math.round((parseFloat(String(item.cantidad).replace(/,/g, ".")) || 0) * 1000) / 1000;
        let costo = 0;
        try {
          const codPadded = padLeft(item.sku, 7);
          const result = await pool.request().input("cod", codPadded).query(
            `SELECT ISNULL(Costo, 0) AS costo FROM [${dbProd}].dbo.Stock WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'`
          );
          costo = result.recordset[0]?.costo || 0;
        } catch { /* ignore */ }
        return { sku: item.sku, productName: item.productName, cantidad, costo };
      })
    );

    const movement = await prisma.internalMovement.create({
      data: {
        sucursal,
        destino,
        empleados: empleados ? JSON.stringify(empleados) : null,
        usuario,
        estado: "pendiente",
        notas: notas || null,
        items: {
          create: itemsWithCost.map((item) => ({
            sku: item.sku,
            productName: item.productName,
            cantidad: item.cantidad,
            costo: item.costo,
          })),
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

// PATCH: Approve or reject movement (admin only)
export async function PATCH(req: NextRequest) {
  const session = await requireStaff();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const user = session.user as { role?: string; name?: string };
  if (user.role !== "admin") {
    return NextResponse.json(
      { error: "Solo admin puede aprobar/rechazar" },
      { status: 403 }
    );
  }

  try {
    const { id, action } = await req.json();
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

    if (action === "rechazar") {
      // Reject — keep record but mark as rechazado
      await prisma.internalMovement.update({
        where: { id: parseInt(id) },
        data: {
          estado: "rechazado",
          aprobadoPor: user.name || "admin",
          aprobadoAt: new Date(),
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Approve — deduct stock
    const pool = await getTestPool();
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
    console.error("Error processing movement:", error);
    return NextResponse.json(
      { error: "Error al procesar movimiento" },
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
