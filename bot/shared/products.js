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
// Common synonyms/abbreviations customers use
const SYNONYMS = {
  fetas: "feteado",
  feta: "feteado",
  muzza: "muzzarella",
  muza: "muzzarella",
  coca: "coca cola",
  sprite: "sprite",
  serenisima: "serenisima",
  yogu: "yogur",
  galletitas: "galletita",
  fideos: "fideo",
  papas: "papa",
  salchi: "salchich",
  morta: "mortadela",
  jamon: "jamon",
  cremoso: "cremoso",
};

export async function searchProducts(query, limit = 8) {
  const pool = await getPool();
  const words = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .map((w) => SYNONYMS[w] || w);

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
        SELECT TOP 5
          LTRIM(RTRIM(Cod)) AS cod,
          LTRIM(RTRIM(Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(CUIT, ''))) AS cuit,
          ISNULL(Saldo, 0) AS saldo,
          LTRIM(RTRIM(ISNULL(TelClave1, ''))) AS tel1,
          LTRIM(RTRIM(ISNULL(Telclave3, ''))) AS tel3
        FROM [${dbClientes()}].dbo.Clientes
        WHERE (DeBaja = 0 OR DeBaja IS NULL)
          AND (REPLACE(REPLACE(REPLACE(TelClave1, '-', ''), ' ', ''), '+', '') LIKE @p10
            OR REPLACE(REPLACE(REPLACE(Telclave3, '-', ''), ' ', ''), '+', '') LIKE @p10
            OR REPLACE(REPLACE(REPLACE(TelClave1, '-', ''), ' ', ''), '+', '') LIKE @p8
            OR REPLACE(REPLACE(REPLACE(Telclave3, '-', ''), ' ', ''), '+', '') LIKE @p8)
      `);
    if (result.recordset.length === 0) return null;
    // Return first account as main, but include all accounts
    const c = result.recordset[0];
    const accounts = result.recordset.map((r) => ({
      cod: r.cod,
      nombre: r.nombre,
      saldo: Number(r.saldo),
    }));
    return {
      cod: c.cod,
      nombre: c.nombre,
      cuit: c.cuit,
      saldo: Number(c.saldo),
      accounts: accounts.length > 1 ? accounts : undefined,
    };
  } catch (e) {
    console.error("Error finding client:", e.message);
    return null;
  }
}

/**
 * Search for a brand by name, return its code and web URL.
 * If productKeywords given, filter products of that brand.
 */
export async function searchByBrand(brandName, productKeywords = "", limit = 8) {
  const pool = await getPool();
  const cleanBrand = brandName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").trim();

  // Find the brand
  const brandResult = await pool.request()
    .input("b", `%${cleanBrand}%`)
    .query(`SELECT TOP 1 Cod, LTRIM(RTRIM([Desc])) AS nombre FROM [${dbProd()}].dbo.Marcas WHERE [Desc] LIKE @b`);

  if (brandResult.recordset.length === 0) return { brand: null, products: [] };

  const brand = brandResult.recordset[0];
  const brandCod = brand.Cod;

  // Get products of this brand
  const req = pool.request().input("marca", brandCod);
  let extraWhere = "";
  if (productKeywords) {
    const words = productKeywords.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length >= 2);
    words.forEach((w, i) => {
      req.input(`pw${i}`, `%${w}%`);
      extraWhere += ` AND p.Nombre LIKE @pw${i}`;
    });
  }

  const result = await req.query(`
    SELECT TOP ${limit}
      LTRIM(RTRIM(p.Cod)) AS sku,
      LTRIM(RTRIM(p.Nombre)) AS name,
      LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
      ISNULL(s.Precio2, 0) AS mayorista,
      ISNULL(s.Precio4, 0) AS cajaCerrada,
      ISNULL(s.Stk, 0) AS stock
    FROM [${dbProd()}].dbo.Productos p
    JOIN [${dbProd()}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
    LEFT JOIN [${dbProd()}].dbo.Rubros r ON r.Cod = p.Rubro
    WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
      AND s.Precio2 > 0
      AND p.Marca = @marca
      ${extraWhere}
    ORDER BY p.Nombre
  `);

  return {
    brand: {
      nombre: brand.nombre,
      cod: String(brandCod).trim(),
      url: `https://distrialma.com.ar/marca/${String(brandCod).trim()}`,
    },
    products: result.recordset.map(p => {
      const stock = Number(p.stock);
      const isPesable = / KG$/i.test(p.name) || /X\s*KG$/i.test(p.name);
      return {
        sku: p.sku,
        name: p.name,
        rubro: p.rubro,
        mayorista: Number(p.mayorista),
        cajaCerrada: Number(p.cajaCerrada),
        stock: isPesable ? `${stock.toFixed(1)} kg` : Math.floor(stock),
        disponible: stock > 0,
        url: `https://distrialma.com.ar/productos/${p.sku}`,
      };
    }),
  };
}

