import { getPool, getDbName } from "../src/lib/mssql";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function backupPedidos() {
  console.log(`[${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}] Backing up pedidos...`);

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbClientes = getDbName("clientes");

    // Get all active pedidos with items
    const headers = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Cliente)) AS clienteCod,
        LTRIM(RTRIM(ISNULL(c.Nombre, ''))) AS clienteName,
        ISNULL(p.Total, 0) AS total,
        LTRIM(RTRIM(p.Fechora)) AS fechora,
        LTRIM(RTRIM(ISNULL(p.Nroped, ''))) AS nroped
      FROM [${dbPedidos}].dbo.Pedidos p
      LEFT JOIN [${dbClientes}].dbo.Clientes c ON c.Cod = p.Cliente
      WHERE p.Tipo = 'V' AND LTRIM(RTRIM(p.Itm)) = '0'
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
    `);

    const items = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Boleta)) AS boleta,
        LTRIM(RTRIM(p.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS productName,
        ISNULL(p.Cant, 0) AS cant,
        ISNULL(p.Precio, 0) AS precio,
        ISNULL(p.Impo, 0) AS impo
      FROM [${dbPedidos}].dbo.Pedidos p
      LEFT JOIN [${getDbName("productos")}].dbo.Productos pr ON pr.Cod = p.Producto
      WHERE p.Tipo = 'V' AND CAST(p.Itm AS INT) > 0
        AND (p.Anulado IS NULL OR LTRIM(RTRIM(p.Anulado)) = '' OR p.Anulado = ' ')
    `);

    // Group items by boleta
    const itemsByBoleta = new Map<string, Array<Record<string, unknown>>>();
    for (const item of items.recordset) {
      if (!itemsByBoleta.has(item.boleta)) itemsByBoleta.set(item.boleta, []);
      itemsByBoleta.get(item.boleta)!.push(item);
    }

    let saved = 0;
    for (const h of headers.recordset) {
      const boletaItems = itemsByBoleta.get(h.boleta) || [];

      // Upsert — update if exists, create if not
      await prisma.pedidoBackup.upsert({
        where: { boleta: h.boleta },
        update: {
          clienteCod: h.clienteCod,
          clienteName: h.clienteName,
          total: Number(h.total),
          fechora: h.fechora,
          nroped: h.nroped,
          items: JSON.stringify(boletaItems.map((i) => ({
            sku: String(i.sku || ""),
            nombre: String(i.productName || ""),
            cant: Number(i.cant || 0),
            precio: Number(i.precio || 0),
            impo: Number(i.impo || 0),
          }))),
          active: true,
        },
        create: {
          boleta: h.boleta,
          clienteCod: h.clienteCod,
          clienteName: h.clienteName,
          total: Number(h.total),
          fechora: h.fechora,
          nroped: h.nroped,
          items: JSON.stringify(boletaItems.map((i) => ({
            sku: String(i.sku || ""),
            nombre: String(i.productName || ""),
            cant: Number(i.cant || 0),
            precio: Number(i.precio || 0),
            impo: Number(i.impo || 0),
          }))),
          active: true,
        },
      });
      saved++;
    }

    // Mark pedidos that no longer exist in PunTouch as inactive
    const activeBoletas = headers.recordset.map((h: { boleta: string }) => h.boleta);
    if (activeBoletas.length > 0) {
      await prisma.pedidoBackup.updateMany({
        where: { active: true, boleta: { notIn: activeBoletas } },
        data: { active: false, deletedAt: new Date() },
      });
    }

    console.log(`  Backed up ${saved} pedidos. Active boletas: ${activeBoletas.length}`);

    // ── Monitor TotalCompras overflow ──
    // Reset clients approaching the decimal(9,2) limit that PunTouch uses internally
    const LIMIT = 90000000; // 90M — reset before reaching 99.99M
    const overflow = await pool.request().query(`
      UPDATE [${getDbName("clientes")}].dbo.Clientes
      SET TotalCompras = 0
      WHERE TotalCompras > ${LIMIT} AND (DeBaja = 0 OR DeBaja IS NULL)
    `);
    if (overflow.rowsAffected[0] > 0) {
      console.log(`  ⚠ Reset TotalCompras for ${overflow.rowsAffected[0]} clients (exceeded ${LIMIT})`);
    }

    // ── Fix saldos for clients with TotalCompras = 0 and Saldo = 0 but missed deuda ──
    const staleClients = await pool.request().query(`
      SELECT LTRIM(RTRIM(c.Cod)) AS cod, LTRIM(RTRIM(ISNULL(c.TransaUlt, ''))) AS transaUlt
      FROM [${getDbName("clientes")}].dbo.Clientes c
      WHERE c.TotalCompras = 0 AND ISNULL(c.Saldo, 0) = 0
        AND (c.DeBaja = 0 OR c.DeBaja IS NULL)
        AND c.TransaUlt IS NOT NULL AND LTRIM(RTRIM(c.TransaUlt)) != ''
    `);
    let saldosFixed = 0;
    for (const c of staleClients.recordset) {
      const transaUlt = parseInt(String(c.transaUlt).trim()) || 0;
      if (transaUlt === 0) continue;
      const missed = await pool.request().query(`
        SELECT SUM(Deuda) AS d, MAX(LTRIM(RTRIM(Boleta))) AS lb
        FROM [${getDbName("transas")}].dbo.Transas
        WHERE LTRIM(RTRIM(Cliente)) = '${c.cod}'
          AND Tipo = 'V' AND LTRIM(RTRIM(Itm)) = '0'
          AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
          AND CAST(LTRIM(RTRIM(Cod)) AS BIGINT) > ${transaUlt}
          AND Deuda > 0
      `);
      const d = Number(missed.recordset[0]?.d || 0);
      const lb = missed.recordset[0]?.lb || '';
      if (d > 0 && lb) {
        await pool.request().query(`
          UPDATE [${getDbName("clientes")}].dbo.Clientes
          SET Saldo = ${Math.round(d * 100) / 100}, TransaUlt = '${lb.padStart(9, ' ')}'
          WHERE LTRIM(RTRIM(Cod)) = '${c.cod}'
        `);
        saldosFixed++;
      }
    }
    if (saldosFixed > 0) {
      console.log(`  ⚠ Fixed saldos for ${saldosFixed} clients with missed deuda`);
    }

  } catch (error) {
    console.error("Backup pedidos error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

backupPedidos();
