import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// GET: preview low margin products (staff or cron)
// POST: send WhatsApp alert to Gaston (cron only)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const isCron = secret === CRON_SECRET;
  if (!isCron && !(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const minMargen = parseFloat(searchParams.get("minMargen") || "5");

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    const result = await pool.request().input("minMargen", minMargen).query(`
      SELECT LTRIM(RTRIM(p.Cod)) AS sku, LTRIM(RTRIM(p.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        s.Costo AS costo, s.Precio2 AS precioMayorista, s.Precio AS precioMinorista,
        s.Stk AS stock,
        ROUND((s.Precio2 - s.Costo) * 100.0 / NULLIF(s.Precio2, 0), 1) AS margen
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      LEFT JOIN [${dbProd}].dbo.Marcas ma ON ma.Cod = p.Marca
      LEFT JOIN [${dbProd}].dbo.Rubros m ON m.Cod = p.Rubro
      WHERE LTRIM(RTRIM(s.Deposito)) = '0'
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Costo > 0 AND s.Precio2 > 0 AND s.Stk > 0
        AND (s.Precio2 - s.Costo) * 100.0 / s.Precio2 < @minMargen
      ORDER BY (s.Precio2 - s.Costo) * 1.0 / s.Precio2 ASC
    `);

    const productos = result.recordset.map((r: { sku: string; nombre: string; marca: string; costo: number; precioMayorista: number; precioMinorista: number; stock: number; margen: number }) => ({
      sku: r.sku,
      nombre: r.nombre,
      marca: r.marca,
      costo: Number(r.costo),
      precioMayorista: Number(r.precioMayorista),
      precioMinorista: Number(r.precioMinorista),
      stock: Number(r.stock),
      margen: Number(r.margen),
    }));

    const negativos = productos.filter((p) => p.margen < 0);
    const bajos = productos.filter((p) => p.margen >= 0);

    return NextResponse.json({ productos, negativos: negativos.length, bajos: bajos.length, total: productos.length });
  } catch (error) {
    console.error("Margin alert error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let secret = searchParams.get("secret");
  if (!secret) {
    try { const body = await req.json(); secret = body.secret; } catch { /* */ }
  }
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Only alert on negative margins (selling below cost) with stock
    const result = await pool.request().query(`
      SELECT LTRIM(RTRIM(p.Nombre)) AS nombre,
        s.Costo AS costo, s.Precio2 AS precio, s.Stk AS stock,
        ROUND((s.Precio2 - s.Costo) * 100.0 / NULLIF(s.Precio2, 0), 1) AS margen
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = '0'
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Costo > 0 AND s.Precio2 > 0 AND s.Stk > 0
        AND s.Precio2 < s.Costo
      ORDER BY (s.Precio2 - s.Costo) ASC
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ ok: true, alert: false, message: "No hay productos con margen negativo" });
    }

    // Build WhatsApp message
    let msg = `Alerta: ${result.recordset.length} producto${result.recordset.length > 1 ? "s" : ""} con margen negativo (vendiendo por debajo del costo):\n`;
    for (const p of result.recordset) {
      const costo = Number(p.costo);
      const precio = Number(p.precio);
      const perdida = costo - precio;
      msg += `\n${p.nombre}\nCosto: $${costo.toLocaleString("es-AR")} → Precio: $${precio.toLocaleString("es-AR")} (pierde $${perdida.toLocaleString("es-AR")} por unidad)\n`;
    }

    // Send to Gaston's number
    const gastonChat = "5491122254949@c.us";
    try {
      await fetch("http://127.0.0.1:3099/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: gastonChat, message: msg }),
      });
    } catch { /* bot might be down */ }

    console.log(`[MARGIN-ALERT] ${result.recordset.length} products with negative margin`);
    return NextResponse.json({ ok: true, alert: true, count: result.recordset.length });
  } catch (error) {
    console.error("Margin alert error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
