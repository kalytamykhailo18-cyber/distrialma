import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Allow staff OR clients with empleadoCod
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userInfo = session.user as { role?: string; name?: string; empleadoCod?: string | null };
  const isStaff = userInfo.role === "staff" || userInfo.role === "admin";
  const empleadoCodFromSession = userInfo.empleadoCod;

  if (!isStaff && !empleadoCodFromSession) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const userName = (userInfo.name || "").trim().toUpperCase();
  if (!userName) {
    return NextResponse.json({ error: "Sin usuario" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");

    // Find employee by matching name to username
    const empResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
    `);

    // For admin: accept ?empleado=cod query param to view any employee
    const { searchParams } = new URL(req.url);
    const empCodParam = searchParams.get("empleado");

    let emp;
    if (empCodParam && isStaff) {
      emp = empResult.recordset.find((e: { cod: string }) => e.cod === empCodParam);
    } else if (empleadoCodFromSession) {
      emp = empResult.recordset.find((e: { cod: string }) => e.cod === empleadoCodFromSession);
    } else {
      emp = empResult.recordset.find((e: { cod: string; nombre: string }) => {
        const empName = e.nombre.trim().toUpperCase();
        const uName = userName.toUpperCase();
        return empName.includes(uName) || uName.includes(empName) || empName.split(" ")[0] === uName;
      });
    }

    if (!emp) {
      // Return employee list so admin can pick
      const role = (session.user as { role?: string })?.role;
      if (role === "admin") {
        return NextResponse.json({
          error: "Selecciona un empleado",
          empleados: empResult.recordset.map((e: { cod: string; nombre: string }) => ({ cod: e.cod, nombre: e.nombre })),
        });
      }
      return NextResponse.json({ error: "Empleado no encontrado" }, { status: 404 });
    }

    // Get descuentos for requested month (or current)
    // Non-admin users can only see current month
    const role = (session.user as { role?: string })?.role;
    const mesParam = role === "admin" ? new URL(req.url).searchParams.get("mes") : null;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    let year = now.getFullYear(), month = now.getMonth();
    if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
      const [y, m] = mesParam.split("-").map(Number);
      year = y; month = m - 1;
    }
    const start = new Date(year, month, 1);
    start.setHours(start.getHours() + 3);
    const end = new Date(year, month + 1, 1);
    end.setHours(end.getHours() + 3);

    const movements = await prisma.internalMovement.findMany({
      where: { estado: "aprobado", createdAt: { gte: start, lt: end } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
    });

    const descuentos: Array<{
      fecha: string;
      concepto: string;
      items: Array<{ nombre: string; cantidad: number; costo: number }>;
      compartidoCon: string[] | null;
      monto: number;
      cargadoPor: string;
      imageUrl: string | null;
    }> = [];

    for (const mov of movements) {
      if (!mov.empleados) continue;
      const emps: Array<{ cod: string; nombre: string }> = JSON.parse(mov.empleados);
      const isMe = emps.some((e) => e.cod === emp.cod);
      if (!isMe) continue;

      const montoTotal = mov.items.reduce((s, i) => s + Number(i.costo || 0) * Number(i.cantidad), 0);
      const shareCount = emps.length;

      descuentos.push({
        fecha: mov.createdAt.toISOString(),
        concepto: mov.destino || "Descuento",
        items: mov.items.map((i) => ({ nombre: i.productName, sku: i.sku, cantidad: Number(i.cantidad), costo: Number(i.costo || 0) })),
        compartidoCon: shareCount > 1 ? emps.filter((e) => e.cod !== emp.cod).map((e) => e.nombre) : null,
        monto: Math.round(montoTotal / shareCount),
        cargadoPor: mov.usuario,
        imageUrl: mov.imageUrl,
      });
    }

    // Faltantes de caja
    const cierres = await prisma.cierreCaja.findMany({
      where: { createdAt: { gte: start, lt: end }, chargedAt: { not: null } },
      select: { sucursal: true, responsable: true, diferencia: true, cantVentas: true, chargedAt: true, chargedBy: true, createdAt: true },
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

    const mesDate = new Date(year, month, 15);
    const mesLabel = `${mesDate.toLocaleString("es-AR", { month: "long" })} ${year}`;

    return NextResponse.json({
      empleado: emp.nombre,
      mes: mesLabel,
      descuentos,
      faltantes,
      totalDescuentos,
      totalFaltantes,
      totalGeneral: totalDescuentos + totalFaltantes,
    });
  } catch (error) {
    console.error("Mis descuentos error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
