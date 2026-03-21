import { getPool, getDbName } from "./mssql";
import { prisma } from "./prisma";
import type { Product, Category, Brand } from "@/types";

const db = () => getDbName("productos");

function parsePromocion(promoData: string): string | undefined {
  if (!promoData || !promoData.trim()) return undefined;
  // Active flag is the last character of Filler1 = "1"
  if (promoData.trimEnd().slice(-1) !== "1") return undefined;
  // Parse: spaces + qty + spaces + price (first promo only)
  const match = promoData.trimStart().match(/^(\d+)\s+([\d.,]+)/);
  if (!match) return undefined;
  const qty = parseInt(match[1]);
  const priceStr = match[2].replace(/\.(?=\d{3})/g, "").replace(",", ".");
  const price = parseFloat(priceStr);
  if (isNaN(qty) || isNaN(price) || qty < 1) return undefined;
  return `Lleva ${qty} x $${price.toLocaleString("es-AR", { minimumFractionDigits: 2 })}/UN`;
}

async function getHiddenCategoryIds(): Promise<string[]> {
  const hidden = await prisma.hiddenCategory.findMany();
  return hidden.map((h) => h.categoryId);
}

async function getSetting(key: string): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

// Price list mapping (from PuntoTouch POS):
// Stock.Precio  = Lista 1 = Minorista    → NOT used in web
// Stock.Precio2 = Lista 2 = Mayorista    → PUBLIC, visibility gate
// Stock.Precio3 = Lista 3 = Especial     → PRIVATE, login required
// Stock.Precio4 = Lista 4 = Caja Cerrada → PUBLIC, shown if Precio2 > 0
// Stock.Precio5 = Lista 5 = (PedidosYa)  → NOT used yet (future)

export async function getProducts(opts: {
  page?: number;
  limit?: number;
  categoryId?: string;
  brandId?: string;
  search?: string;
  includeEspecial?: boolean;
}): Promise<{ products: Product[]; total: number }> {
  const pool = await getPool();
  const {
    page = 1,
    limit = 24,
    categoryId,
    brandId,
    search,
    includeEspecial = false,
  } = opts;
  const offset = (page - 1) * limit;

  const especial = includeEspecial ? "s.Precio3 AS precioEspecial," : "";

  let where = `WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
    AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
    AND LTRIM(RTRIM(s.Deposito)) = '0'
    AND s.Precio2 > 0`;

  const params: Record<string, unknown> = {};

  const [hiddenIds, hideOutOfStock] = await Promise.all([
    getHiddenCategoryIds(),
    getSetting("hide_out_of_stock"),
  ]);

  if (hiddenIds.length > 0) {
    const placeholders = hiddenIds.map((_, i) => `@hidden${i}`).join(",");
    where += ` AND LTRIM(RTRIM(p.Rubro)) NOT IN (${placeholders})`;
    hiddenIds.forEach((id, i) => {
      params[`hidden${i}`] = id;
    });
  }

  if (hideOutOfStock === "true") {
    where += " AND s.Stk > 0";
  }

  if (categoryId) {
    where += " AND LTRIM(RTRIM(p.Rubro)) = @categoryId";
    params.categoryId = categoryId;
  }
  if (brandId) {
    where += " AND LTRIM(RTRIM(p.Marca)) = @brandId";
    params.brandId = brandId;
  }
  if (search) {
    where += " AND (p.Nombre LIKE @search OR LTRIM(RTRIM(p.Cod)) LIKE @search)";
    params.search = `%${search}%`;
  }

  const countQuery = `
    SELECT COUNT(*) AS total
    FROM [${db()}].dbo.Productos p
    JOIN [${db()}].dbo.Stock s ON s.CodProducto = p.Cod
    ${where}
  `;

  const dataQuery = `
    SELECT
      LTRIM(RTRIM(p.Cod)) AS sku,
      LTRIM(RTRIM(p.Nombre)) AS name,
      LTRIM(RTRIM(p.Rubro)) AS categoryId,
      LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS category,
      LTRIM(RTRIM(p.Marca)) AS brandId,
      LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS brand,
      LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
      LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unit,
      LTRIM(RTRIM(ISNULL(p.Palabra1, ''))) AS minimoCompra,
      LTRIM(RTRIM(ISNULL(p.Palabra2, ''))) AS pesoMayorista,
      LTRIM(RTRIM(ISNULL(p.Palabra3, ''))) AS cantidadPorCaja,
      s.Precio AS precioMinorista,
      s.Precio2 AS precioMayorista,
      s.Precio4 AS precioCajaCerrada,
      ${especial}
      s.Stk AS stock,
      LTRIM(RTRIM(ISNULL(p.Filler1, ''))) AS promoData,
      LTRIM(RTRIM(ISNULL(p.Filler2, ''))) AS promoActive
    FROM [${db()}].dbo.Productos p
    JOIN [${db()}].dbo.Stock s ON s.CodProducto = p.Cod
    LEFT JOIN [${db()}].dbo.Rubros r ON r.Cod = p.Rubro
    LEFT JOIN [${db()}].dbo.Marcas m ON m.Cod = p.Marca
    ${where}
    ORDER BY p.Nombre
    OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
  `;

  const countReq = pool.request();
  const dataReq = pool.request();

  for (const [key, val] of Object.entries(params)) {
    countReq.input(key, val);
    dataReq.input(key, val);
  }
  dataReq.input("offset", offset);
  dataReq.input("limit", limit);

  const [countResult, dataResult] = await Promise.all([
    countReq.query(countQuery),
    dataReq.query(dataQuery),
  ]);

  const total = countResult.recordset[0].total;
  const products: Product[] = dataResult.recordset.map((row) => ({
    sku: row.sku,
    name: row.name,
    categoryId: row.categoryId,
    category: row.category,
    brandId: row.brandId,
    brand: row.brand,
    barcode: row.barcode,
    unit: row.unit,
    minimoCompra: row.minimoCompra || "",
    pesoMayorista: parseFloat(row.pesoMayorista) || 0,
    cantidadPorCaja: parseFloat(row.cantidadPorCaja) || 0,
    precioMinorista: row.precioMinorista || 0,
    precioMayorista: row.precioMayorista || 0,
    precioCajaCerrada: row.precioCajaCerrada || 0,
    precioEspecial: includeEspecial ? row.precioEspecial || 0 : undefined,
    stock: row.stock || 0,
    promocion: parsePromocion(row.promoData),
    images: [],
    description: undefined,
  }));

  return { products, total };
}

