import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = session.user as { clientId?: string; role?: string };
  if (!user.clientId) return NextResponse.json({ error: "Sin cliente" }, { status: 400 });

  try {
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");

    // Check if this client code is linked to an employee via Filler1
    const empResult = await pool.request().input("clienteCod", user.clientId).query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE LTRIM(RTRIM(ISNULL(Filler1, ''))) = @clienteCod
        AND (DeBaja = 0 OR DeBaja IS NULL)
    `);

    if (empResult.recordset.length === 0) {
      return NextResponse.json({ isEmpleado: false });
    }

    const emp = empResult.recordset[0];

    // Get descuentos for this month
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(start.getHours() + 3);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    end.setHours(end.getHours() + 3);

    const movements = await prisma.internalMovement.findMany({
      where: { estado: "aprobado", createdAt: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    const descuentos: Array<{
      fecha: string; concepto: string;
      items: Array<{ nombre: string; cantidad: number; costo: number }>;
      compartidoCon: string[] | null; monto: number; cargadoPor: string; imageUrl: string | null;
    }> = [];

    for (const mov of movements) {
      if (!mov.empleados) continue;
      const emps: Array<{ cod: string; nombre: string }> = JSON.parse(mov.empleados);
      if (!emps.some((e) => e.cod === emp.cod)) continue;

      const montoTotal = mov.items.reduce((s, i) => s + Number(i.costo || 0) * Number(i.cantidad), 0);
      const shareCount = emps.length;

      descuentos.push({
        fecha: mov.createdAt.toISOString(),
        concepto: mov.destino || "Descuento",
        items: mov.items.map((i) => ({ nombre: i.productName, cantidad: Number(i.cantidad), costo: Number(i.costo || 0) })),
        compartidoCon: shareCount > 1 ? emps.filter((e) => e.cod !== emp.cod).map((e) => e.nombre) : null,
        monto: Math.round(montoTotal / shareCount),
        cargadoPor: mov.usuario,
        imageUrl: mov.imageUrl,
      });
    }

    // Faltantes
    const cierres = await prisma.cierreCaja.findMany({
      where: { createdAt: { gte: start, lt: end }, chargedAt: { not: null } },
      select: { sucursal: true, responsable: true, diferencia: true, cantVentas: true, chargedBy: true, createdAt: true },
    });

    const faltantes = cierres
      .filter((c) => {
        const nombre = (c.responsable || "").trim().toUpperCase();
        const empFull = emp.nombre.trim().toUpperCase();
        // Match exact full name to avoid mixing employees with same first name
        return nombre === empFull;
      })
      .filter((c) => Number(c.diferencia) < 0)
      .map((c) => ({
        fecha: c.createdAt.toISOString(),
        concepto: "Faltante de caja",
        detalle: `Suc ${c.sucursal} - ${c.cantVentas} ventas`,
        monto: Math.abs(Number(c.diferencia)),
        cargadoPor: (c.responsable || c.chargedBy || "").toString(),
      }));

    const totalDescuentos = descuentos.reduce((s, d) => s + d.monto, 0);
    const totalFaltantes = faltantes.reduce((s, f) => s + f.monto, 0);
    const mesLabel = `${now.toLocaleString("es-AR", { month: "long" })} ${now.getFullYear()}`;

    return NextResponse.json({
      isEmpleado: true,
      empleado: emp.nombre,
      mes: mesLabel,
      descuentos,
      faltantes,
      totalDescuentos,
      totalFaltantes,
      totalGeneral: totalDescuentos + totalFaltantes,
    });
  } catch (error) {
    console.error("Client descuentos error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
