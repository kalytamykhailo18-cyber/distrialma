import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: load terminal config + employees + client search
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const terminalId = req.nextUrl.searchParams.get("terminalId");
  const searchClient = req.nextUrl.searchParams.get("searchClient");

  try {
    const pool = await getPool();
    const dbEmpleados = getDbName("empleados");
    const dbClientes = getDbName("clientes");

    // Get terminal config
    let terminal = null;
    if (terminalId) {
      terminal = await prisma.posTerminal.findUnique({ where: { id: Number(terminalId) } });
    }

    // Get all active employees (not just vendedores)
    const empResult = await pool.request().query(`
      SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbEmpleados}].dbo.Empleados
      WHERE (DeBaja = 0 OR DeBaja IS NULL)
      ORDER BY Nombre
    `);

    // Search clients if requested
    let clientes: Array<{ cod: string; nombre: string; cuit: string; zona: string; listaPrecios: string }> = [];
    if (searchClient && searchClient.length >= 2) {
      const clientResult = await pool.request()
        .input("search", `%${searchClient}%`)
        .query(`
          SELECT TOP 15
            LTRIM(RTRIM(c.Cod)) AS cod,
            LTRIM(RTRIM(c.Nombre)) AS nombre,
            LTRIM(RTRIM(ISNULL(c.CUIT, ''))) AS cuit,
            LTRIM(RTRIM(ISNULL(z.[Desc], ''))) AS zona,
            LTRIM(RTRIM(ISNULL(c.ListaPrecios, ''))) AS listaPrecios
          FROM [${dbClientes}].dbo.Clientes c
          LEFT JOIN [${dbClientes}].dbo.Zonas z ON z.Cod = c.Zona
          WHERE (c.Nombre LIKE @search OR LTRIM(RTRIM(c.CUIT)) LIKE @search OR LTRIM(RTRIM(c.Cod)) LIKE @search)
            AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
          ORDER BY c.Nombre
        `);
      clientes = clientResult.recordset;
    }

    return NextResponse.json({
      terminal,
      empleados: empResult.recordset,
      clientes,
    });
  } catch (error) {
    console.error("POS config error:", error);
    return NextResponse.json({ error: "Error al cargar configuracion" }, { status: 500 });
  }
}
