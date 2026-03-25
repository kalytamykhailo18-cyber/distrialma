import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const entry = await prisma.stockEntry.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Ingreso no encontrado" },
        { status: 404 }
      );
    }

    // Get current costs from SQL Server for each item
    const pool = await getPool();
    const dbProd = getDbName("productos");

    const skus = entry.items.map((i) => i.sku);
    const stockData: Record<
      string,
      { costo: number; porceGan2: number; porceGan3: number; porceGan4: number }
    > = {};

    if (skus.length > 0) {
      const skuList = skus.map((s) => `'${s.padStart(7, " ")}'`).join(",");
      const result = await pool.request().query(`
        SELECT
          LTRIM(RTRIM(s.CodProducto)) AS sku,
          ISNULL(s.Costo, 0) AS costo,
          ISNULL(s.PorceGan2, 0) AS porceGan2,
          ISNULL(s.PorceGan3, 0) AS porceGan3,
          ISNULL(s.PorceGan4, 0) AS porceGan4
        FROM [${dbProd}].dbo.Stock s
        WHERE s.CodProducto IN (${skuList})
          AND LTRIM(RTRIM(s.Deposito)) = '0'
      `);

      for (const row of result.recordset) {
        stockData[row.sku] = {
          costo: row.costo,
          porceGan2: row.porceGan2,
          porceGan3: row.porceGan3,
          porceGan4: row.porceGan4,
        };
      }
    }

    // Get product details for new products (rubro, marca, unidad)
    const productDetails: Record<
      string,
      { rubro: string; marca: string; unidad: string; cantPorCaja: number }
    > = {};

    const newSkus = entry.items.filter((i) => i.isNewProduct).map((i) => i.sku);
    if (newSkus.length > 0) {
      const skuList = newSkus.map((s) => `'${s.padStart(7, " ")}'`).join(",");
      const result = await pool.request().query(`
        SELECT
          LTRIM(RTRIM(Cod)) AS sku,
          LTRIM(RTRIM(ISNULL(Rubro,''))) AS rubro,
          LTRIM(RTRIM(ISNULL(Marca,''))) AS marca,
          LTRIM(RTRIM(ISNULL(Unidad,''))) AS unidad,
          ISNULL(CantxCaja, 0) AS cantPorCaja
        FROM [${dbProd}].dbo.Productos
        WHERE Cod IN (${skuList})
      `);

      for (const row of result.recordset) {
        productDetails[row.sku] = {
          rubro: row.rubro,
          marca: row.marca,
          unidad: row.unidad,
          cantPorCaja: row.cantPorCaja,
        };
      }
    }

    const items = entry.items.map((i) => ({
      id: i.id,
      sku: i.sku,
      productName: i.productName,
      cantidad: Number(i.cantidad),
      costo: i.costo ? Number(i.costo) : stockData[i.sku]?.costo || null,
      costeado: i.costeado,
      isNewProduct: i.isNewProduct,
      porceGan2: stockData[i.sku]?.porceGan2 || 0,
      porceGan3: stockData[i.sku]?.porceGan3 || 0,
      porceGan4: stockData[i.sku]?.porceGan4 || 0,
      ...(i.isNewProduct && productDetails[i.sku]
        ? {
            rubro: productDetails[i.sku].rubro,
            marca: productDetails[i.sku].marca,
            unidad: productDetails[i.sku].unidad,
            cantPorCaja: productDetails[i.sku].cantPorCaja,
          }
        : {}),
    }));

    return NextResponse.json({
      entry: {
        id: entry.id,
        proveedorCod: entry.proveedorCod,
        proveedorName: entry.proveedorName,
        usuario: entry.usuario,
        estado: entry.estado,
        total: Number(entry.total),
        notas: entry.notas,
        createdAt: entry.createdAt.toISOString(),
        items,
      },
    });
  } catch (error) {
    console.error("Error fetching stock entry:", error);
    return NextResponse.json(
      { error: "Error al cargar ingreso" },
      { status: 500 }
    );
  }
}

function padLeft(value: string | number, length: number): string {
  return String(value).padStart(length, " ");
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    if (isNaN(id)) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const entry = await prisma.stockEntry.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!entry) {
      return NextResponse.json(
        { error: "Ingreso no encontrado" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { items: costeoItems, newProductData } = body;

    const pool = await getPool();
    const dbProd = getDbName("productos");

    let totalCosto = 0;

    for (const ci of costeoItems || []) {
      const costo = parseFloat(ci.costo);
      if (isNaN(costo) || costo <= 0) continue;

      const item = entry.items.find((i) => i.id === ci.id);
      if (!item) continue;

      const codPadded = padLeft(item.sku, 7);

      // Update Stock.Costo and recalculate prices using PorceGan columns
      await pool
        .request()
        .input("cod", codPadded)
        .input("costo", costo)
        .query(`
          UPDATE [${dbProd}].dbo.Stock
          SET Costo = @costo,
              Precio2 = @costo * (1 + ISNULL(PorceGan2, 0) / 100.0),
              Precio3 = @costo * (1 + ISNULL(PorceGan3, 0) / 100.0),
              Precio4 = @costo * (1 + ISNULL(PorceGan4, 0) / 100.0)
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
        `);

      // Mark item as costeado in PostgreSQL
      await prisma.stockEntryItem.update({
        where: { id: ci.id },
        data: { costo, costeado: true },
      });

      totalCosto += costo * Number(item.cantidad);
    }

    // Update new product extra data if provided
    if (newProductData) {
      for (const npd of Array.isArray(newProductData)
        ? newProductData
        : [newProductData]) {
        if (!npd.sku) continue;
        const codPadded = padLeft(npd.sku, 7);

        const updates: string[] = [];
        const request = pool.request().input("cod", codPadded);

        if (npd.rubro !== undefined) {
          request.input("rubro", padLeft(npd.rubro, 4));
          updates.push("Rubro = @rubro");
        }
        if (npd.marca !== undefined) {
          request.input("marca", padLeft(npd.marca, 4));
          updates.push("Marca = @marca");
        }
        if (npd.unidad !== undefined) {
          request.input("unidad", npd.unidad);
          updates.push("Unidad = @unidad");
        }
        if (npd.cantidadPorCaja !== undefined) {
          request.input("cantCaja", parseFloat(npd.cantidadPorCaja) || 0);
          updates.push("CantxCaja = @cantCaja");
        }

        if (updates.length > 0) {
          await request.query(`
            UPDATE [${dbProd}].dbo.Productos
            SET ${updates.join(", ")}
            WHERE Cod = @cod
          `);
        }
      }
    }

    // Check if all items are now costeado
    const updatedItems = await prisma.stockEntryItem.findMany({
      where: { entryId: id },
    });
    const allCosteado = updatedItems.every((i) => i.costeado);

    // Update entry
    await prisma.stockEntry.update({
      where: { id },
      data: {
        estado: allCosteado ? "costeado" : "pendiente",
        total: totalCosto,
      },
    });

    return NextResponse.json({ success: true, allCosteado });
  } catch (error) {
    console.error("Error updating stock entry costeo:", error);
    return NextResponse.json(
      { error: "Error al actualizar costeo" },
      { status: 500 }
    );
  }
}