export async function getProductBySku(
  sku: string,
  includeEspecial: boolean = false
): Promise<Product | null> {
  const pool = await getPool();
  const especial = includeEspecial ? "s.Precio3 AS precioEspecial," : "";

  const query = `
    SELECT
      LTRIM(RTRIM(p.Cod)) AS sku,
      LTRIM(RTRIM(p.Nombre)) AS name,
      LTRIM(RTRIM(p.Rubro)) AS categoryId,
      LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS category,
      LTRIM(RTRIM(p.Marca)) AS brandId,
      LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS brand,
      LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
      LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unit,
      LTRIM(RTRIM(ISNULL(p.Palabra1, ''))) AS minimoCompra,
      LTRIM(RTRIM(ISNULL(p.Palabra2, ''))) AS pesoMayorista,
      LTRIM(RTRIM(ISNULL(p.Palabra3, ''))) AS cantidadPorCaja,
      s.Precio AS precioMinorista,
      s.Precio2 AS precioMayorista,
      s.Precio4 AS precioCajaCerrada,
      ${especial}
      s.Stk AS stock,
      LTRIM(RTRIM(ISNULL(p.Filler1, ''))) AS promoData,
      LTRIM(RTRIM(ISNULL(p.Filler2, ''))) AS promoActive
    FROM [${db()}].dbo.Productos p
    JOIN [${db()}].dbo.Stock s ON s.CodProducto = p.Cod
    LEFT JOIN [${db()}].dbo.Rubros r ON r.Cod = p.Rubro
    LEFT JOIN [${db()}].dbo.Marcas m ON m.Cod = p.Marca
    WHERE LTRIM(RTRIM(p.Cod)) = @sku
      AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
      AND LTRIM(RTRIM(s.Deposito)) = '0'
      AND s.Precio2 > 0
  `;

  const result = await pool.request().input("sku", sku).query(query);

  if (result.recordset.length === 0) return null;

  const row = result.recordset[0];
  return {
    sku: row.sku,
    name: row.name,
    categoryId: row.categoryId,
    category: row.category,
    brandId: row.brandId,
    brand: row.brand,
    barcode: row.barcode,
    unit: row.unit,
    minimoCompra: row.minimoCompra || "",
    pesoMayorista: parseFloat(row.pesoMayorista) || 0,
    cantidadPorCaja: parseFloat(row.cantidadPorCaja) || 0,
    precioMinorista: row.precioMinorista || 0,
    precioMayorista: row.precioMayorista || 0,
    precioCajaCerrada: row.precioCajaCerrada || 0,
    precioEspecial: includeEspecial ? row.precioEspecial || 0 : undefined,
    stock: row.stock || 0,
    promocion: parsePromocion(row.promoData),
    images: [],
    description: undefined,
  };
}

