import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
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
      deposito: m.deposito,
      destino: m.destino,
      subtipo: m.subtipo,
      empleados: m.empleados ? JSON.parse(m.empleados) : null,
      usuario: m.usuario,
      estado: m.estado,
      notas: m.notas,
      imageUrl: m.imageUrl,
      aprobadoPor: m.aprobadoPor,
      aprobadoAt: m.aprobadoAt?.toISOString() || null,
      anuladoPor: m.anuladoPor,
      anuladoAt: m.anuladoAt?.toISOString() || null,
      motivoAnulado: m.motivoAnulado,
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

    // Determine deposito: explicit body > user's defaultDeposito > "0"
    let depRaw = "0";
    if (body.deposito && String(body.deposito).trim()) {
      depRaw = String(body.deposito).trim();
    } else {
      const userId = (session.user as { id?: number }).id;
      if (userId) {
        const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { defaultDeposito: true } });
        if (dbUser?.defaultDeposito) depRaw = dbUser.defaultDeposito;
      }
    }

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

    // Fetch prices for each product from SQL Server
    // Pricing rule per motivo:
    //   - Empleado/global motives: charge at Mayorista (Precio2), fallback to Minorista (Precio)
    //   - Other motives: use Costo (warehouse value)
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const isEmpleadoMotivo = ["Descuento empleados", "Rotura de empleado", "Descuento global"].includes(destino);

    const itemsWithCost = await Promise.all(
      items.map(async (item: { sku: string; productName: string; cantidad: number }) => {
        const cantidad = Math.round((parseFloat(String(item.cantidad).replace(/,/g, ".")) || 0) * 1000) / 1000;
        let valor = 0;
        try {
          const codPadded = padLeft(item.sku, 7);
          const result = await pool.request().input("cod", codPadded).input("dep", depRaw).query(
            `SELECT ISNULL(Costo, 0) AS costo, ISNULL(Precio2, 0) AS mayorista, ISNULL(Precio, 0) AS minorista
             FROM [${dbProd}].dbo.Stock WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))`
          );
          const row = result.recordset[0];
          if (row) {
            if (isEmpleadoMotivo) {
              valor = row.mayorista > 0 ? Number(row.mayorista) : Number(row.minorista);
            } else {
              valor = Number(row.costo);
            }
          }
        } catch { /* ignore */ }
        return { sku: item.sku, productName: item.productName, cantidad, costo: valor };
      })
    );

    const movement = await prisma.internalMovement.create({
      data: {
        sucursal,
        deposito: depRaw,
        destino,
        empleados: empleados ? JSON.stringify(empleados) : null,
        usuario,
        estado: "pendiente",
        notas: notas || null,
        imageUrl: body.imageUrl || null,
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
    const body = await req.json();
    const { id, action } = body;
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

    if (action === "rechazar") {
      if (movement.estado !== "pendiente")
        return NextResponse.json({ error: "Solo se pueden rechazar pendientes" }, { status: 400 });
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

    if (action === "anular") {
      if (movement.estado !== "aprobado")
        return NextResponse.json({ error: "Solo se pueden anular movimientos aprobados" }, { status: 400 });
      const motivoAnulado = String(body.motivoAnulado || "").trim().substring(0, 200) || null;

      // Reverse stock — add back the quantities to the same deposito they were taken from
      const pool = await getPool();
      const dbProd = getDbName("productos");
      const dep = movement.deposito || "0";
      for (const item of movement.items) {
        const codPadded = padLeft(item.sku, 7);
        await pool
          .request()
          .input("cod", codPadded)
          .input("dep", dep)
          .input("cant", Number(item.cantidad))
          .query(
            `UPDATE [${dbProd}].dbo.Stock
             SET Stk = ISNULL(Stk, 0) + @cant
             WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))`
          );
      }

      await prisma.internalMovement.update({
        where: { id: parseInt(id) },
        data: {
          estado: "anulado",
          anuladoPor: user.name || "admin",
          anuladoAt: new Date(),
          motivoAnulado,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // Approve — deduct stock from the deposito the movement was created against
    // (legacy entries without a stored deposito fall back to "0").
    if (movement.estado !== "pendiente")
      return NextResponse.json({ error: "Solo se pueden aprobar pendientes" }, { status: 400 });
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const dep = movement.deposito || "0";

    for (const item of movement.items) {
      const codPadded = padLeft(item.sku, 7);
      await pool
        .request()
        .input("cod", codPadded)
        .input("dep", dep)
        .input("cant", Number(item.cantidad))
        .query(
          `UPDATE [${dbProd}].dbo.Stock
           SET Stk = ISNULL(Stk, 0) - @cant
           WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = LTRIM(RTRIM(@dep))`
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
