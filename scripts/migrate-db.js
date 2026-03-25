const sql = require('mssql');

const REMOTE = { server: '201.177.151.2', port: 1433, user: 'sa', password: 'saleya*1024', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 30000, requestTimeout: 300000 };
const LOCAL = { server: 'localhost', port: 1434, user: 'sa', password: 'saleya*1024', options: { encrypt: false, trustServerCertificate: true }, connectionTimeout: 30000, requestTimeout: 300000 };

const DBS = [
  'C:\\PUNTOUCH\\BDCLIENTES.MDF',
  'C:\\PUNTOUCH\\BDCOMPRAS.MDF',
  'C:\\PUNTOUCH\\BDELEMENTOS.MDF',
  'C:\\PUNTOUCH\\BDELEMENUS.MDF',
  'C:\\PUNTOUCH\\BDEMPLEADOS.MDF',
  'C:\\PUNTOUCH\\BDPEDIDOS.MDF',
  'C:\\PUNTOUCH\\BDPRODUCTOS.MDF',
  'C:\\PUNTOUCH\\BDTRANSAS.MDF',
  'C:\\PUNTOUCH\\BDVARIOS.MDF',
];

function cleanName(mdf) {
  return mdf.split('\\').pop().replace('.MDF', '');
}

async function migrateTable(remote, local, remoteDb, localDb, tableName) {
  // Get column definitions
  const cols = await remote.request().query(`
    SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH, NUMERIC_PRECISION, NUMERIC_SCALE, IS_NULLABLE
    FROM [${remoteDb}].INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = '${tableName}'
    ORDER BY ORDINAL_POSITION
  `);

  // Build CREATE TABLE
  const colDefs = cols.recordset.map(c => {
    let type = c.DATA_TYPE;
    if (c.CHARACTER_MAXIMUM_LENGTH && c.CHARACTER_MAXIMUM_LENGTH > 0) {
      type += `(${c.CHARACTER_MAXIMUM_LENGTH})`;
    } else if (c.CHARACTER_MAXIMUM_LENGTH === -1) {
      type += '(MAX)';
    } else if (['decimal', 'numeric'].includes(c.DATA_TYPE)) {
      type += `(${c.NUMERIC_PRECISION}, ${c.NUMERIC_SCALE})`;
    }
    const nullable = c.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL';
    return `[${c.COLUMN_NAME}] ${type} ${nullable}`;
  });

  const createSql = `CREATE TABLE [${localDb}].dbo.[${tableName}] (${colDefs.join(', ')})`;

  try {
    await local.request().query(`DROP TABLE IF EXISTS [${localDb}].dbo.[${tableName}]`);
    await local.request().query(createSql);
  } catch (e) {
    console.error(`    Error creating table ${tableName}:`, e.message);
    return 0;
  }

  // Copy data in batches
  const countResult = await remote.request().query(`SELECT COUNT(*) AS cnt FROM [${remoteDb}].dbo.[${tableName}]`);
  const totalRows = countResult.recordset[0].cnt;

  if (totalRows === 0) {
    return 0;
  }

  const BATCH = 1000;
  let copied = 0;
  const colNames = cols.recordset.map(c => c.COLUMN_NAME);

  // Use bulk insert via SELECT INTO approach - read all and insert
  let offset = 0;
  while (offset < totalRows) {
    const rows = await remote.request().query(
      `SELECT * FROM [${remoteDb}].dbo.[${tableName}] ORDER BY (SELECT NULL) OFFSET ${offset} ROWS FETCH NEXT ${BATCH} ROWS ONLY`
    );

    if (rows.recordset.length === 0) break;

    // Build bulk insert
    const table = new sql.Table(`[${localDb}].dbo.[${tableName}]`);
    table.create = false;

    // Add columns to table definition
    for (const col of cols.recordset) {
      let type;
      switch (col.DATA_TYPE) {
        case 'char': type = sql.Char(col.CHARACTER_MAXIMUM_LENGTH || 1); break;
        case 'varchar': type = col.CHARACTER_MAXIMUM_LENGTH === -1 ? sql.VarChar(sql.MAX) : sql.VarChar(col.CHARACTER_MAXIMUM_LENGTH || 1); break;
        case 'nchar': type = sql.NChar(col.CHARACTER_MAXIMUM_LENGTH || 1); break;
        case 'nvarchar': type = col.CHARACTER_MAXIMUM_LENGTH === -1 ? sql.NVarChar(sql.MAX) : sql.NVarChar(col.CHARACTER_MAXIMUM_LENGTH || 1); break;
        case 'int': type = sql.Int; break;
        case 'bigint': type = sql.BigInt; break;
        case 'smallint': type = sql.SmallInt; break;
        case 'tinyint': type = sql.TinyInt; break;
        case 'bit': type = sql.Bit; break;
        case 'decimal': case 'numeric': type = sql.Decimal(col.NUMERIC_PRECISION, col.NUMERIC_SCALE); break;
        case 'float': type = sql.Float; break;
        case 'real': type = sql.Real; break;
        case 'money': type = sql.Money; break;
        case 'smallmoney': type = sql.SmallMoney; break;
        case 'datetime': type = sql.DateTime; break;
        case 'smalldatetime': type = sql.SmallDateTime; break;
        case 'date': type = sql.Date; break;
        case 'text': type = sql.Text; break;
        case 'ntext': type = sql.NText; break;
        case 'image': type = sql.Image; break;
        case 'binary': type = sql.Binary(col.CHARACTER_MAXIMUM_LENGTH || 1); break;
        case 'varbinary': type = col.CHARACTER_MAXIMUM_LENGTH === -1 ? sql.VarBinary(sql.MAX) : sql.VarBinary(col.CHARACTER_MAXIMUM_LENGTH || 1); break;
        case 'uniqueidentifier': type = sql.UniqueIdentifier; break;
        default: type = sql.VarChar(255); break;
      }
      table.columns.add(col.COLUMN_NAME, type, { nullable: col.IS_NULLABLE === 'YES' });
    }

    // Add rows
    for (const row of rows.recordset) {
      table.rows.add(...colNames.map(c => row[c]));
    }

    // Bulk insert
    const localReq = new sql.Request(local);
    await localReq.bulk(table);

    copied += rows.recordset.length;
    offset += BATCH;
  }

  return copied;
}

async function run() {
  const remote = await new sql.ConnectionPool(REMOTE).connect();
  const local = await new sql.ConnectionPool(LOCAL).connect();

  let totalTables = 0;
  let totalRows = 0;

  for (const db of DBS) {
    const localDb = cleanName(db);
    console.log(`\n=== ${localDb} ===`);

    const tables = await remote.request().query(
      `SELECT TABLE_NAME FROM [${db}].INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME`
    );

    for (const t of tables.recordset) {
      const name = t.TABLE_NAME;
      process.stdout.write(`  ${name}... `);
      try {
        const rows = await migrateTable(remote, local, db, localDb, name);
        console.log(`${rows} rows`);
        totalTables++;
        totalRows += rows;
      } catch (e) {
        console.error(`ERROR: ${e.message}`);
      }
    }
  }

  console.log(`\n=== DONE: ${totalTables} tables, ${totalRows} total rows ===`);
  await remote.close();
  await local.close();
}

run().catch(e => console.error('Fatal:', e.message));
