import { NextRequest, NextResponse } from "next/server";
import { getTestPool as getPool, getDbName } from "@/lib/mssql";
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

export async function PUT(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const user = session.user as { role?: string; permissions?: string[] };
  const hasCosteo = user.role === "admin" || (user.permissions?.includes("costeo") ?? false);
  if (!hasCosteo) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const { cod, monto, concepto } = await req.json();
    if (!cod || !monto || monto <= 0) {
      return NextResponse.json(
        { error: "Proveedor y monto requeridos" },
        { status: 400 }
      );
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = String(cod).padStart(7, " ");

    // Subtract payment from supplier balance
    await pool
      .request()
      .input("cod", codPadded)
      .input("monto", parseFloat(monto))
      .query(`
        UPDATE [${dbProd}].dbo.Proveedores
        SET Saldo = ISNULL(Saldo, 0) - @monto
        WHERE Cod = @cod
      `);

    // Get updated saldo
    const result = await pool
      .request()
      .input("cod", codPadded)
      .query(`
        SELECT ISNULL(Saldo, 0) AS saldo
        FROM [${dbProd}].dbo.Proveedores
        WHERE Cod = @cod
      `);

    return NextResponse.json({
      ok: true,
      nuevoSaldo: result.recordset[0]?.saldo || 0,
      concepto: concepto || "Pago",
    });
  } catch (error) {
    console.error("Error registering payment:", error);
    return NextResponse.json(
      { error: "Error al registrar pago" },
      { status: 500 }
    );
  }
}
