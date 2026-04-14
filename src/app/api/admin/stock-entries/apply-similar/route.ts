import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

function getNameBase(name: string): string {
  // Use first 2 words as the product family base
  // "JUGO ARCOR 3FRUTAS 15G" → "JUGO ARCOR"
  // "JUGO CLIGHT NARANJA 8G" → "JUGO CLIGHT"
  // "ACEITE CAÑUELAS 1.5L" → "ACEITE CAÑUELAS"
  const words = name.trim().split(/\s+/);
  if (words.length <= 2) return name.trim();
  return words.slice(0, 2).join(" ");
}

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const sku = req.nextUrl.searchParams.get("sku");
    if (!sku) {
      return NextResponse.json({ products: [] });
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = String(sku).padStart(7, " ");

    const prodResult = await pool.request().input("cod", codPadded).query(`
      SELECT LTRIM(RTRIM(Nombre)) AS nombre FROM [${dbProd}].dbo.Productos WHERE Cod = @cod
    `);

    if (prodResult.recordset.length === 0) {
      return NextResponse.json({ products: [] });
    }

    const nameBase = getNameBase(prodResult.recordset[0].nombre);

    const excludePadded = String(sku).padStart(7, " ");
    const similar = await pool.request().input("pattern", nameBase + "%").input("excludeCod", excludePadded).query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        ISNULL(s.Costo, 0) AS costo
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      WHERE p.Nombre LIKE @pattern
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND p.Cod != @excludeCod
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      ORDER BY p.Nombre
    `);

    return NextResponse.json({ products: similar.recordset, nameBase });
  } catch (error) {
    console.error("Error previewing similar:", error);
    return NextResponse.json({ products: [] });
  }
}

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { sku, costo, mode, precios } = await req.json();
    if (!sku) {
      return NextResponse.json({ error: "SKU requerido" }, { status: 400 });
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const codPadded = String(sku).padStart(7, " ");

    // Get the product name
    const prodResult = await pool.request().input("cod", codPadded).query(`
      SELECT LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbProd}].dbo.Productos
      WHERE Cod = @cod
    `);

    if (prodResult.recordset.length === 0) {
      return NextResponse.json({ error: "Producto no encontrado" }, { status: 404 });
    }

    const fullName = prodResult.recordset[0].nombre;
    const nameBase = getNameBase(fullName);

    // Find similar products (same name base)
    const excludePadded = String(sku).padStart(7, " ");
    const similar = await pool.request().input("pattern", nameBase + "%").input("excludeCod", excludePadded).query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        ISNULL(s.Costo, 0) AS oldCosto,
        ISNULL(s.Precio, 0) AS precio,
        ISNULL(s.Precio2, 0) AS precio2,
        ISNULL(s.Precio3, 0) AS precio3,
        ISNULL(s.Precio4, 0) AS precio4,
        ISNULL(s.Precio5, 0) AS precio5
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      WHERE p.Nombre LIKE @pattern
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND p.Cod != @excludeCod
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
    `);

    if (similar.recordset.length === 0) {
      return NextResponse.json({ updated: 0, products: [] });
    }

    const updated: { sku: string; nombre: string }[] = [];

    if (mode === "clone" && precios) {
      // Clone mode: copy exact prices from source product to all similar
      for (const prod of similar.recordset) {
        const prodCod = prod.sku.padStart(7, " ");
        const updateReq = pool.request()
          .input("cod", prodCod)
          .input("costo", parseFloat(precios.costo) || 0)
          .input("p1", parseFloat(precios.precio) || 0)
          .input("p2", parseFloat(precios.precio2) || 0)
          .input("p3", parseFloat(precios.precio3) || 0)
          .input("p4", parseFloat(precios.precio4) || 0)
          .input("p5", parseFloat(precios.precio5) || 0);

        await updateReq.query(`
          UPDATE [${dbProd}].dbo.Stock
          SET Costo = @costo, Precio = @p1, Precio2 = @p2, Precio3 = @p3, Precio4 = @p4, Precio5 = @p5
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
        `);
        updated.push({ sku: prod.sku, nombre: prod.nombre });
      }
    } else {
      // Default: apply cost and recalculate prices keeping margins
      const newCosto = parseFloat(costo);
      if (!newCosto || newCosto <= 0) {
        return NextResponse.json({ error: "Costo requerido" }, { status: 400 });
      }

      for (const prod of similar.recordset) {
        const prodCod = prod.sku.padStart(7, " ");
        const oldCosto = prod.oldCosto;

        const updateReq = pool.request()
          .input("cod", prodCod)
          .input("costo", newCosto);

        let priceUpdates = "";
        if (oldCosto > 0) {
          priceUpdates = `,
            Precio = CASE WHEN ISNULL(Precio, 0) > 0 THEN ROUND(@costo * Precio / Costo, 0) ELSE Precio END,
            Precio2 = CASE WHEN ISNULL(Precio2, 0) > 0 THEN ROUND(@costo * Precio2 / Costo, 0) ELSE Precio2 END,
            Precio3 = CASE WHEN ISNULL(Precio3, 0) > 0 THEN ROUND(@costo * Precio3 / Costo, 0) ELSE Precio3 END,
            Precio4 = CASE WHEN ISNULL(Precio4, 0) > 0 THEN ROUND(@costo * Precio4 / Costo, 0) ELSE Precio4 END,
            Precio5 = CASE WHEN ISNULL(Precio5, 0) > 0 THEN ROUND(@costo * Precio5 / Costo, 0) ELSE Precio5 END`;
        }

        await updateReq.query(`
          UPDATE [${dbProd}].dbo.Stock
          SET Costo = @costo${priceUpdates}
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
        `);
        updated.push({ sku: prod.sku, nombre: prod.nombre });
      }
    }

    return NextResponse.json({
      updated: updated.length,
      nameBase,
      products: updated,
    });
  } catch (error) {
    console.error("Error applying to similar:", error);
    return NextResponse.json({ error: "Error al aplicar a similares" }, { status: 500 });
  }
}
