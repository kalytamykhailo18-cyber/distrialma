import { NextRequest, NextResponse } from "next/server";
import { getTestPool as getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sku = req.nextUrl.searchParams.get("sku");
  if (!sku) {
    return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = sku.padStart(7, " ");

    const result = await pool.request().input("cod", codPadded).query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
        LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unidad,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        ISNULL(s.Costo, 0) AS costo,
        ISNULL(s.Precio, 0) AS precio,
        ISNULL(s.Precio2, 0) AS precio2,
        ISNULL(s.Precio3, 0) AS precio3,
        ISNULL(s.Precio4, 0) AS precio4,
        ISNULL(s.Precio5, 0) AS precio5,
        ISNULL(s.Stk, 0) AS stock
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      WHERE p.Cod = @cod
        AND LTRIM(RTRIM(s.Deposito)) = '0'
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    return NextResponse.json({ product: result.recordset[0] });
  } catch (error) {
    console.error("Error fetching product prices:", error);
    return NextResponse.json({ error: "Error al buscar producto" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { sku, costo, precio, precio2, precio3, precio4, precio5 } = await req.json();
    if (!sku) {
      return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = String(sku).padStart(7, " ");

    const request = pool.request().input("cod", codPadded);
    const updates: string[] = [];

    if (costo !== undefined && costo !== null) {
      request.input("costo", parseFloat(costo));
      updates.push("Costo = @costo");
    }
    if (precio !== undefined && precio !== null && parseFloat(precio) >= 0) {
      request.input("p", Math.round(parseFloat(precio)));
      updates.push("Precio = @p");
    }
    if (precio2 !== undefined && precio2 !== null && parseFloat(precio2) >= 0) {
      request.input("p2", Math.round(parseFloat(precio2)));
      updates.push("Precio2 = @p2");
    }
    if (precio3 !== undefined && precio3 !== null && parseFloat(precio3) >= 0) {
      request.input("p3", Math.round(parseFloat(precio3)));
      updates.push("Precio3 = @p3");
    }
    if (precio4 !== undefined && precio4 !== null && parseFloat(precio4) >= 0) {
      request.input("p4", Math.round(parseFloat(precio4)));
      updates.push("Precio4 = @p4");
    }
    if (precio5 !== undefined && precio5 !== null && parseFloat(precio5) >= 0) {
      request.input("p5", Math.round(parseFloat(precio5)));
      updates.push("Precio5 = @p5");
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    await request.query(`
      UPDATE [${dbProd}].dbo.Stock
      SET ${updates.join(", ")}
      WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
    `);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error updating prices:", error);
    return NextResponse.json({ error: "Error al actualizar precios" }, { status: 500 });
  }
}
