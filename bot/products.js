// Product search using Distrialma SQL Server
import sql from "mssql";

let pool = null;

async function getPool() {
  if (pool && pool.connected) return pool;
  pool = await sql.connect({
    server: process.env.MSSQL_HOST,
    port: parseInt(process.env.MSSQL_PORT || "1433"),
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    options: { encrypt: false, trustServerCertificate: true },
    connectionTimeout: 15000,
    requestTimeout: 15000,
  });
  return pool;
}

const dbProd = () => process.env.MSSQL_DB_PRODUCTOS;
const dbClientes = () => process.env.MSSQL_DB_CLIENTES;

/**
 * Search products by name (full-text-ish, multiple words).
 * Returns up to `limit` matches with mayorista price, caja cerrada price, stock.
 * Only returns products with Precio2 > 0 (visible in store).
 */
export async function searchProducts(query, limit = 8) {
  const pool = await getPool();
  const words = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (words.length === 0) return [];

  const runQuery = async (wordList) => {
    const likeClauses = wordList.map((_, i) => `p.Nombre LIKE @w${i}`).join(" AND ");
    const request = pool.request();
    for (let i = 0; i < wordList.length; i++) {
      request.input(`w${i}`, `%${wordList[i]}%`);
    }
    const result = await request.query(`
      SELECT TOP ${limit}
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS name,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
        ISNULL(s.Precio2, 0) AS mayorista,
        ISNULL(s.Precio4, 0) AS cajaCerrada,
        ISNULL(s.Stk, 0) AS stock
      FROM [${dbProd()}].dbo.Productos p
      JOIN [${dbProd()}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
      LEFT JOIN [${dbProd()}].dbo.Marcas m ON m.Cod = p.Marca
      LEFT JOIN [${dbProd()}].dbo.Rubros r ON r.Cod = p.Rubro
      WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Precio2 > 0
        AND ${likeClauses}
      ORDER BY p.Nombre
    `);
    return result.recordset;
  };

  // Try all words first (AND)
  let rows = await runQuery(words);

  // If no results and >2 words, try dropping one word at a time
  if (rows.length === 0 && words.length > 2) {
    for (let skip = words.length - 1; skip >= 0; skip--) {
      const subset = words.filter((_, i) => i !== skip);
      rows = await runQuery(subset);
      if (rows.length > 0) break;
    }
  }

  // If still no results and >1 word, try each word individually and merge
  if (rows.length === 0 && words.length > 1) {
    const seen = new Set();
    for (const w of words) {
      const partial = await runQuery([w]);
      for (const r of partial) {
        if (!seen.has(r.sku)) { seen.add(r.sku); rows.push(r); }
        if (rows.length >= limit) break;
      }
      if (rows.length >= limit) break;
    }
  }

  return rows.map((p) => {
    const stock = Number(p.stock);
    const isPesable = / KG$/i.test(p.name) || /X\s*KG$/i.test(p.name);
    return {
      sku: p.sku,
      name: p.name,
      marca: p.marca,
      rubro: p.rubro,
      mayorista: Number(p.mayorista),
      cajaCerrada: Number(p.cajaCerrada),
      stock: isPesable ? `${stock.toFixed(1)} kg` : Math.floor(stock),
      disponible: stock > 0,
      url: `https://distrialma.com.ar/productos/${p.sku}`,
    };
  });
}

/**
 * Look up a client by phone number (cross-references against PunTouch Clientes).
 * Returns null if not found.
 */
export async function findClientByPhone(phoneNumber) {
  const pool = await getPool();
  // Strip non-digits
  const clean = phoneNumber.replace(/[^0-9]/g, "");
  // Try matching the last 8-10 digits (Argentine cellphones vary)
  const last10 = clean.slice(-10);
  const last8 = clean.slice(-8);

  try {
    const result = await pool.request()
      .input("p10", `%${last10}%`)
      .input("p8", `%${last8}%`)
      .query(`
        SELECT TOP 1
          LTRIM(RTRIM(Cod)) AS cod,
          LTRIM(RTRIM(Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(CUIT, ''))) AS cuit,
          ISNULL(Saldo, 0) AS saldo,
          LTRIM(RTRIM(ISNULL(TelClave1, ''))) AS tel1,
          LTRIM(RTRIM(ISNULL(Telclave3, ''))) AS tel3
        FROM [${dbClientes()}].dbo.Clientes
        WHERE (DeBaja = 0 OR DeBaja IS NULL)
          AND (TelClave1 LIKE @p10 OR Telclave3 LIKE @p10
            OR TelClave1 LIKE @p8 OR Telclave3 LIKE @p8)
      `);
    if (result.recordset.length === 0) return null;
    const c = result.recordset[0];
    return {
      cod: c.cod,
      nombre: c.nombre,
      cuit: c.cuit,
      saldo: Number(c.saldo),
    };
  } catch (e) {
    console.error("Error finding client:", e.message);
    return null;
  }
}

export function formatPrice(n) {
  return "$" + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}
