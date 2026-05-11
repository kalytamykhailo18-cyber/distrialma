import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// 8 posts per day, each with a different strategy
// Cron calls this with ?slot=0..7
const SLOTS = [
  { hour: "08:00", strategy: "estrella", label: "Producto estrella (3ro mas vendido)" },
  { hour: "09:00", strategy: "rubro", label: "Oferta fiambres/lacteos", rubros: ["FIAMBRE", "LACTEO", "QUESO", "FIAMB"] },
  { hour: "11:00", strategy: "stock_alto", label: "Producto con mucho stock y poca venta" },
  { hour: "13:00", strategy: "rubro", label: "Oferta bebidas", rubros: ["BEBIDA", "GASEOSA", "AGUA", "JUGO", "CERVEZA"] },
  { hour: "15:00", strategy: "nuevo", label: "Producto nuevo/recien ingresado" },
  { hour: "17:00", strategy: "rubro", label: "Oferta limpieza/perfumeria", rubros: ["LIMPIEZA", "PERFUM", "HIGIENE"] },
  { hour: "19:00", strategy: "caja_cerrada", label: "Promo caja cerrada (mejor precio)" },
  { hour: "21:00", strategy: "random", label: "Producto destacado aleatorio" },
];

async function findProductBySKU(pool: ReturnType<typeof getPool> extends Promise<infer T> ? T : never, dbProd: string, dbTransas: string, strategy: string, rubros?: string[]): Promise<string | null> {
  const recentPosts = await prisma.socialPost.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000) } },
    select: { sku: true },
  });
  const recentSkus = new Set(recentPosts.map((p) => p.sku));

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const weekStr = weekAgo.getFullYear().toString() + String(weekAgo.getMonth() + 1).padStart(2, "0") + String(weekAgo.getDate()).padStart(2, "0") + "000000";

  let query = "";

  if (strategy === "estrella") {
    // 3rd best seller this week (skip top 2 which are likely cremoso/staples)
    query = `
      SELECT TOP 10 LTRIM(RTRIM(t.Producto)) AS sku, SUM(t.Impo) AS totalVenta
      FROM [${dbTransas}].dbo.Transas t
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = t.Producto
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
      WHERE t.Tipo = 'I' AND t.Cant > 0 AND t.Fechora >= '${weekStr}'
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        AND s.Precio2 > 0 AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      GROUP BY LTRIM(RTRIM(t.Producto))
      ORDER BY SUM(t.Impo) DESC
    `;
  } else if (strategy === "rubro" && rubros) {
    const rubroFilter = rubros.map((r) => `UPPER(LTRIM(RTRIM(ISNULL(r.[Desc],'')))) LIKE '%${r}%'`).join(" OR ");
    query = `
      SELECT TOP 20 LTRIM(RTRIM(p.Cod)) AS sku, s.Stk AS stock
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      WHERE LTRIM(RTRIM(s.Deposito)) = '0' AND s.Stk > 0 AND s.Precio2 > 0
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND (${rubroFilter})
      ORDER BY NEWID()
    `;
  } else if (strategy === "stock_alto") {
    query = `
      SELECT TOP 20 LTRIM(RTRIM(p.Cod)) AS sku, s.Stk AS stock,
        ISNULL((SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
          WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Cant > 0 AND t.Fechora >= '${weekStr}'), 0) AS vendido
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = '0' AND s.Stk > 10 AND s.Precio2 > 0
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      ORDER BY ISNULL((SELECT SUM(t.Cant) FROM [${dbTransas}].dbo.Transas t
        WHERE t.Producto = p.Cod AND t.Tipo = 'I' AND t.Cant > 0 AND t.Fechora >= '${weekStr}'), 0) ASC
    `;
  } else if (strategy === "nuevo") {
    // Recently added via stock entries
    const recentEntries = await prisma.stockEntryItem.findMany({
      where: { entry: { createdAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, estado: "costeado" } },
      select: { sku: true },
      orderBy: { id: "desc" },
      take: 30,
    });
    const newSkus = [...new Set(recentEntries.map((e) => e.sku))];
    for (const s of newSkus) {
      if (recentSkus.has(s)) continue;
      const img = await prisma.productImage.findFirst({ where: { sku: s } });
      if (img) return s;
    }
    return null;
  } else if (strategy === "caja_cerrada") {
    query = `
      SELECT TOP 20 LTRIM(RTRIM(p.Cod)) AS sku, s.Precio4 AS precioCC
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = '0' AND s.Stk > 0 AND s.Precio4 > 0 AND s.Precio2 > s.Precio4
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      ORDER BY NEWID()
    `;
  } else {
    // random
    query = `
      SELECT TOP 20 LTRIM(RTRIM(p.Cod)) AS sku
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = '0' AND s.Stk > 0 AND s.Precio2 > 0
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      ORDER BY NEWID()
    `;
  }

  if (!query) return null;

  const result = await pool.request().query(query);
  let skip = strategy === "estrella" ? 2 : 0; // Skip top 2 for estrella

  for (const row of result.recordset) {
    const sku = row.sku.trim();
    if (skip > 0) { skip--; continue; }
    if (recentSkus.has(sku)) continue;
    const img = await prisma.productImage.findFirst({ where: { sku } });
    if (img) return sku;
  }

  return null;
}

// POST: publish a scheduled slot
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const slotIdx = parseInt(new URL(req.url).searchParams.get("slot") || "0");
  const slot = SLOTS[slotIdx];
  if (!slot) return NextResponse.json({ error: "Slot invalido" }, { status: 400 });

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const dbTransas = getDbName("transas");

    const sku = await findProductBySKU(pool, dbProd, dbTransas, slot.strategy, slot.rubros);
    if (!sku) return NextResponse.json({ ok: true, skipped: true, reason: `No hay producto para ${slot.label}` });

    // Delegate to social-post API
    const baseUrl = "http://127.0.0.1:3000";
    const res = await fetch(`${baseUrl}/api/admin/social-post?secret=${CRON_SECRET}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sku, platforms: ["instagram", "facebook"] }),
    });
    const data = await res.json();

    console.log(`[SOCIAL-SCHEDULE] Slot ${slotIdx} (${slot.hour} ${slot.label}): SKU ${sku} → IG=${data.igPostId}, FB=${data.fbPostId}`);
    return NextResponse.json({ ok: true, slot: slotIdx, label: slot.label, sku, ...data });
  } catch (error) {
    console.error("Social schedule error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// GET: preview schedule
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  return NextResponse.json({ slots: SLOTS });
}
