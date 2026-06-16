import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

// GET — list archived orders
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const clienteCod = searchParams.get("cliente") || undefined;
  const days = parseInt(searchParams.get("days") || "30");

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.getFullYear().toString()
    + String(since.getMonth() + 1).padStart(2, "0")
    + String(since.getDate()).padStart(2, "0")
    + "000000";

  const orders = await prisma.archivedOrder.findMany({
    where: {
      ...(clienteCod ? { clienteCod } : {}),
      fechora: { gte: sinceStr },
    },
    include: { items: true },
    orderBy: { fechora: "desc" },
  });

  return NextResponse.json({ orders });
}

// POST — archive orders from PunTouch and delete them.
// Optional `boleta`: if provided, only that single boleta is processed
// (lets staff dry-run on one row to validate the stock-restore math).
export async function POST(req: NextRequest) {
  const { clienteCod, clienteName, cronSecret, boleta } = (await req.json()) as {
    clienteCod: string;
    clienteName?: string;
    cronSecret?: string;
    boleta?: string;
  };

  // Allow access from admin/staff session OR cron secret
  if (cronSecret !== process.env.NEXTAUTH_SECRET) {
    if (!(await requireStaff())) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }
  }

  if (!clienteCod) {
    return NextResponse.json({ error: "clienteCod requerido" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbProductos = getDbName("productos");
    const clienteTrim = clienteCod.trim();
    const nombreTrim = (clienteName || "").trim().toUpperCase();
    const boletaTrim = (boleta || "").trim();

    // Match by cliente cod OR by nombre (mostrador sales may have varying cliente codes
    // but consistently use the cliente name like LOCAL1)
    const matchClause = nombreTrim
      ? `(LTRIM(RTRIM(p.Cliente)) = @cliente OR UPPER(LTRIM(RTRIM(ISNULL(p.Nombre,'')))) = @nombre)`
      : `LTRIM(RTRIM(p.Cliente)) = @cliente`;
    const boletaClause = boletaTrim
      ? ` AND LTRIM(RTRIM(p.Boleta)) = @boleta`
      : "";

    // Get order headers
    const headersReq = pool
      .request()
      .input("cliente", clienteTrim)
      .input("nombre", nombreTrim);
    if (boletaTrim) headersReq.input("boleta", boletaTrim);
    const headers = await headersReq.query(`
        SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Nroped)) AS nroped,
          LTRIM(RTRIM(p.Fechora)) AS fechora,
          LTRIM(RTRIM(p.Cliente)) AS clienteCod,
          LTRIM(RTRIM(p.Nombre)) AS clienteName,
          p.Cant AS totalCant,
          p.Total AS total,
          LTRIM(RTRIM(ISNULL(p.Observaciones,''))) AS notas
        FROM [${dbPedidos}].dbo.Pedidos p
        WHERE p.Tipo = 'V' AND ${matchClause}${boletaClause}
          AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
        ORDER BY p.Fechora DESC
      `);

    if (headers.recordset.length === 0) {
      return NextResponse.json({ archived: 0, deleted: 0, message: "No hay pedidos pendientes" });
    }

    // Get items — filter by the boletas we just found (avoids any cliente/nombre divergence between header and item rows)
    const boletaList = headers.recordset.map((h: { boleta: string }) => `'${h.boleta.replace(/'/g, "''")}'`).join(",");
    const items = await pool
      .request()
      .query(`
        SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Producto)) AS sku,
          LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS productName,
          p.Cant AS cant,
          p.Precio AS precio,
          p.Impo AS impo,
          p.ListaPrecio AS listaPrecio
        FROM [${dbPedidos}].dbo.Pedidos p
        LEFT JOIN [${dbProductos}].dbo.Productos pr ON pr.Cod = p.Producto
        WHERE p.Tipo = 'I' AND LTRIM(RTRIM(p.Boleta)) IN (${boletaList})
      `);

    // Group items by boleta
    const itemsByBoleta = new Map<string, Array<{ boleta: string; sku: string; productName: string; cant: number; precio: number; impo: number; listaPrecio: number }>>();
    for (const item of items.recordset) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    // Store in PostgreSQL
    let archived = 0;
    for (const h of headers.recordset) {
      const orderItems = itemsByBoleta.get(h.boleta) || [];
      await prisma.archivedOrder.create({
        data: {
          boleta: h.boleta,
          nroped: h.nroped,
          fechora: h.fechora,
          clienteCod: h.clienteCod,
          clienteName: h.clienteName,
          totalCant: h.totalCant,
          total: h.total,
          notas: h.notas || null,
          items: {
            create: orderItems.map((i) => ({
              sku: i.sku,
              productName: i.productName,
              cant: i.cant,
              precio: i.precio,
              impo: i.impo,
              listaPrecio: i.listaPrecio,
            })),
          },
        },
      });
      archived++;
    }

    // Restore Stock for each archived item — PunTouch reserves (decrements)
    // stock when a Pedido is loaded as pendiente.  Without this step, the
    // archive would leave the stock permanently reduced.  Aggregate by sku
    // to do one UPDATE per product instead of one per item line.
    const cantBySku = new Map<string, number>();
    const nameBySku = new Map<string, string>();
    for (const it of items.recordset as Array<{ sku: string; cant: number; productName: string }>) {
      const sku = String(it.sku).trim();
      if (!sku) continue;
      const cant = Number(it.cant) || 0;
      if (cant <= 0) continue;
      cantBySku.set(sku, (cantBySku.get(sku) || 0) + cant);
      if (!nameBySku.has(sku) && it.productName) nameBySku.set(sku, it.productName);
    }

    // Snapshot Stk BEFORE so we can return per-sku stkBefore -> stkAfter for verification
    const stkBefore = new Map<string, number>();
    const stkAfter = new Map<string, number>();
    if (cantBySku.size > 0) {
      const skuPaddedQuoted = Array.from(cantBySku.keys())
        .map((s) => `'${s.padStart(7, " ").replace(/'/g, "''")}'`)
        .join(",");
      const beforeRes = await pool.request().query(`
        SELECT LTRIM(RTRIM(CodProducto)) AS sku, ISNULL(Stk, 0) AS stk
        FROM [${dbProductos}].dbo.Stock
        WHERE CodProducto IN (${skuPaddedQuoted})
          AND LTRIM(RTRIM(Deposito)) = '0'
          AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
      `);
      for (const row of beforeRes.recordset as Array<{ sku: string; stk: number }>) {
        stkBefore.set(row.sku, Number(row.stk));
      }

      // Apply restores
      let stockRestoredCount = 0;
      for (const [sku, cant] of Array.from(cantBySku.entries())) {
        const codPadded = sku.padStart(7, " ");
        const r = await pool
          .request()
          .input("cod", codPadded)
          .input("cant", cant)
          .query(`
            UPDATE [${dbProductos}].dbo.Stock
            SET Stk = ISNULL(Stk, 0) + @cant
            WHERE LTRIM(RTRIM(CodProducto)) = LTRIM(RTRIM(@cod))
              AND LTRIM(RTRIM(Deposito)) = '0'
              AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
          `);
        if (r.rowsAffected[0] > 0) stockRestoredCount++;
      }

      // Snapshot AFTER
      const afterRes = await pool.request().query(`
        SELECT LTRIM(RTRIM(CodProducto)) AS sku, ISNULL(Stk, 0) AS stk
        FROM [${dbProductos}].dbo.Stock
        WHERE CodProducto IN (${skuPaddedQuoted})
          AND LTRIM(RTRIM(Deposito)) = '0'
          AND (TalleColor IS NULL OR LTRIM(RTRIM(TalleColor)) = '')
      `);
      for (const row of afterRes.recordset as Array<{ sku: string; stk: number }>) {
        stkAfter.set(row.sku, Number(row.stk));
      }

      // Log so it's visible in server logs too
      console.log(`[ARCHIVE-ORDERS] boleta=${boletaTrim || "(all)"} archived=${archived} skusRestituidos=${stockRestoredCount}`);
      for (const [sku, cant] of Array.from(cantBySku.entries())) {
        console.log(`  ${sku.padStart(7, " ")}  +${cant}  ${stkBefore.get(sku) ?? "(no-row)"} -> ${stkAfter.get(sku) ?? "(no-row)"}`);
      }
    }

    const stockChanges = Array.from(cantBySku.entries()).map(([sku, cant]) => ({
      sku,
      productName: nameBySku.get(sku) || "",
      cant,
      stkBefore: stkBefore.has(sku) ? stkBefore.get(sku) : null,
      stkAfter: stkAfter.has(sku) ? stkAfter.get(sku) : null,
      delta: stkBefore.has(sku) && stkAfter.has(sku)
        ? Number(stkAfter.get(sku)) - Number(stkBefore.get(sku))
        : null,
    }));
    const stockRestored = stockChanges.filter((c) => c.delta !== null && c.delta > 0).length;

    // Delete from PunTouch — delete the exact boletas we archived (both header and items)
    const del = await pool
      .request()
      .query(`
        DELETE FROM [${dbPedidos}].dbo.Pedidos
        WHERE LTRIM(RTRIM(Boleta)) IN (${boletaList})
      `);

    return NextResponse.json({
      archived,
      deleted: del.rowsAffected[0],
      stockRestored,
      stockSkus: cantBySku.size,
      stockChanges,
      boleta: boletaTrim || null,
      message: `${archived} pedidos archivados, ${stockRestored} productos con stock restituido, ${del.rowsAffected[0]} filas eliminadas de PunTouch`,
    });
  } catch (error) {
    console.error("Archive error:", error);
    return NextResponse.json({ error: "Error al archivar pedidos" }, { status: 500 });
  }
}
