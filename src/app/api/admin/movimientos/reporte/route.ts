import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session)
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const mes = req.nextUrl.searchParams.get("mes");
  if (!mes) return NextResponse.json({ error: "Mes requerido (YYYY-MM)" }, { status: 400 });

  try {
    const start = new Date(`${mes}-01T00:00:00Z`);
    const end = new Date(start);
    end.setMonth(end.getMonth() + 1);

    // Get all approved movements for the month
    const movements = await prisma.internalMovement.findMany({
      where: {
        estado: "aprobado",
        createdAt: { gte: start, lt: end },
      },
      include: { items: true },
      orderBy: { createdAt: "asc" },
    });

    // Get all active employees from PunTouch (no Vendedor/Usuario filter — same source as the form)
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");
    const empResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
      ORDER BY Nombre
    `);
    const allEmpleados: Array<{ cod: string; nombre: string }> = empResult.recordset;
    const totalEmpleados = allEmpleados.length;

    // Build per-employee breakdown
    const empleadoMap = new Map<string, {
      nombre: string;
      roturas: Array<{ movId: number; fecha: string; productos: string; monto: number; compartidoCon: number }>;
      globales: Array<{ movId: number; fecha: string; productos: string; montoTotal: number; parte: number }>;
      totalRotura: number;
      totalGlobal: number;
    }>();

    // Init all employees
    for (const emp of allEmpleados) {
      empleadoMap.set(emp.cod, {
        nombre: emp.nombre,
        roturas: [],
        globales: [],
        totalRotura: 0,
        totalGlobal: 0,
      });
    }

    for (const mov of movements) {
      const productos = mov.items.map((i) => `${i.productName} x${Number(i.cantidad)}`).join(", ");
      const fecha = mov.createdAt.toISOString();
      const montoTotal = mov.items.reduce((sum, i) => sum + Number(i.costo || 0) * Number(i.cantidad), 0);

      // Both "Rotura de empleado" and "Descuento empleados" go to the per-employee bucket
      if ((mov.destino === "Rotura de empleado" || mov.destino === "Descuento empleados") && mov.empleados) {
        const emps: Array<{ cod: string; nombre: string }> = JSON.parse(mov.empleados);
        const shareCount = emps.length;
        const montoPorEmpleado = shareCount > 0 ? Math.round(montoTotal / shareCount) : 0;

        for (const emp of emps) {
          const entry = empleadoMap.get(emp.cod);
          if (entry) {
            entry.roturas.push({
              movId: mov.id,
              fecha,
              productos,
              monto: montoPorEmpleado,
              compartidoCon: shareCount,
            });
            entry.totalRotura += montoPorEmpleado;
          }
        }
      }

      if (mov.destino === "Descuento global" && totalEmpleados > 0) {
        const montoPorEmpleado = Math.round(montoTotal / totalEmpleados);
        for (const [, entry] of Array.from(empleadoMap.entries())) {
          entry.globales.push({
            movId: mov.id,
            fecha,
            productos,
            montoTotal,
            parte: montoPorEmpleado,
          });
          entry.totalGlobal += montoPorEmpleado;
        }
      }
    }

    // Build response
    const reporte = Array.from(empleadoMap.entries())
      .filter(([, data]) => data.totalRotura > 0 || data.totalGlobal > 0)
      .map(([cod, data]) => ({
        cod,
        nombre: data.nombre,
        roturas: data.roturas,
        globales: data.globales,
        totalRotura: data.totalRotura,
        totalGlobal: data.totalGlobal,
      }));

    return NextResponse.json({
      mes,
      totalMovimientos: movements.length,
      totalEmpleados,
      empleados: reporte,
    });
  } catch (error) {
    console.error("Error generating report:", error);
    return NextResponse.json({ error: "Error al generar reporte" }, { status: 500 });
  }
}
