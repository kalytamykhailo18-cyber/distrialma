import { NextRequest, NextResponse } from "next/server";
import { getTestPool as getPool, getDbName } from "@/lib/mssql";
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
      { costo: number; precio: number; precio2: number; precio3: number; precio4: number; precio5: number; porceGan2: number; porceGan3: number; porceGan4: number }
    > = {};

    if (skus.length > 0) {
      const skuList = skus.map((s) => `'${s.padStart(7, " ")}'`).join(",");
      const result = await pool.request().query(`
        SELECT
          LTRIM(RTRIM(s.CodProducto)) AS sku,
          ISNULL(s.Costo, 0) AS costo,
          ISNULL(s.Precio, 0) AS precio,
          ISNULL(s.Precio2, 0) AS precio2,
          ISNULL(s.Precio3, 0) AS precio3,
          ISNULL(s.Precio4, 0) AS precio4,
          ISNULL(s.Precio5, 0) AS precio5,
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
          precio: row.precio,
          precio2: row.precio2,
          precio3: row.precio3,
          precio4: row.precio4,
          precio5: row.precio5,
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
      precio: stockData[i.sku]?.precio || 0,
      precio2: stockData[i.sku]?.precio2 || 0,
      precio3: stockData[i.sku]?.precio3 || 0,
      precio4: stockData[i.sku]?.precio4 || 0,
      precio5: stockData[i.sku]?.precio5 || 0,
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
        subtotal: Number(entry.subtotal),
        iva: Number(entry.iva),
        iibb: Number(entry.iibb),
        percepciones: Number(entry.percepciones),
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
    const { items: costeoItems, newProductData, subtotal: subIn, iva: ivaIn, iibb: iibbIn, percepciones: percIn, total: totalIn } = body;

    const pool = await getPool();
    const dbProd = getDbName("productos");

    let totalCosto = 0;

    for (const ci of costeoItems || []) {
      const costo = parseFloat(ci.costo);
      if (isNaN(costo) || costo <= 0) continue;

      const item = entry.items.find((i) => i.id === ci.id);
      if (!item) continue;

      const codPadded = padLeft(item.sku, 7);

      // Update Stock.Costo and recalculate prices
      // Only update selling prices if PorceGan > 0 OR explicit prices provided
      const precio = parseFloat(ci.precio) || 0;
      const precio2 = parseFloat(ci.precio2) || 0;
      const precio3 = parseFloat(ci.precio3) || 0;
      const precio4 = parseFloat(ci.precio4) || 0;
      const precio5 = parseFloat(ci.precio5) || 0;

      const req = pool.request().input("cod", codPadded).input("costo", costo);
      let priceUpdates = "";

      if (precio > 0 || precio2 > 0 || precio3 > 0 || precio4 > 0 || precio5 > 0) {
        // Admin provided explicit prices
        if (precio > 0) { req.input("p", Math.round(precio)); priceUpdates += ", Precio = @p"; }
        if (precio2 > 0) { req.input("p2", Math.round(precio2)); priceUpdates += ", Precio2 = @p2"; }
        if (precio3 > 0) { req.input("p3", Math.round(precio3)); priceUpdates += ", Precio3 = @p3"; }
        if (precio4 > 0) { req.input("p4", Math.round(precio4)); priceUpdates += ", Precio4 = @p4"; }
        if (precio5 > 0) { req.input("p5", Math.round(precio5)); priceUpdates += ", Precio5 = @p5"; }
      } else {
        // Auto-recalculate: maintain current margin ratio (like PunTouch does)
        // New price = new cost * (old price / old cost), rounded to integer
        // If old cost is 0 or old price is 0, keep existing price
        priceUpdates = `,
              Precio = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio, 0) > 0 THEN ROUND(@costo * Precio / Costo, 0) ELSE Precio END,
              Precio2 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio2, 0) > 0 THEN ROUND(@costo * Precio2 / Costo, 0) ELSE Precio2 END,
              Precio3 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio3, 0) > 0 THEN ROUND(@costo * Precio3 / Costo, 0) ELSE Precio3 END,
              Precio4 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio4, 0) > 0 THEN ROUND(@costo * Precio4 / Costo, 0) ELSE Precio4 END,
              Precio5 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio5, 0) > 0 THEN ROUND(@costo * Precio5 / Costo, 0) ELSE Precio5 END`;
      }

      await req.query(`
          UPDATE [${dbProd}].dbo.Stock
          SET Costo = @costo${priceUpdates}
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

    // Tax data
    const subtotal = parseFloat(subIn) || 0;
    const iva = parseFloat(ivaIn) || 0;
    const iibb = parseFloat(iibbIn) || 0;
    const percepciones = parseFloat(percIn) || 0;
    const invoiceTotal = parseFloat(totalIn) || (subtotal + iva + iibb + percepciones);

    // Update entry
    await prisma.stockEntry.update({
      where: { id },
      data: {
        estado: allCosteado ? "costeado" : "pendiente",
        subtotal,
        iva,
        iibb,
        percepciones,
        total: invoiceTotal > 0 ? invoiceTotal : totalCosto,
      },
    });

    // Update supplier saldo if invoice total > 0 and all costeado
    if (allCosteado && invoiceTotal > 0) {
      const provPadded = entry.proveedorCod.padStart(7, " ");
      await pool
        .request()
        .input("cod", provPadded)
        .input("total", invoiceTotal)
        .query(`
          UPDATE [${dbProd}].dbo.Proveedores
          SET Saldo = ISNULL(Saldo, 0) + @total
          WHERE Cod = @cod
        `);
    }

    return NextResponse.json({ success: true, allCosteado });
  } catch (error) {
    console.error("Error updating stock entry costeo:", error);
    return NextResponse.json(
      { error: "Error al actualizar costeo" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    const { sku, productName, cantidad, itemId, updateQty } = await req.json();

    const entry = await prisma.stockEntry.findUnique({ where: { id } });
    if (!entry || entry.estado !== "pendiente") {
      return NextResponse.json({ error: "Solo se pueden editar ingresos pendientes" }, { status: 400 });
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Update existing item quantity
    if (updateQty && itemId) {
      const item = await prisma.stockEntryItem.findUnique({ where: { id: itemId } });
      if (!item) return NextResponse.json({ error: "Item no encontrado" }, { status: 404 });

      const oldCant = Number(item.cantidad);
      const newCant = parseFloat(cantidad) || 0;
      const diff = newCant - oldCant;

      if (diff !== 0) {
        const codPadded = item.sku.padStart(7, " ");
        await pool.request().input("cod", codPadded).input("diff", diff).query(`
          UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) + @diff
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
        `);
        await prisma.stockEntryItem.update({ where: { id: itemId }, data: { cantidad: newCant } });
      }

      return NextResponse.json({ ok: true });
    }

    // Add new item
    if (!sku || !cantidad || cantidad <= 0) {
      return NextResponse.json({ error: "SKU y cantidad requeridos" }, { status: 400 });
    }

    const codPadded = String(sku).padStart(7, " ");

    await pool
      .request()
      .input("cod", codPadded)
      .input("cant", cantidad)
      .query(`
        UPDATE [${dbProd}].dbo.Stock
        SET Stk = ISNULL(Stk, 0) + @cant
        WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
      `);

    // Add item to PostgreSQL
    await prisma.stockEntryItem.create({
      data: {
        entryId: id,
        sku: String(sku),
        productName: productName || "",
        cantidad,
        isNewProduct: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error adding item:", error);
    return NextResponse.json({ error: "Error al agregar producto" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const id = parseInt(params.id);
    const { itemId } = await req.json();

    if (!itemId) {
      return NextResponse.json({ error: "Item ID requerido" }, { status: 400 });
    }

    const entry = await prisma.stockEntry.findUnique({
      where: { id },
    });

    if (!entry || entry.estado !== "pendiente") {
      return NextResponse.json({ error: "Solo se pueden editar ingresos pendientes" }, { status: 400 });
    }

    // Revert stock in SQL Server
    const item = await prisma.stockEntryItem.findUnique({ where: { id: itemId } });
    if (item && !item.costeado) {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      const codPadded = item.sku.padStart(7, " ");

      await pool
        .request()
        .input("cod", codPadded)
        .input("cant", Number(item.cantidad))
        .query(`
          UPDATE [${dbProd}].dbo.Stock
          SET Stk = ISNULL(Stk, 0) - @cant
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
        `);

      await prisma.stockEntryItem.delete({ where: { id: itemId } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error removing item:", error);
    return NextResponse.json({ error: "Error al quitar item" }, { status: 500 });
  }
}
