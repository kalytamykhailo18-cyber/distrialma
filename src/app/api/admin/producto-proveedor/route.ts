import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const proveedorFilter = searchParams.get("proveedor") || undefined;

    // Get mappings from PostgreSQL
    const mappings = await prisma.productoProveedor.findMany({
      where: proveedorFilter ? { proveedorCod: proveedorFilter } : undefined,
      orderBy: { createdAt: "desc" },
    });

    // Get proveedores from PunTouch
    const pool = await getPool();
    const dbProd = getDbName("productos");

    const provResult = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbProd}].dbo.Proveedores
      ORDER BY Nombre
    `);

    const [marcasRes, rubrosRes] = await Promise.all([
      pool.request().query(`SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM([Desc])) AS nombre FROM [${dbProd}].dbo.Marcas ORDER BY [Desc]`),
      pool.request().query(`SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM([Desc])) AS nombre FROM [${dbProd}].dbo.Rubros ORDER BY [Desc]`),
    ]);

    // Also get PunTouch proveedor assignments from Stock table
    let puntouchMappings: Array<{ sku: string; nombre: string; provCod: string; provName: string }> = [];
    if (proveedorFilter) {
      const ptResult = await pool.request().input("prov", proveedorFilter).query(`
        SELECT LTRIM(RTRIM(s.CodProducto)) AS sku, LTRIM(RTRIM(p.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) AS prov1
        FROM [${dbProd}].dbo.Stock s
        JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
        WHERE LTRIM(RTRIM(s.Deposito)) = '0'
          AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND (LTRIM(RTRIM(ISNULL(s.Proveedor1,''))) = @prov
            OR LTRIM(RTRIM(ISNULL(s.Proveedor2,''))) = @prov
            OR LTRIM(RTRIM(ISNULL(s.Proveedor3,''))) = @prov)
        ORDER BY p.Nombre
      `);
      const provName = provResult.recordset.find((p: { cod: string }) => p.cod === proveedorFilter)?.nombre || "";
      puntouchMappings = ptResult.recordset.map((r: { sku: string; nombre: string }) => ({
        sku: r.sku, nombre: r.nombre, provCod: proveedorFilter, provName,
      }));
    }

    return NextResponse.json({
      mappings,
      puntouchMappings,
      proveedores: provResult.recordset,
      marcas: marcasRes.recordset,
      rubros: rubrosRes.recordset,
    });
  } catch (error) {
    console.error("Error fetching producto-proveedor:", error);
    return NextResponse.json(
      { error: "Error al cargar mappings" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { action } = body;

    if (action === "add") {
      const { sku, productName, proveedorCod, proveedorName } = body;
      if (!sku || !proveedorCod || !proveedorName) {
        return NextResponse.json(
          { error: "sku, proveedorCod y proveedorName requeridos" },
          { status: 400 }
        );
      }

      const mapping = await prisma.productoProveedor.upsert({
        where: {
          sku_proveedorCod: { sku: sku.trim(), proveedorCod: proveedorCod.trim() },
        },
        create: {
          sku: sku.trim(),
          productName: (productName || "").substring(0, 60),
          proveedorCod: proveedorCod.trim(),
          proveedorName: proveedorName.trim(),
        },
        update: {
          productName: (productName || "").substring(0, 60),
        },
      });

      return NextResponse.json({ mapping });
    }

    if (action === "bulk") {
      const { proveedorCod, proveedorName, marcaCod, rubroCod } = body;
      if (!proveedorCod || !proveedorName) {
        return NextResponse.json(
          { error: "proveedorCod y proveedorName requeridos" },
          { status: 400 }
        );
      }
      if (!marcaCod && !rubroCod) {
        return NextResponse.json(
          { error: "marcaCod o rubroCod requerido" },
          { status: 400 }
        );
      }

      const pool = await getPool();
      const dbProd = getDbName("productos");

      // Build filter
      const conditions: string[] = [
        "(DeBaja = 0 OR DeBaja IS NULL)",
      ];
      const request = pool.request();

      if (marcaCod) {
        request.input("marca", String(marcaCod).trim());
        conditions.push("LTRIM(RTRIM(Marca)) = @marca");
      }
      if (rubroCod) {
        request.input("rubro", String(rubroCod).trim());
        conditions.push("LTRIM(RTRIM(Rubro)) = @rubro");
      }

      const result = await request.query(`
        SELECT LTRIM(RTRIM(Cod)) AS sku, LTRIM(RTRIM(Nombre)) AS nombre
        FROM [${dbProd}].dbo.Productos
        WHERE ${conditions.join(" AND ")}
      `);

      console.log(`[PROVEEDOR] Bulk assign: marca=${marcaCod} rubro=${rubroCod} found=${result.recordset.length} products`);
      if (result.recordset.length === 0) {
        return NextResponse.json({ created: 0, total: 0 });
      }

      const data = result.recordset.map((r: { sku: string; nombre: string }) => ({
        sku: r.sku,
        productName: r.nombre.substring(0, 60),
        proveedorCod: proveedorCod.trim(),
        proveedorName: proveedorName.trim(),
      }));

      const created = await prisma.productoProveedor.createMany({
        data,
        skipDuplicates: true,
      });

      return NextResponse.json({ created: created.count, total: data.length });
    }

    return NextResponse.json(
      { error: "Accion no reconocida" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error en producto-proveedor POST:", error);
    return NextResponse.json(
      { error: "Error al guardar mapping" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { sku, proveedorCod } = await req.json();
    if (!sku || !proveedorCod) {
      return NextResponse.json(
        { error: "sku y proveedorCod requeridos" },
        { status: 400 }
      );
    }

    await prisma.productoProveedor.deleteMany({
      where: {
        sku: sku.trim(),
        proveedorCod: proveedorCod.trim(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error en producto-proveedor DELETE:", error);
    return NextResponse.json(
      { error: "Error al eliminar mapping" },
      { status: 500 }
    );
  }
}