export async function getCategories(includeHidden: boolean = false): Promise<Category[]> {
  const pool = await getPool();
  const hiddenIds = includeHidden ? [] : await getHiddenCategoryIds();

  let where = "(r.DeBaja = 0 OR r.DeBaja IS NULL)";
  const req = pool.request();

  if (hiddenIds.length > 0) {
    const placeholders = hiddenIds.map((_, i) => `@hidden${i}`).join(",");
    where += ` AND LTRIM(RTRIM(r.Cod)) NOT IN (${placeholders})`;
    hiddenIds.forEach((id, i) => {
      req.input(`hidden${i}`, id);
    });
  }

  // Check if there are active combos in PostgreSQL
  const activeComboCount = await prisma.combo.count({ where: { active: true } });

  const result = await req.query(`
    SELECT LTRIM(RTRIM(r.Cod)) AS id, LTRIM(RTRIM(r.[Desc])) AS name
    FROM [${db()}].dbo.Rubros r
    WHERE ${where}
      AND (
        EXISTS (
          SELECT 1 FROM [${db()}].dbo.Productos p
          JOIN [${db()}].dbo.Stock s ON s.CodProducto = p.Cod
          WHERE p.Rubro = r.Cod
            AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
            AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
            AND s.Precio2 > 0
        )
        ${activeComboCount > 0 ? "OR UPPER(LTRIM(RTRIM(r.[Desc]))) = 'COMBOS'" : ""}
      )
    ORDER BY r.[Desc]
  `);
  return result.recordset;
}

export async function getBrands(): Promise<Brand[]> {
  const pool = await getPool();
  const [hiddenIds, hideOutOfStock] = await Promise.all([
    getHiddenCategoryIds(),
    getSetting("hide_out_of_stock"),
  ]);

  let hiddenFilter = "";
  if (hiddenIds.length > 0) {
    const placeholders = hiddenIds.map((_, i) => `@hidden${i}`).join(",");
    hiddenFilter = `AND LTRIM(RTRIM(p.Rubro)) NOT IN (${placeholders})`;
  }

  const stockFilter = hideOutOfStock === "true" ? "AND s.Stk > 0" : "";

  const req = pool.request();
  hiddenIds.forEach((id, i) => req.input(`hidden${i}`, id));

  const result = await req.query(`
    SELECT LTRIM(RTRIM(m.Cod)) AS id, LTRIM(RTRIM(m.[Desc])) AS name
    FROM [${db()}].dbo.Marcas m
    WHERE (m.DeBaja = 0 OR m.DeBaja IS NULL)
      AND EXISTS (
        SELECT 1 FROM [${db()}].dbo.Productos p
        JOIN [${db()}].dbo.Stock s ON s.CodProducto = p.Cod
        WHERE p.Marca = m.Cod
          AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND (s.DeBaja = 0 OR s.DeBaja IS NULL)
          AND LTRIM(RTRIM(s.Deposito)) = '0'
          AND s.Precio2 > 0
          ${hiddenFilter}
          ${stockFilter}
      )
    ORDER BY m.[Desc]
  `);
  return result.recordset;
}