/**
 * Register a new client in PunTouch Clientes table.
 * Returns the new client code.
 */
export async function registerClient({ nombre, direccion, telefono, cuit }) {
  const pool = await getPool();
  // Get next Cod
  const maxResult = await pool.request().query(
    `SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod FROM [${dbClientes()}].dbo.Clientes`
  );
  const nextCod = (maxResult.recordset[0]?.maxCod || 0) + 1;
  const codPadded = String(nextCod).padStart(7, " ");

  // Today as YYYYMMDD
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const fechaAlta = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  // Clean phone: keep only digits
  const telClean = (telefono || "").replace(/[^0-9]/g, "").slice(-14).padEnd(14, " ");

  await pool.request()
    .input("cod", codPadded)
    .input("nombre", (nombre || "").toUpperCase().substring(0, 60))
    .input("calle", (direccion || "").toUpperCase().substring(0, 40))
    .input("tel", telClean)
    .input("cuit", (cuit || "").replace(/[^0-9]/g, "").substring(0, 14))
    .input("fecha", fechaAlta)
    .query(`
      INSERT INTO [${dbClientes()}].dbo.Clientes
        (Cod, Nombre, Calle, Nume, PisoDto, Entre1, Entre2, Localidad, Zona, CodPostal,
         TelClave1, TelClave2, Telclave3, Observaciones, Email, FechaAlta, FechaUlt, FechaBaja,
         DeBaja, MotivoBaja, TransaUlt, Saldo, IVA, CUIT, Cumple, Descuento, ListaPrecios,
         Puntaje, TotalCompras, TotalVeces, Vendedor,
         FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
         Filler1, Filler2, Filler3, Filler4,
         FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
      VALUES
        (@cod, @nombre, @calle, '', '', '', '', '    ', '    ', '',
         @tel, '              ', '              ', 'ALMA2026', '', @fecha, @fecha, '        ',
         0, '', '         ', 0, ' ', @cuit, '    ', 0, '2',
         0, 0, 0, '       ',
         0, 0, 0, 0, 0,
         '', '', '', '',
         0, 0, 0, 0, 0)
    `);

  return { cod: String(nextCod), nombre: (nombre || "").toUpperCase() };
}

/**
 * Search combos by name.
 */
export async function searchCombos(query) {
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    const combos = await prisma.combo.findMany({
      where: {
        active: true,
        name: { contains: query, mode: "insensitive" },
      },
      include: { items: true },
    });
    await prisma.$disconnect();

    if (combos.length === 0) {
      // Try broader search — get all active combos
      const prisma2 = new PrismaClient();
      const all = await prisma2.combo.findMany({
        where: { active: true },
        include: { items: true },
      });
      await prisma2.$disconnect();
      return all;
    }
    return combos;
  } catch (e) {
    console.error("Error searching combos:", e.message);
    return [];
  }
}

