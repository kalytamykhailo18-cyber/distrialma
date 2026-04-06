import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";

// GET: List vendedores from PunTouch + their commissions and settings
export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");
    const dbProd = getDbName("productos");

    // Get vendedores from Empleados table
    const empResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL) AND Vendedor = 1
      ORDER BY Nombre
    `);

    // Get rubros
    const rubrosResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM([Desc])) AS nombre
      FROM [${dbProd}].dbo.Rubros
      WHERE [Desc] IS NOT NULL AND [Desc] <> ''
      ORDER BY [Desc]
    `);

    // Get all commissions and promotional items
    const [comisiones, promocionales] = await Promise.all([
      prisma.vendedorComision.findMany(),
      prisma.articuloPromocional.findMany(),
    ]);

    // Get settings
    const settings = await prisma.setting.findMany({
      where: { key: { in: ["vendedor_markup", "vendedor_min_order", "vendedor_default_comision"] } },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));

    return NextResponse.json({
      vendedores: empResult.recordset,
      rubros: rubrosResult.recordset,
      comisiones: comisiones.map((c) => ({
        id: c.id,
        vendedorCod: c.vendedorCod,
        rubroCod: c.rubroCod,
        porcentaje: Number(c.porcentaje),
      })),
      promocionales: promocionales.map((p) => p.sku),
      settings: {
        markup: parseFloat(settingsMap.vendedor_markup || "3"),
        minOrder: parseFloat(settingsMap.vendedor_min_order || "0"),
        defaultComision: parseFloat(settingsMap.vendedor_default_comision || "3"),
      },
    });
  } catch (error) {
    console.error("Error fetching vendedores:", error);
    return NextResponse.json({ error: "Error al cargar vendedores" }, { status: 500 });
  }
}

// POST: Update commission for a vendedor + rubro
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { vendedorCod, rubroCod, porcentaje } = await req.json();
    if (!vendedorCod || !rubroCod) {
      return NextResponse.json({ error: "Datos requeridos" }, { status: 400 });
    }

    const pct = parseFloat(porcentaje) || 0;

    if (pct === 0) {
      // Delete if exists
      await prisma.vendedorComision.deleteMany({ where: { vendedorCod, rubroCod } });
    } else {
      await prisma.vendedorComision.upsert({
        where: { vendedorCod_rubroCod: { vendedorCod, rubroCod } },
        update: { porcentaje: pct },
        create: { vendedorCod, rubroCod, porcentaje: pct },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating commission:", error);
    return NextResponse.json({ error: "Error al actualizar comisión" }, { status: 500 });
  }
}

// PATCH: Update settings
export async function PATCH(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const { markup, minOrder, defaultComision } = await req.json();

    const updates: Array<{ key: string; value: string }> = [];
    if (markup !== undefined) updates.push({ key: "vendedor_markup", value: String(markup) });
    if (minOrder !== undefined) updates.push({ key: "vendedor_min_order", value: String(minOrder) });
    if (defaultComision !== undefined) updates.push({ key: "vendedor_default_comision", value: String(defaultComision) });

    for (const u of updates) {
      await prisma.setting.upsert({
        where: { key: u.key },
        update: { value: u.value },
        create: u,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating settings:", error);
    return NextResponse.json({ error: "Error al actualizar configuración" }, { status: 500 });
  }
}
