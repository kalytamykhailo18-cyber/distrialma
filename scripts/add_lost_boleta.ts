import fs from "fs";
const envFile = fs.readFileSync("/home/distrialma/.env", "utf8");
for (const line of envFile.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}
import sql from "mssql";

const config: sql.config = {
  server: process.env.MSSQL_HOST!,
  port: parseInt(process.env.MSSQL_PORT || "1433"),
  user: process.env.MSSQL_USER!,
  password: process.env.MSSQL_PASSWORD!,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};
const dbTransas = process.env.MSSQL_DB_TRANSAS!;
const dbProductos = process.env.MSSQL_DB_PRODUCTOS!;
const dbClientes = process.env.MSSQL_DB_CLIENTES!;

const DRY_RUN = process.env.DRY_RUN !== "false";

// From the printed ticket (30/05/26 13:09:28, Local Reventas, GABY, EMILIANO REVENTA)
const FECHORA = "20260530130928";
const SUCURSAL = "10";
const EMPLEADO_COD = "56";     // GABY
const CLIENTE_COD = "14450";    // EMILIANO REVENTA
const CLIENTE_NOMBRE = "EMILIANO REVENTA";
const CLIENTE_CUIT = "36532773"; // from existing boleta 73369942 record
const LISTA_PRECIO = 3;          // Especial (matches existing Emiliano Reventa pricing)

const ITEMS = [
  { sku: "7569", nombre: "ACEITE CORAZON 1.5L",      cant: 2016, precio: 3310, impo: 6672960 },
  { sku: "5204", nombre: "HARINA BRUNING 000 KG",    cant: 3150, precio: 550,  impo: 1732500 },
  { sku: "1695", nombre: "FIDEO 308 N2 NIDO HUEVO",  cant: 1164, precio: 1503, impo: 1749492 },
  { sku: "1351", nombre: "FIDEO 308 N3 NIDO HUEVO",  cant: 240,  precio: 1503, impo: 360720  },
  { sku: "1350", nombre: "FIDEO 308 N1 NIDO HUEVO",  cant: 264,  precio: 1503, impo: 396792  },
  { sku: "6078", nombre: "FIDEO 308 N4 NIDO HUEVO",  cant: 24,   precio: 1503, impo: 36072   },
];

const TOTAL = ITEMS.reduce((s, i) => s + i.impo, 0);
const TOTAL_CANT = ITEMS.reduce((s, i) => s + i.cant, 0);
const TICKET_IVA_CONTENIDO = 1900159;

function pad(n: string | number, len: number, ch = " "): string {
  return String(n).padStart(len, ch);
}