export function formatPrice(n) {
  return "$" + Number(n).toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

/**
 * Generate a price list PDF (no images, lightweight).
 * Returns the file path to the generated PDF.
 */
export async function generatePriceListPDF(rubro = null) {
  const pool = await getPool();

  let where = `WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
    AND LTRIM(RTRIM(s.Deposito)) = '0'
    AND s.Precio2 > 0
    AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')`;

  if (rubro) {
    where += ` AND (LTRIM(RTRIM(r.[Desc])) LIKE '%${rubro.replace(/'/g, "''")}%' OR LTRIM(RTRIM(m.[Desc])) LIKE '%${rubro.replace(/'/g, "''")}%')`;
  }

  const result = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(p.Nombre)) AS nombre,
      LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
      LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
      LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unidad,
      s.Precio2 AS mayorista,
      s.Precio4 AS cajaCerrada
    FROM [${dbProd()}].dbo.Productos p
    JOIN [${dbProd()}].dbo.Stock s ON s.CodProducto = p.Cod
    LEFT JOIN [${dbProd()}].dbo.Rubros r ON r.Cod = p.Rubro
    LEFT JOIN [${dbProd()}].dbo.Marcas m ON m.Cod = p.Marca
    ${where}
    ORDER BY LTRIM(RTRIM(ISNULL(r.[Desc], ''))), LTRIM(RTRIM(p.Nombre))
  `);

  let products = result.recordset;
  if (products.length === 0) return null;
  // Safety: cap at 500 products max to avoid huge PDFs that crash WhatsApp
  if (products.length > 500) products = products.slice(0, 500);

  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const w = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  let y = 15;
  const fecha = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

  // Header
  doc.setFillColor(251, 154, 71);
  doc.rect(0, 0, w, 20, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text("Distrialma — Lista de Precios", 14, 13);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text(`${fecha} — ${products.length} productos — Precios sujetos a cambio sin previo aviso`, w - 14, 13, { align: "right" });
  y = 25;

  // Table header
  const drawHeader = () => {
    doc.setFillColor(55, 65, 81);
    doc.rect(10, y, w - 20, 7, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    doc.text("Producto", 14, y + 5);
    doc.text("Marca", 100, y + 5);
    doc.text("Mayorista", 145, y + 5, { align: "right" });
    doc.text("Caja Cerr.", w - 14, y + 5, { align: "right" });
    y += 12;
    doc.setTextColor(50, 50, 50);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
  };
  drawHeader();

  let lastRubro = "";
  for (const p of products) {
    if (y > pageH - 15) { doc.addPage(); y = 15; drawHeader(); }

    // Rubro separator
    if (p.rubro && p.rubro !== lastRubro) {
      lastRubro = p.rubro;
      if (y > pageH - 20) { doc.addPage(); y = 15; drawHeader(); }
      doc.setFillColor(245, 245, 245);
      doc.rect(10, y - 2, w - 20, 6, "F");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(100, 100, 100);
      doc.text(p.rubro, 14, y + 2);
      y += 7;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(50, 50, 50);
    }

    doc.text(p.nombre.substring(0, 50), 14, y);
    doc.text((p.marca || "").substring(0, 20), 100, y);
    doc.setFont("helvetica", "bold");
    doc.text(formatPrice(p.mayorista), 145, y, { align: "right" });
    if (p.cajaCerrada > 0) {
      doc.text(formatPrice(p.cajaCerrada), w - 14, y, { align: "right" });
    }
    doc.setFont("helvetica", "normal");
    doc.setDrawColor(240, 240, 240);
    doc.line(10, y + 1.5, w - 10, y + 1.5);
    y += 4.5;
  }

  // Footer on all pages
  const pc = doc.getNumberOfPages();
  for (let pg = 1; pg <= pc; pg++) {
    doc.setPage(pg);
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(6);
    doc.text(`Pagina ${pg}/${pc} — distrialma.com.ar — Precios al ${fecha}`, w / 2, pageH - 6, { align: "center" });
  }

  const dir = "./session/listas";
  const fs = await import("fs");
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const filename = `${dir}/lista-precios-${fecha.replace(/\//g, "-")}.pdf`;
  const buffer = Buffer.from(doc.output("arraybuffer"));
  fs.writeFileSync(filename, buffer);
  return filename;
}
