import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
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
        tipo: entry.tipo || "ingreso",
        proveedorCod: entry.proveedorCod,
        proveedorName: entry.proveedorName,
        usuario: entry.usuario,
        estado: entry.estado,
        subtotal: Number(entry.subtotal),
        iva: Number(entry.iva),
        iibb: Number(entry.iibb),
        percepciones: Number(entry.percepciones),
        descuento: Number(entry.descuento),
        descuentoBase: entry.descuentoBase,
        total: Number(entry.total),
        notas: entry.notas,
        nroFactura: entry.nroFactura,
        facturaImage: entry.facturaImage,
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
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const userName = (session.user as { name?: string })?.name || "admin";

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

    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Helper to clamp numbers to fit in numeric(12,2) (max ~999,999,999.99)
    const clamp = (n: number) => {
      if (!isFinite(n) || isNaN(n)) return 0;
      const rounded = Math.round(n * 100) / 100;
      return Math.max(0, Math.min(999999999, rounded));
    };

    // Handle devolucion approval — just subtract stock (atomic)
    if (entry.tipo === "devolucion") {
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const item of entry.items) {
          const codPadded = item.sku.padStart(7, " ");
          const cant = clamp(Number(item.cantidad));
          await new sql.Request(tx)
            .input("cod", codPadded)
            .input("cant", cant)
            .query(`
              UPDATE [${dbProd}].dbo.Stock
              SET Stk = ISNULL(Stk, 0) - @cant
              WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
            `);
        }
        await prisma.stockEntry.update({
          where: { id },
          data: { estado: "costeado" },
        });
        await tx.commit();
      } catch (e) {
        try { await tx.rollback(); } catch { /* ignore */ }
        throw e;
      }

      return NextResponse.json({ ok: true, message: "Devolución aprobada, stock descontado" });
    }

    const { items: costeoItems, newProductData, subtotal: subIn, iva: ivaIn, iibb: iibbIn, percepciones: percIn, descuento: descIn, descuentoBase: descBaseIn, total: totalIn } = body;

    // Begin SQL Server transaction so all costeo changes are atomic
    const tx = new sql.Transaction(pool);
    await tx.begin();

    let totalCosto = 0;
    let allCosteado = false;

    try {
      for (const ci of costeoItems || []) {
        const costo = clamp(parseFloat(ci.costo));
        if (costo <= 0) continue;

        const item = entry.items.find((i) => i.id === ci.id);
        if (!item) continue;

        const codPadded = padLeft(item.sku, 7);

        const precio = clamp(parseFloat(ci.precio) || 0);
        const precio2 = clamp(parseFloat(ci.precio2) || 0);
        const precio3 = clamp(parseFloat(ci.precio3) || 0);
        const precio4 = clamp(parseFloat(ci.precio4) || 0);
        const precio5 = clamp(parseFloat(ci.precio5) || 0);

        const req = new sql.Request(tx).input("cod", codPadded).input("costo", costo);
        let priceUpdates = "";

        if (precio > 0 || precio2 > 0 || precio3 > 0 || precio4 > 0 || precio5 > 0) {
          if (precio > 0) { req.input("p", Math.round(precio)); priceUpdates += ", Precio = @p"; }
          if (precio2 > 0) { req.input("p2", Math.round(precio2)); priceUpdates += ", Precio2 = @p2"; }
          if (precio3 > 0) { req.input("p3", Math.round(precio3)); priceUpdates += ", Precio3 = @p3"; }
          if (precio4 > 0) { req.input("p4", Math.round(precio4)); priceUpdates += ", Precio4 = @p4"; }
          if (precio5 > 0) { req.input("p5", Math.round(precio5)); priceUpdates += ", Precio5 = @p5"; }
        } else {
          // Auto-recalculate maintaining margin ratio, but clamp result to safe max
          priceUpdates = `,
                Precio = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio, 0) > 0
                  THEN CASE WHEN ROUND(CAST(@costo AS FLOAT) * CAST(Precio AS FLOAT) / CAST(Costo AS FLOAT), 0) > 999999999 THEN 999999999 ELSE ROUND(CAST(@costo AS FLOAT) * CAST(Precio AS FLOAT) / CAST(Costo AS FLOAT), 0) END
                  ELSE Precio END,
                Precio2 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio2, 0) > 0
                  THEN CASE WHEN ROUND(CAST(@costo AS FLOAT) * CAST(Precio2 AS FLOAT) / CAST(Costo AS FLOAT), 0) > 999999999 THEN 999999999 ELSE ROUND(CAST(@costo AS FLOAT) * CAST(Precio2 AS FLOAT) / CAST(Costo AS FLOAT), 0) END
                  ELSE Precio2 END,
                Precio3 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio3, 0) > 0
                  THEN CASE WHEN ROUND(CAST(@costo AS FLOAT) * CAST(Precio3 AS FLOAT) / CAST(Costo AS FLOAT), 0) > 999999999 THEN 999999999 ELSE ROUND(CAST(@costo AS FLOAT) * CAST(Precio3 AS FLOAT) / CAST(Costo AS FLOAT), 0) END
                  ELSE Precio3 END,
                Precio4 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio4, 0) > 0
                  THEN CASE WHEN ROUND(CAST(@costo AS FLOAT) * CAST(Precio4 AS FLOAT) / CAST(Costo AS FLOAT), 0) > 999999999 THEN 999999999 ELSE ROUND(CAST(@costo AS FLOAT) * CAST(Precio4 AS FLOAT) / CAST(Costo AS FLOAT), 0) END
                  ELSE Precio4 END,
                Precio5 = CASE WHEN ISNULL(Costo, 0) > 0 AND ISNULL(Precio5, 0) > 0
                  THEN CASE WHEN ROUND(CAST(@costo AS FLOAT) * CAST(Precio5 AS FLOAT) / CAST(Costo AS FLOAT), 0) > 999999999 THEN 999999999 ELSE ROUND(CAST(@costo AS FLOAT) * CAST(Precio5 AS FLOAT) / CAST(Costo AS FLOAT), 0) END
                  ELSE Precio5 END`;
        }

        // Read old values for audit log
        const oldVals = await new sql.Request(tx).input("cod", codPadded).query(`
          SELECT ISNULL(Costo,0) AS costo, ISNULL(Precio,0) AS p1, ISNULL(Precio2,0) AS p2, ISNULL(Precio3,0) AS p3, ISNULL(Precio4,0) AS p4, ISNULL(Precio5,0) AS p5
          FROM [${dbProd}].dbo.Stock WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);
        const old = oldVals.recordset[0] || { costo: 0, p1: 0, p2: 0, p3: 0, p4: 0, p5: 0 };

        await req.query(`
          UPDATE [${dbProd}].dbo.Stock
          SET Costo = @costo${priceUpdates}
          WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);

        // Audit log
        if (Math.abs(costo - Number(old.costo)) > 0.01) {
          await prisma.priceAudit.create({ data: { sku: item.sku, nombre: item.productName || "", campo: "costo", valorAnterior: Number(old.costo), valorNuevo: costo, origen: "costeo", usuario: userName } });
        }

        // Mark item as costeado in PostgreSQL
        await prisma.stockEntryItem.update({
          where: { id: ci.id },
          data: { costo, costeado: true },
        });

        totalCosto += costo * Number(item.cantidad);
      }

      // Update new product extra data if provided
      if (newProductData) {
        for (const npd of Array.isArray(newProductData) ? newProductData : [newProductData]) {
          if (!npd.sku) continue;
          const codPadded = padLeft(npd.sku, 7);

          const updates: string[] = [];
          const request = new sql.Request(tx).input("cod", codPadded);

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
            request.input("cantCaja", clamp(parseFloat(npd.cantidadPorCaja) || 0));
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
      allCosteado = updatedItems.every((i) => i.costeado);

      // Tax data
      const subtotal = clamp(parseFloat(subIn));
      const iva = clamp(parseFloat(ivaIn));
      const iibb = clamp(parseFloat(iibbIn));
      const percepciones = clamp(parseFloat(percIn));
      const descuento = Math.max(0, Math.min(100, parseFloat(descIn) || 0));
      const descuentoBase = descBaseIn === "total" ? "total" : "neto";
      const invoiceTotal = clamp(parseFloat(totalIn) || (subtotal + iva + iibb + percepciones));

      // Update entry in PostgreSQL
      await prisma.stockEntry.update({
        where: { id },
        data: {
          estado: allCosteado ? "costeado" : "pendiente",
          subtotal,
          iva,
          iibb,
          percepciones,
          descuento,
          descuentoBase,
          total: invoiceTotal > 0 ? invoiceTotal : clamp(totalCosto),
        },
      });

      // Update supplier saldo if invoice total > 0 and all costeado
      if (allCosteado && invoiceTotal > 0) {
        const provPadded = entry.proveedorCod.padStart(7, " ");
        await new sql.Request(tx)
          .input("cod", provPadded)
          .input("total", invoiceTotal)
          .query(`
            UPDATE [${dbProd}].dbo.Proveedores
            SET Saldo = ISNULL(Saldo, 0) + @total
            WHERE Cod = @cod
          `);
      }

      // All good — commit
      await tx.commit();
    } catch (innerError) {
      try { await tx.rollback(); } catch { /* ignore */ }
      throw innerError;
    }

    // Publish WhatsApp status with costed products (fire and forget)
    if (allCosteado) {
      (async () => {
        try {
          const entryWithItems = await prisma.stockEntry.findUnique({ where: { id }, include: { items: true } });
          if (!entryWithItems || entryWithItems.tipo === "devolucion") return;
          const productImages = await prisma.productImage.findMany({
            where: { sku: { in: entryWithItems.items.map((i) => i.sku) } },
            orderBy: { position: "asc" },
          });
          const imgMap = new Map<string, string>();
          for (const img of productImages) { if (!imgMap.has(img.sku)) imgMap.set(img.sku, img.filename); }

          const skuList = entryWithItems.items.map((i) => i.sku);
          const priceReq = pool.request();
          skuList.forEach((s, idx) => priceReq.input(`s${idx}`, s.padStart(7, " ")));
          const priceResult = await priceReq.query(`
            SELECT LTRIM(RTRIM(CodProducto)) AS sku, Precio2 FROM [${dbProd}].dbo.Stock
            WHERE CodProducto IN (${skuList.map((_, idx) => `@s${idx}`).join(",")}) AND LTRIM(RTRIM(Deposito)) = '0'
          `);
          const priceMap = new Map<string, number>();
          for (const p of priceResult.recordset) priceMap.set(p.sku, Number(p.Precio2));

          const statusItems = entryWithItems.items
            .filter((i) => priceMap.get(i.sku) && priceMap.get(i.sku)! > 0)
            .map((i) => ({ nombre: i.productName, imageUrl: imgMap.get(i.sku) || null, precio: priceMap.get(i.sku) || 0 }));

          if (statusItems.length > 0) {
            fetch("http://127.0.0.1:3099/publish-status", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ items: statusItems }),
            }).catch(() => {});
          }
        } catch { /* silent */ }
      })();
    }

    // Check for negative margins after costeo (fire and forget)
    if (allCosteado) {
      const cronSecret = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
      fetch(`http://127.0.0.1:3000/api/admin/margin-alert?secret=${cronSecret}`, { method: "POST" }).catch(() => {});
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
      const newCant = Math.round((parseFloat(String(cantidad).replace(/,/g, ".")) || 0) * 1000) / 1000;
      const diff = newCant - oldCant;

      if (diff !== 0) {
        const codPadded = item.sku.padStart(7, " ");
        await pool.request().input("cod", codPadded).input("diff", diff).query(`
          UPDATE [${dbProd}].dbo.Stock SET Stk = ISNULL(Stk, 0) + @diff
          WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
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
        WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
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
          WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
        `);

      await prisma.stockEntryItem.delete({ where: { id: itemId } });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error removing item:", error);
    return NextResponse.json({ error: "Error al quitar item" }, { status: 500 });
  }
}
