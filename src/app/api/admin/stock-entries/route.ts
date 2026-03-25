import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const estado = req.nextUrl.searchParams.get("estado") || "pendiente";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const skip = (page - 1) * limit;

  try {
    const where = estado === "all" ? {} : { estado };

    const [entries, total] = await Promise.all([
      prisma.stockEntry.findMany({
        where,
        include: { items: { select: { id: true } } },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stockEntry.count({ where }),
    ]);

    const result = entries.map((e) => ({
      id: e.id,
      proveedorCod: e.proveedorCod,
      proveedorName: e.proveedorName,
      usuario: e.usuario,
      estado: e.estado,
      total: Number(e.total),
      notas: e.notas,
      createdAt: e.createdAt.toISOString(),
      itemCount: e.items.length,
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
    const { proveedorCod, proveedorName, notas, items } = body;

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

    // Get next Compras Cod
    let nextCompraCod = 1;
    try {
      const maxCompra = await pool.request().query(`
        SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod
        FROM [${dbCompras}].dbo.Compras
      `);
      nextCompraCod = (maxCompra.recordset[0]?.maxCod || 0) + 1;
    } catch {
      // Table might be empty
    }

    // Header row gets its own Cod, then each item gets the next Cod
    const boletaCod = padLeft(nextCompraCod, 9);
    nextCompraCod++;
    const totalAmount = 0;

    // Write Compras header row first
    const provPaddedHeader = padLeft(proveedorCod, 7);
    await pool
      .request()
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
      const cantidad = parseFloat(item.cantidad) || 0;

      if (item.isNewProduct) {
        // Create new product in SQL Server
        const maxProdResult = await pool.request().query(`
          SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod
          FROM [${dbProd}].dbo.Productos
        `);
        const nextProdCod = (maxProdResult.recordset[0]?.maxCod || 0) + 1;
        const codPadded = padLeft(nextProdCod, 7);
        sku = String(nextProdCod);

        const productName = (item.newProductName || item.productName || "").substring(0, 60);
        const barcode = (item.barcode || "").substring(0, 20);

        await pool
          .request()
          .input("cod", codPadded)
          .input("nombre", productName)
          .input("codbar", barcode)
          .query(`
            INSERT INTO [${dbProd}].dbo.Productos (Cod, Nombre, Codbar)
            VALUES (@cod, @nombre, @codbar)
          `);

        // Create Stock row
        await pool
          .request()
          .input("codProd", codPadded)
          .input("stk", cantidad)
          .query(`
            INSERT INTO [${dbProd}].dbo.Stock (CodProducto, Deposito, Stk, Costo)
            VALUES (@codProd, '0  ', @stk, 0)
          `);

        pgItems.push({
          sku: String(nextProdCod),
          productName,
          cantidad,
          isNewProduct: true,
        });
      } else {
        // Update existing stock
        const codPadded = padLeft(sku, 7);
        await pool
          .request()
          .input("cod", codPadded)
          .input("cant", cantidad)
          .query(`
            UPDATE [${dbProd}].dbo.Stock
            SET Stk = ISNULL(Stk, 0) + @cant
            WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
          `);

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

      await pool
        .request()
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

    // Update Proveedores.Saldo if total > 0
    if (totalAmount > 0) {
      const provPadded = padLeft(proveedorCod, 7);
      await pool
        .request()
        .input("cod", provPadded)
        .input("total", totalAmount)
        .query(`
          UPDATE [${dbProd}].dbo.Proveedores
          SET Saldo = ISNULL(Saldo, 0) + @total
          WHERE Cod = @cod
        `);
    }

    // Save in PostgreSQL
    const entry = await prisma.stockEntry.create({
      data: {
        proveedorCod,
        proveedorName,
        usuario,
        estado: "pendiente",
        total: totalAmount,
        notas: notas || null,
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

    return NextResponse.json({ entry });
  } catch (error) {
    console.error("Error creating stock entry:", error);
    return NextResponse.json(
      { error: "Error al crear ingreso de stock" },
      { status: 500 }
    );
  }
}