async function main() {
  console.log(`=== ${DRY_RUN ? "DRY RUN" : "LIVE COMMIT"} ===`);
  console.log(`Total items: ${ITEMS.length}, Total cant: ${TOTAL_CANT}, Total monto: $${TOTAL.toLocaleString("es-AR")}`);
  console.log(`Ticket says total: $10,948,536  →  matches: ${TOTAL === 10948536}`);
  console.log(`Ticket cant articulos: 6,858  →  matches: ${TOTAL_CANT === 6858}`);

  const pool = await new sql.ConnectionPool(config).connect();

  // Baseline: current saldo + stocks
  const before = await pool.request().query(`
    SELECT Saldo FROM [${dbClientes}].dbo.Clientes WHERE LTRIM(RTRIM(Cod)) = '${CLIENTE_COD}'
  `);
  const saldoBefore = Number(before.recordset[0]?.Saldo || 0);

  const stocksBefore = await pool.request().query(`
    SELECT LTRIM(RTRIM(CodProducto)) AS sku, ISNULL(Stk,0) AS stk, ISNULL(Costo,0) AS costo
    FROM [${dbProductos}].dbo.Stock
    WHERE CodProducto IN (${ITEMS.map(i => `'${pad(i.sku, 7)}'`).join(",")})
      AND LTRIM(RTRIM(Deposito))='0'
  `);
  const stockMap = new Map<string, { stk: number; costo: number }>(
    stocksBefore.recordset.map((r: { sku: string; stk: number; costo: number }) => [r.sku, { stk: Number(r.stk), costo: Number(r.costo) }])
  );

  console.log(`\n=== BEFORE ===`);
  console.log(`Cliente saldo: $${saldoBefore.toLocaleString("es-AR")}`);
  for (const it of ITEMS) {
    const s = stockMap.get(it.sku);
    console.log(`  ${it.sku} ${it.nombre.padEnd(35)} stock=${s?.stk ?? "?"}  costo=$${s?.costo ?? "?"}`);
  }

  // Max nro sequences
  const maxResult = await pool.request().query(`
    SELECT ISNULL(MAX(CAST(LTRIM(RTRIM(Cod)) AS BIGINT)), 0) AS maxCod,
           ISNULL(MAX(CAST(LTRIM(RTRIM(Nroped)) AS INT)), 0) AS maxNroped,
           ISNULL(MAX(CAST(LTRIM(RTRIM(NroTransa)) AS INT)), 0) AS maxNroTransa,
           ISNULL(MAX(CAST(LTRIM(RTRIM(NroMostra)) AS INT)), 0) AS maxNroMostra
    FROM [${dbTransas}].dbo.Transas
    WHERE LTRIM(RTRIM(Cod)) NOT LIKE '%[^0-9 ]%'
      AND LTRIM(RTRIM(ISNULL(NroTransa,''))) NOT LIKE '%[^0-9 ]%' AND LTRIM(RTRIM(ISNULL(Nroped,''))) NOT LIKE '%[^0-9 ]%' AND LTRIM(RTRIM(ISNULL(NroMostra,''))) NOT LIKE '%[^0-9 ]%'
  `);
  let nextCod = Number(maxResult.recordset[0].maxCod) + 1;
  const headerCod = pad(nextCod, 9);
  const nextNroped = pad(Number(maxResult.recordset[0].maxNroped) + 1, 8, "0");
  const nextNroTransa = pad(Number(maxResult.recordset[0].maxNroTransa) + 1, 8, "0");
  const nextNroMostra = pad(Number(maxResult.recordset[0].maxNroMostra) + 1, 8, "0");

  console.log(`\n=== NEW BOLETA ===`);
  console.log(`Boleta/Cod: ${headerCod.trim()}, Nroped: ${nextNroped}, NroTransa: ${nextNroTransa}, NroMostra: ${nextNroMostra}`);

  // Compute item costo and IVA contained
  const itemsExt = ITEMS.map((it) => {
    const stockInfo = stockMap.get(it.sku);
    const unitCost = stockInfo?.costo ?? 0;
    const totalCosto = Math.round(unitCost * it.cant * 100) / 100;
    const impoIva = Math.round((it.impo * 21 / 121) * 100) / 100;
    return { ...it, totalCosto, impoIva };
  });
  const headerImpoIva = Math.round(itemsExt.reduce((s, i) => s + i.impoIva, 0) * 100) / 100;
  console.log(`Computed ImpoIva header: $${headerImpoIva.toLocaleString("es-AR")}  vs ticket $${TICKET_IVA_CONTENIDO.toLocaleString("es-AR")}  diff: $${(headerImpoIva - TICKET_IVA_CONTENIDO).toFixed(2)}`);

  const tx = pool.transaction();
  await tx.begin();
  try {
    // Insert header
    await tx.request()
      .input("cod", headerCod).input("itm", "0  ").input("suc", pad(SUCURSAL, 3))
      .input("fechora", FECHORA).input("cant", TOTAL_CANT)
      .input("impo", TOTAL).input("total", TOTAL).input("deuda", TOTAL)
      .input("impoIva", headerImpoIva)
      .input("nroped", nextNroped).input("nroTransa", nextNroTransa).input("nroMostra", nextNroMostra)
      .input("emp", pad(EMPLEADO_COD, 7)).input("cli", pad(CLIENTE_COD, 7))
      .input("nombre", CLIENTE_NOMBRE).input("cuit", pad(CLIENTE_CUIT, 14))
      .query(`
        INSERT INTO [${dbTransas}].dbo.Transas
          (Cod, Boleta, Itm, Tipo, TipoFac, Sucursal, Deposito, Terminal, Fechora,
           Producto, Cant, Precio, Impo, Total, Costo, Efectivo, Tarjeta, Deuda, Vuelto, Sena,
           Descuento, Recargo, ImpoIva, ImpoCos, InicioCaja, NroCierreCaja, PorceDescuento,
           Observaciones, MovCaja, Concepto, CodTarjeta, NroTarjeta, ListaPrecio,
           Usuario, Empleado, Proveedor, Nroped, NroMostra, NroTransa,
           Telefono, Cliente, Nombre, Calle, Nume, PisoDto, Entre1, Entre2,
           Localidad, CUIT, IVA, FechoraEntregar, Anulado,
           Filler1, Filler2, Filler3,
           FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
           FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
        VALUES
          (@cod, @cod, @itm, 'V', ' ', @suc, '0  ', 0, @fechora,
           '       ', @cant, 0, @impo, @total, 0, 0, 0, @deuda, 0, 0,
           0, 0, @impoIva, 0, 0, 0, 0,
           '', ' ', '', '    ', '', 0,
           '*admini', @emp, '       ', @nroped, @nroMostra, @nroTransa,
           '              ', @cli, @nombre, '', '', '', '', '',
           '    ', @cuit, ' ', '              ', ' ',
           '', '', '',
           0, 0, 0, 0, 0,
           0, 0, 0, 0, 0)
      `);
    nextCod++;

    for (let i = 0; i < itemsExt.length; i++) {
      const it = itemsExt[i];
      const itemCod = pad(nextCod, 9);
      nextCod++;
      await tx.request()
        .input("cod", itemCod).input("boleta", headerCod).input("itm", pad(i + 1, 3))
        .input("suc", pad(SUCURSAL, 3)).input("fechora", FECHORA)
        .input("producto", pad(it.sku, 7))
        .input("cant", it.cant).input("precio", it.precio).input("impo", it.impo).input("total", TOTAL)
        .input("costo", it.totalCosto).input("impoIva", it.impoIva)
        .input("nroped", nextNroped).input("nroTransa", nextNroTransa).input("nroMostra", nextNroMostra)
        .input("emp", pad(EMPLEADO_COD, 7)).input("cli", pad(CLIENTE_COD, 7))
        .input("nombre", CLIENTE_NOMBRE).input("cuit", pad(CLIENTE_CUIT, 14))
        .input("lista", LISTA_PRECIO).input("deuda", TOTAL)
        .query(`
          INSERT INTO [${dbTransas}].dbo.Transas
            (Cod, Boleta, Itm, Tipo, TipoFac, Sucursal, Deposito, Terminal, Fechora,
             Producto, Cant, Precio, Impo, Total, Costo, Efectivo, Tarjeta, Deuda, Vuelto, Sena,
             Descuento, Recargo, ImpoIva, ImpoCos, InicioCaja, NroCierreCaja, PorceDescuento,
             Observaciones, MovCaja, Concepto, CodTarjeta, NroTarjeta, ListaPrecio,
             Usuario, Empleado, Proveedor, Nroped, NroMostra, NroTransa,
             Telefono, Cliente, Nombre, Calle, Nume, PisoDto, Entre1, Entre2,
             Localidad, CUIT, IVA, FechoraEntregar, Anulado,
             Filler1, Filler2, Filler3,
             FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
             FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
          VALUES
            (@cod, @boleta, @itm, 'I', ' ', @suc, '0  ', 0, @fechora,
             @producto, @cant, @precio, @impo, @total, @costo, 0, 0, @deuda, 0, 0,
             0, 0, @impoIva, 0, 0, 0, 0,
             '', ' ', '', '    ', '', @lista,
             '*admini', @emp, '       ', @nroped, @nroMostra, @nroTransa,
             '              ', @cli, @nombre, '', '', '', '', '',
             '    ', @cuit, ' ', '              ', ' ',
             '', '', '',
             0, 0, 0, 0, 0,
             0, 0, 0, 0, 0)
        `);

      // Decrement stock
      await tx.request()
        .input("cod", pad(it.sku, 7)).input("cant", it.cant)
        .query(`
          UPDATE [${dbProductos}].dbo.Stock
          SET Stk = ISNULL(Stk, 0) - @cant
          WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
        `);
    }

    // Update cliente saldo (add the deuda)
    await tx.request()
      .input("cod", CLIENTE_COD).input("delta", TOTAL)
      .query(`
        UPDATE [${dbClientes}].dbo.Clientes
        SET Saldo = ISNULL(Saldo, 0) + @delta
        WHERE LTRIM(RTRIM(Cod)) = @cod
      `);

    // Snapshot AFTER (inside transaction)
    const afterSaldoRes = await tx.request().input("cod", CLIENTE_COD).query(`
      SELECT Saldo FROM [${dbClientes}].dbo.Clientes WHERE LTRIM(RTRIM(Cod)) = @cod
    `);
    const afterStocksRes = await tx.request().query(`
      SELECT LTRIM(RTRIM(CodProducto)) AS sku, ISNULL(Stk,0) AS stk
      FROM [${dbProductos}].dbo.Stock
      WHERE CodProducto IN (${ITEMS.map(i => `'${pad(i.sku, 7)}'`).join(",")})
        AND LTRIM(RTRIM(Deposito))='0'
    `);
    const afterMap = new Map<string, number>(
      afterStocksRes.recordset.map((r: { sku: string; stk: number }) => [r.sku, Number(r.stk)])
    );

    const insertedHeaderRes = await tx.request().input("cod", headerCod.trim()).query(`
      SELECT Cant, Total, Deuda, ImpoIva
      FROM [${dbTransas}].dbo.Transas
      WHERE LTRIM(RTRIM(Cod)) = @cod AND Tipo='V' AND LTRIM(RTRIM(Itm))='0'
    `);
    const insertedItemsRes = await tx.request().input("boleta", headerCod.trim()).query(`
      SELECT LTRIM(RTRIM(Producto)) AS sku, Cant, Precio, Impo
      FROM [${dbTransas}].dbo.Transas
      WHERE LTRIM(RTRIM(Boleta)) = @boleta AND Tipo='I'
      ORDER BY Itm
    `);

    console.log(`\n=== AFTER (in-tx) ===`);
    console.log(`Cliente saldo: $${Number(afterSaldoRes.recordset[0].Saldo).toLocaleString("es-AR")}  (delta: +$${(Number(afterSaldoRes.recordset[0].Saldo) - saldoBefore).toLocaleString("es-AR")})`);
    for (const it of ITEMS) {
      const before = stockMap.get(it.sku)?.stk ?? 0;
      const after = afterMap.get(it.sku) ?? 0;
      console.log(`  ${it.sku} ${it.nombre.padEnd(35)} ${before} → ${after}  (delta -${it.cant})`);
    }
    console.log(`Header: ${JSON.stringify(insertedHeaderRes.recordset[0])}`);
    console.log(`Items: ${insertedItemsRes.recordset.length} rows`);
    insertedItemsRes.recordset.forEach((r: { sku: string; Cant: number; Precio: number; Impo: number }) => console.log(`  ${r.sku} cant=${r.Cant} precio=${r.Precio} impo=${r.Impo}`));

    // Validation
    let ok = true;
    if (Number(insertedHeaderRes.recordset[0].Total) !== TOTAL) { console.error(`VAL FAIL: header.Total != ${TOTAL}`); ok = false; }
    if (Number(insertedHeaderRes.recordset[0].Deuda) !== TOTAL) { console.error(`VAL FAIL: header.Deuda != ${TOTAL}`); ok = false; }
    if (Number(insertedHeaderRes.recordset[0].Cant) !== TOTAL_CANT) { console.error(`VAL FAIL: header.Cant != ${TOTAL_CANT}`); ok = false; }
    if (insertedItemsRes.recordset.length !== ITEMS.length) { console.error(`VAL FAIL: items count ${insertedItemsRes.recordset.length} != ${ITEMS.length}`); ok = false; }
    for (const it of ITEMS) {
      const found = insertedItemsRes.recordset.find((r: { sku: string }) => r.sku === it.sku);
      if (!found) { console.error(`VAL FAIL: item ${it.sku} not found`); ok = false; continue; }
      if (Number(found.Cant) !== it.cant) { console.error(`VAL FAIL: item ${it.sku} cant ${found.Cant} != ${it.cant}`); ok = false; }
      if (Number(found.Impo) !== it.impo) { console.error(`VAL FAIL: item ${it.sku} impo ${found.Impo} != ${it.impo}`); ok = false; }
    }
    const saldoDelta = Number(afterSaldoRes.recordset[0].Saldo) - saldoBefore;
    if (saldoDelta !== TOTAL) { console.error(`VAL FAIL: saldo delta ${saldoDelta} != ${TOTAL}`); ok = false; }
    for (const it of ITEMS) {
      const before = stockMap.get(it.sku)?.stk ?? 0;
      const after = afterMap.get(it.sku) ?? 0;
      if (before - after !== it.cant) { console.error(`VAL FAIL: stock ${it.sku} delta ${before - after} != ${it.cant}`); ok = false; }
    }
    console.log(`\n=== VALIDATION: ${ok ? "PASS ✓" : "FAIL ✗"} ===`);

    if (DRY_RUN || !ok) {
      console.log(`\n${DRY_RUN ? "DRY RUN — rolling back" : "VALIDATION FAILED — rolling back"}`);
      await tx.rollback();
    } else {
      console.log(`\nCOMMITTING`);
      await tx.commit();
      console.log(`Boleta ${headerCod.trim()} added permanently.`);
    }
  } catch (e) {
    console.error("Error inside transaction:", e);
    await tx.rollback();
    throw e;
  }

  await pool.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
