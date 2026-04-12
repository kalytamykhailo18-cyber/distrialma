import { NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbPed = getDbName("pedidos");
    const dbCli = getDbName("clientes");
    const dbProd = getDbName("productos");
    const dbTransas = getDbName("transas");

    // Get order headers (Tipo=V) with client zona
    const headers = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Nroped)) AS nroped,
        LTRIM(RTRIM(p.Fechora)) AS fechora,
        p.Cant AS totalCant,
        p.Total AS total,
        LTRIM(RTRIM(p.Cliente)) AS clienteCod,
        LTRIM(RTRIM(p.Nombre)) AS clienteNombre,
        LTRIM(RTRIM(ISNULL(p.Observaciones,''))) AS notas,
        LTRIM(RTRIM(ISNULL(p.Telefono,''))) AS telefono,
        LTRIM(RTRIM(ISNULL(z.[Desc],''))) AS deliveryDay
      FROM [${dbPed}].dbo.Pedidos p
      LEFT JOIN [${dbCli}].dbo.Clientes c ON c.Cod = p.Cliente
      LEFT JOIN [${dbCli}].dbo.Zonas z ON z.Cod = c.Zona
      WHERE p.Tipo = 'V'
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
        AND p.Fechora >= CONVERT(VARCHAR(8), DATEADD(DAY, -14, GETDATE()), 112) + '000000'
      ORDER BY p.Fechora DESC
    `);

    // Get item rows for these orders
    const headerBoletas = headers.recordset.map((h: { boleta: string }) => `'${h.boleta}'`).join(",") || "''";
    const items = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(pr.Nombre,''))) AS productName,
        p.Cant AS cant,
        p.Precio AS precio,
        p.Impo AS impo,
        p.ListaPrecio AS listaPrecio
      FROM [${dbPed}].dbo.Pedidos p
      LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = p.Producto
      WHERE p.Tipo = 'I'
        AND LTRIM(RTRIM(p.Boleta)) IN (${headerBoletas})
    `);

    // Match invoices by clienteCod + fecha (factura must be AFTER the pedido)
    const clientCods = Array.from(new Set(headers.recordset.map((h: { clienteCod: string }) => h.clienteCod).filter(Boolean)));
    // Map: "clienteCod|pedidoFechora" → factura data
    const invoicedByClientDate = new Map<string, { total: number; items: Array<{ sku: string; name: string; cant: number; precio: number; impo: number }> }>();

    if (clientCods.length > 0) {
      // Get earliest pedido date to limit search
      const earliestPedido = headers.recordset.reduce((min: string, h: { fechora: string }) => h.fechora < min ? h.fechora : min, headers.recordset[0].fechora);
      const clientList = clientCods.map((c: string) => `'${c.padStart(7, " ")}'`).join(",");

      const invoiceHeaders = await pool.request().input("since", earliestPedido).query(`
        SELECT TOP 500
          LTRIM(RTRIM(t.Boleta)) AS boleta,
          LTRIM(RTRIM(t.Cliente)) AS clienteCod,
          LTRIM(RTRIM(t.Fechora)) AS fechora,
          t.Total AS total
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'V'
          AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
          AND t.Cliente IN (${clientList})
          AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
          AND LTRIM(RTRIM(t.Fechora)) >= @since
        ORDER BY t.Fechora ASC
      `);

      if (invoiceHeaders.recordset.length > 0) {
        const boletaList = invoiceHeaders.recordset.map((h: { boleta: string }) => `'${h.boleta}'`).join(",");
        const invoiceItems = await pool.request().query(`
          SELECT
            LTRIM(RTRIM(t.Boleta)) AS boleta,
            LTRIM(RTRIM(t.Producto)) AS sku,
            LTRIM(RTRIM(ISNULL(pr.Nombre,''))) AS name,
            t.Cant AS cant,
            t.Precio AS precio,
            t.Impo AS impo
          FROM [${dbTransas}].dbo.Transas t
          LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
          WHERE t.Tipo = 'I'
            AND LTRIM(RTRIM(t.Boleta)) IN (${boletaList})
        `);

        const invItemsByBoleta = new Map<string, Array<{ sku: string; name: string; cant: number; precio: number; impo: number }>>();
        for (const item of invoiceItems.recordset) {
          if (!invItemsByBoleta.has(item.boleta)) invItemsByBoleta.set(item.boleta, []);
          invItemsByBoleta.get(item.boleta)!.push(item);
        }

        // For each pedido, find the first invoice from same client AFTER the pedido date
        for (const ped of headers.recordset) {
          const cCod = (ped as { clienteCod: string }).clienteCod;
          const pedFechora = (ped as { fechora: string }).fechora;
          const key = `${cCod}|${pedFechora}`;
          if (invoicedByClientDate.has(key)) continue;

          // Find first invoice for this client after this pedido
          const match = invoiceHeaders.recordset.find(
            (inv: { clienteCod: string; fechora: string }) => inv.clienteCod.trim() === cCod && inv.fechora > pedFechora
          );
          if (match) {
            invoicedByClientDate.set(key, {
              total: match.total,
              items: invItemsByBoleta.get(match.boleta) || [],
            });
          }
        }
      }
    }

    // Group items by boleta
    const itemsByBoleta = new Map<string, Array<{ boleta: string; sku: string; productName: string; cant: number; precio: number; impo: number; listaPrecio: number }>>();
    for (const item of items.recordset) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    // Build individual orders from Pedidos
    const rawOrders = headers.recordset.map((h) => {
      const factura = invoicedByClientDate.get(`${h.clienteCod}|${h.fechora}`) || null;
      return {
        boleta: h.boleta,
        nroped: h.nroped,
        date: h.fechora,
        totalCant: h.totalCant,
        total: h.total,
        clienteCod: h.clienteCod,
        clienteNombre: h.clienteNombre,
        notas: h.notas,
        telefono: h.telefono,
        deliveryDay: h.deliveryDay || "Sin asignar",
        items: (itemsByBoleta.get(h.boleta) || []).map((i) => ({
          sku: i.sku,
          name: i.productName,
          cant: i.cant,
          precio: i.precio,
          impo: i.impo,
          listaPrecio: i.listaPrecio,
        })),
        facturado: factura ? {
          total: factura.total,
          items: factura.items,
        } : null,
      };
    });

    // Merge orders from the same client (same clienteCod + deliveryDay)
    const mergeKey = (o: typeof rawOrders[0]) => `${o.clienteCod}|${o.deliveryDay}`;
    const merged = new Map<string, typeof rawOrders[0]>();
    for (const o of rawOrders) {
      const key = mergeKey(o);
      const existing = merged.get(key);
      if (existing) {
        // Merge items: combine same SKU quantities
        for (const item of o.items) {
          const found = existing.items.find((e) => e.sku === item.sku);
          if (found) {
            found.cant += item.cant;
            found.impo += item.impo;
          } else {
            existing.items.push(item);
          }
        }
        existing.total += o.total;
        existing.totalCant += o.totalCant;
        existing.nroped += `, ${o.nroped}`;
        if (o.notas && !existing.notas.includes(o.notas)) {
          existing.notas = existing.notas ? `${existing.notas} | ${o.notas}` : o.notas;
        }
        // Keep earliest date
        if (o.date < existing.date) existing.date = o.date;
      } else {
        merged.set(key, { ...o, items: [...o.items] });
      }
    }

    const orders = Array.from(merged.values());

    return NextResponse.json({ orders });
  } catch (error) {
    console.error("Error fetching orders:", error);
    return NextResponse.json(
      { error: "Error al cargar pedidos" },
      { status: 500 }
    );
  }
}
