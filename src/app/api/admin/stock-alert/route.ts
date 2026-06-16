import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

async function checkAuth(req: NextRequest): Promise<boolean> {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret === CRON_SECRET) return true;
  const session = await requireStaff();
  return !!session;
}

async function getSetting(key: string, defaultVal: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value || defaultVal;
}

interface StockAlert {
  sku: string;
  nombre: string;
  stock: number;
  ventaDiaria: number;
  diasRestantes: number;
  unidad: string;
}

async function getAlerts(coverageDays: number): Promise<StockAlert[]> {
  const pool = await getPool();
  const dbProd = getDbName("productos");
  const dbTransas = getDbName("transas");

  // Date 14 days ago in YYYYMMDD000000 format
  const now = new Date();
  const since = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const sinceStr = since.getFullYear().toString()
    + String(since.getMonth() + 1).padStart(2, "0")
    + String(since.getDate()).padStart(2, "0") + "000000";

  // Get all active products with stock and price
  const products = await pool.request().query(`
    SELECT
      LTRIM(RTRIM(p.Cod)) AS sku,
      LTRIM(RTRIM(p.Nombre)) AS nombre,
      LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad,
      s.Stk AS stock,
      s.Precio2 AS precioMayorista
    FROM [${dbProd}].dbo.Stock s
    JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
    WHERE LTRIM(RTRIM(s.Deposito)) = '0'
      AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
      AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
      AND s.Precio2 > 0
      AND s.Stk > 0
  `);

  if (products.recordset.length === 0) return [];

  // Get sales per product over last 14 days
  const sales = await pool.request().input("desde", sinceStr).query(`
    SELECT
      LTRIM(RTRIM(t.Producto)) AS sku,
      SUM(t.Cant) AS totalCant
    FROM [${dbTransas}].dbo.Transas t
    WHERE t.Tipo = 'I'
      AND t.Fechora >= @desde
      AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
      AND t.Cant > 0
    GROUP BY LTRIM(RTRIM(t.Producto))
  `);

  const salesMap = new Map<string, number>();
  for (const s of sales.recordset) {
    salesMap.set(s.sku, Number(s.totalCant));
  }

  const alerts: StockAlert[] = [];
  for (const p of products.recordset) {
    const totalSold = salesMap.get(p.sku) || 0;
    if (totalSold === 0) continue; // No sales = no urgency
    const ventaDiaria = totalSold / 14;
    const diasRestantes = Number(p.stock) / ventaDiaria;

    if (diasRestantes <= coverageDays) {
      alerts.push({
        sku: p.sku.trim(),
        nombre: p.nombre.trim(),
        stock: Number(p.stock),
        ventaDiaria: Math.round(ventaDiaria * 100) / 100,
        diasRestantes: Math.round(diasRestantes * 10) / 10,
        unidad: p.unidad.trim(),
      });
    }
  }

  alerts.sort((a, b) => a.diasRestantes - b.diasRestantes);
  return alerts;
}

// GET: preview alerts
export async function GET(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const coverageDays = parseFloat(await getSetting("stock_alert_days", "3"));
    const enabled = (await getSetting("stock_alert_enabled", "false")) === "true";
    const phone = await getSetting("stock_alert_phone", process.env.GASTON_PHONE || "5491122254949");

    const alerts = await getAlerts(coverageDays);

    return NextResponse.json({
      enabled,
      coverageDays,
      phone,
      total: alerts.length,
      alerts: alerts.slice(0, 100),
    });
  } catch (error) {
    console.error("Stock alert error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: send alert via WhatsApp
export async function POST(req: NextRequest) {
  if (!(await checkAuth(req))) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const enabled = (await getSetting("stock_alert_enabled", "false")) === "true";
    if (!enabled) {
      return NextResponse.json({ ok: true, skipped: true, reason: "deshabilitado" });
    }

    const coverageDays = parseFloat(await getSetting("stock_alert_days", "3"));
    const phone = await getSetting("stock_alert_phone", process.env.GASTON_PHONE || "5491122254949");

    const alerts = await getAlerts(coverageDays);
    if (alerts.length === 0) {
      return NextResponse.json({ ok: true, sent: false, reason: "No hay alertas" });
    }

    // Build message (top 20)
    const top = alerts.slice(0, 20);
    let msg = `Alerta de stock bajo (${alerts.length} productos con menos de ${coverageDays} dias):\n`;
    for (const a of top) {
      msg += `\n#${a.sku} ${a.nombre}\n  Stock: ${a.stock} ${a.unidad} — Venta: ${a.ventaDiaria}/${a.unidad.toLowerCase() === "kg" ? "kg" : "un"} por dia — ${a.diasRestantes} dias restantes`;
    }
    if (alerts.length > 20) {
      msg += `\n\n... y ${alerts.length - 20} productos mas.`;
    }

    // Support multiple phones separated by comma
    const phones = phone.split(",").map((p) => p.trim()).filter(Boolean);
    let sentCount = 0;
    const failed: string[] = [];
    for (const p of phones) {
      const chatId = p.replace(/\D/g, "") + "@c.us";
      try {
        const res = await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg }),
        });
        if (res.ok) sentCount++;
        else failed.push(p);
      } catch {
        failed.push(p);
      }
    }
    if (sentCount > 0) {
      console.log(`[STOCK-ALERT] Sent ${alerts.length} alerts to ${sentCount}/${phones.length} phones`);
      return NextResponse.json({ ok: true, sent: true, total: alerts.length, sentTo: sentCount, failed: failed.length ? failed : undefined });
    } else {
      return NextResponse.json({ ok: false, error: "Error enviando WhatsApp a todos los números" }, { status: 500 });
    }
  } catch (error) {
    console.error("Stock alert error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
