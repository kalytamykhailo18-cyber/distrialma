import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(Cod)) AS cod,
        LTRIM(RTRIM(Nombre)) AS nombre,
        ISNULL(Saldo, 0) AS saldo
      FROM [${dbProd}].dbo.Proveedores
      ORDER BY Nombre
    `);

    return NextResponse.json({ proveedores: result.recordset });
  } catch (error) {
    console.error("Error fetching proveedores:", error);
    return NextResponse.json(
      { error: "Error al cargar proveedores" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { nombre } = await req.json();
    if (!nombre?.trim()) {
      return NextResponse.json(
        { error: "Nombre requerido" },
        { status: 400 }
      );
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Find next free Cod
    const maxResult = await pool.request().query(`
      SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod
      FROM [${dbProd}].dbo.Proveedores
    `);
    const nextCod = (maxResult.recordset[0]?.maxCod || 0) + 1;
    const codPadded = String(nextCod).padStart(7, " ");

    await pool
      .request()
      .input("cod", codPadded)
      .input("nombre", nombre.trim().substring(0, 60))
      .query(`
        INSERT INTO [${dbProd}].dbo.Proveedores (Cod, Nombre, Saldo)
        VALUES (@cod, @nombre, 0)
      `);

    return NextResponse.json({
      proveedor: {
        cod: String(nextCod),
        nombre: nombre.trim(),
        saldo: 0,
      },
    });
  } catch (error) {
    console.error("Error creating proveedor:", error);
    return NextResponse.json(
      { error: "Error al crear proveedor" },
      { status: 500 }
    );
  }
}
