import { NextRequest, NextResponse } from "next/server";
import sql from "mssql";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const estado = req.nextUrl.searchParams.get("estado") || "pendiente";
  const proveedor = req.nextUrl.searchParams.get("proveedor");
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const skip = (page - 1) * limit;
  const withItems = req.nextUrl.searchParams.get("withItems") === "true";
  const today = req.nextUrl.searchParams.get("today") === "true";

  try {
    const where: Record<string, unknown> = {};
    if (estado !== "all") where.estado = estado;
    if (proveedor) where.proveedorCod = proveedor;
    const desde = req.nextUrl.searchParams.get("desde");
    const hasta = req.nextUrl.searchParams.get("hasta");
    if (desde || hasta || today) {
      const dateFilter: Record<string, Date> = {};
      if (today) {
        const now = new Date(Date.now() - 3 * 60 * 60 * 1000); // Argentina time
        const todayStart = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        todayStart.setHours(todayStart.getHours() + 3); // back to UTC
        dateFilter.gte = todayStart;
      }
      if (desde) dateFilter.gte = new Date(desde + "T00:00:00-03:00");
      if (hasta) {
        const h = new Date(hasta + "T23:59:59-03:00");
        dateFilter.lte = h;
      }
      where.createdAt = dateFilter;
    }

    const [entries, total] = await Promise.all([
      prisma.stockEntry.findMany({
        where,
        include: { items: withItems ? { select: { id: true, sku: true, productName: true, cantidad: true, costo: true, costeado: true } } : { select: { id: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stockEntry.count({ where }),
    ]);

    const result = entries.map((e) => ({
      id: e.id,
      tipo: e.tipo || "ingreso",
      proveedorCod: e.proveedorCod,
      proveedorName: e.proveedorName,
      usuario: e.usuario,
      estado: e.estado,
      subtotal: Number(e.subtotal),
      iva: Number(e.iva),
      iibb: Number(e.iibb),
      percepciones: Number(e.percepciones),
      total: Number(e.total),
      notas: e.notas,
      nroFactura: e.nroFactura,
      createdAt: e.createdAt.toISOString(),
      itemCount: e.items.length,
      ...(withItems ? { items: (e.items as { sku: string; productName: string; cantidad: unknown; costo: unknown; costeado: boolean }[]).map((it) => ({ sku: it.sku, productName: it.productName, cantidad: Number(it.cantidad), costo: Number(it.costo || 0), costeado: it.costeado })) } : {}),
    }));

    return NextResponse.json({ entries: result, total, page, limit });
  } catch (error) {
    console.error("Error fetching stock entries:", error);
    return NextResponse.json(
      { error: "Error al cargar ingresos" },
      { status: 500 }
    );
  }
}

function getArgentinaTime(): string {
  const now = new Date();
  // Argentina is UTC-3
  const argTime = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const y = argTime.getUTCFullYear();
  const m = String(argTime.getUTCMonth() + 1).padStart(2, "0");
  const d = String(argTime.getUTCDate()).padStart(2, "0");
  const hh = String(argTime.getUTCHours()).padStart(2, "0");
  const mm = String(argTime.getUTCMinutes()).padStart(2, "0");
  const ss = String(argTime.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${hh}${mm}${ss}`;
}

function padLeft(value: string | number, length: number): string {
  return String(value).padStart(length, " ");
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { proveedorCod, proveedorName, notas, nroFactura, items, subtotal: subIn, iva: ivaIn, iibb: iibbIn, percepciones: percIn, total: totalIn, tipo: tipoIn } = body;
    const tipo = tipoIn === "devolucion" ? "devolucion" : "ingreso";
    const isDevolucion = tipo === "devolucion";

    if (!proveedorCod || !items?.length) {
      return NextResponse.json(
        { error: "Proveedor e items requeridos" },
        { status: 400 }
      );
    }

    const pool = await getPool();
    const dbProd = getDbName("productos");
    const dbCompras = getDbName("compras");
    const fechora = getArgentinaTime();
    const usuario = session.user?.name || "admin";

    const subtotal = parseFloat(subIn) || 0;
    const iva = parseFloat(ivaIn) || 0;
    const iibb = parseFloat(iibbIn) || 0;
    const percepciones = parseFloat(percIn) || 0;
    const totalAmount = parseFloat(totalIn) || (subtotal + iva + iibb + percepciones);

    // Begin transaction so all SQL Server changes are atomic
    const transaction = new sql.Transaction(pool);
    await transaction.begin();

    let entry;
    try {
      // Get next Compras Cod (inside transaction for consistency)
      let nextCompraCod = 1;
      try {
        const maxCompra = await new sql.Request(transaction).query(`
          SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod
          FROM [${dbCompras}].dbo.Compras
        `);
        nextCompraCod = Number(maxCompra.recordset[0]?.maxCod || 0) + 1;
      } catch {
        // Table might be empty
      }

      const boletaCod = padLeft(nextCompraCod, 9);
      nextCompraCod++;

      // Write Compras header row
      const provPaddedHeader = padLeft(proveedorCod, 7);
      await new sql.Request(transaction)
        .input("cod", boletaCod)
        .input("proveedor", provPaddedHeader)
        .input("fechora", fechora)
        .input("total", totalAmount)
        .input("tipo", "V")
        .query(`
          INSERT INTO [${dbCompras}].dbo.Compras (Cod, Boleta, Proveedor, Fechora, Total, Tipo, Itm)
          VALUES (@cod, @cod, @proveedor, @fechora, @total, @tipo, '0  ')
        `);

      const pgItems: Array<{
        sku: string;
        productName: string;
        cantidad: number;
        isNewProduct: boolean;
      }> = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        let sku = item.sku;
        const cantidad = Math.round((parseFloat(String(item.cantidad).replace(/,/g, ".")) || 0) * 1000) / 1000;

        if (item.isNewProduct) {
          // Create new product in SQL Server
          const maxProdResult = await new sql.Request(transaction).query(`
            SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod
            FROM [${dbProd}].dbo.Productos
          `);
          const nextProdCod = Number(maxProdResult.recordset[0]?.maxCod || 0) + 1;
          const codPadded = padLeft(nextProdCod, 7);
          sku = String(nextProdCod);

          const productName = (item.newProductName || item.productName || "").substring(0, 60);
          const barcode = (item.barcode || "").substring(0, 20);

          await new sql.Request(transaction)
            .input("cod", codPadded)
            .input("nombre", productName)
            .input("codbar", barcode)
            .query(`
              INSERT INTO [${dbProd}].dbo.Productos (Cod, Nombre, Codbar)
              VALUES (@cod, @nombre, @codbar)
            `);

          // Create Stock row
          const itemCosto = parseFloat(String(item.costo || 0)) || 0;
          await new sql.Request(transaction)
            .input("codProd", codPadded)
            .input("stk", cantidad)
            .input("costo", Math.round(itemCosto * 100) / 100)
            .query(`
              INSERT INTO [${dbProd}].dbo.Stock (CodProducto, Deposito, Stk, Costo)
              VALUES (@codProd, '0  ', @stk, @costo)
            `);

          pgItems.push({
            sku: String(nextProdCod),
            productName,
            cantidad,
            isNewProduct: true,
          });
        } else {
          // Update existing stock (only for ingreso, not devolucion)
          if (!isDevolucion) {
            const codPadded = padLeft(sku, 7);
            await new sql.Request(transaction)
              .input("cod", codPadded)
              .input("cant", cantidad)
              .query(`
                UPDATE [${dbProd}].dbo.Stock
                SET Stk = ISNULL(Stk, 0) + @cant
                WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
              `);
          }

          pgItems.push({
            sku,
            productName: item.productName || "",
            cantidad,
            isNewProduct: false,
          });
        }

        // Write to Compras table in SQL Server (item row — each gets unique Cod)
        const itemCod = padLeft(nextCompraCod, 9);
        const skuPadded = padLeft(item.isNewProduct ? sku : item.sku, 7);
        const provPadded = padLeft(proveedorCod, 7);
        const itm = padLeft(i + 1, 3);

        await new sql.Request(transaction)
          .input("cod", itemCod)
          .input("boleta", boletaCod)
          .input("producto", skuPadded)
          .input("proveedor", provPadded)
          .input("fechora", fechora)
          .input("cant", cantidad)
          .input("tipo", "I")
          .input("itm", itm)
          .query(`
            INSERT INTO [${dbCompras}].dbo.Compras (Cod, Boleta, Producto, Proveedor, Fechora, Cant, Tipo, Itm)
            VALUES (@cod, @boleta, @producto, @proveedor, @fechora, @cant, @tipo, @itm)
          `);

        nextCompraCod++;
      }

      // Save in PostgreSQL — if this fails, we rollback the SQL Server transaction
      entry = await prisma.stockEntry.create({
        data: {
          tipo,
          proveedorCod,
          proveedorName,
          usuario,
          estado: "pendiente",
          subtotal,
          iva,
          iibb,
          percepciones,
          total: totalAmount,
          notas: notas || null,
          nroFactura: nroFactura || null,
          items: {
            create: pgItems.map((item) => ({
              sku: item.sku,
              productName: item.productName,
              cantidad: item.cantidad,
              isNewProduct: item.isNewProduct,
            })),
          },
        },
        include: { items: true },
      });

      // All good — commit SQL Server transaction
      await transaction.commit();
    } catch (innerError) {
      // Roll back SQL Server changes (stock updates, Compras inserts)
      try { await transaction.rollback(); } catch { /* already rolled back */ }
      throw innerError;
    }

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Error creating stock entry:", error);
    return NextResponse.json(
      { error: "Error al crear ingreso de stock" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // Only admin can delete
  const user = session.user as { role?: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin puede eliminar" }, { status: 403 });
  }

  try {
    const { id } = await req.json();
    if (!id) {
      return NextResponse.json({ error: "ID requerido" }, { status: 400 });
    }

    const entry = await prisma.stockEntry.findUnique({ where: { id: parseInt(id) } });
    if (!entry) {
      return NextResponse.json({ error: "Ingreso no encontrado" }, { status: 404 });
    }

    if (entry.estado !== "pendiente") {
      return NextResponse.json({ error: "Solo se pueden eliminar ingresos pendientes" }, { status: 400 });
    }

    // Reverse stock in PunTouch for each item
    const items = await prisma.stockEntryItem.findMany({ where: { entryId: parseInt(id) } });
    const isDevolucion = entry.tipo === "devolucion";

    if (!isDevolucion && items.length > 0) {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      for (const item of items) {
        const codPadded = item.sku.padStart(7, " ");
        await pool.request()
          .input("cod", codPadded)
          .input("cant", Number(item.cantidad))
          .query(`
            UPDATE [${dbProd}].dbo.Stock
            SET Stk = ISNULL(Stk, 0) - @cant
            WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod)) AND LTRIM(RTRIM(Deposito)) = '0' AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
          `);
      }
    }

    // Delete items first, then entry
    await prisma.stockEntryItem.deleteMany({ where: { entryId: parseInt(id) } });
    await prisma.stockEntry.delete({ where: { id: parseInt(id) } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error deleting stock entry:", error);
    return NextResponse.json({ error: "Error al eliminar" }, { status: 500 });
  }
}
