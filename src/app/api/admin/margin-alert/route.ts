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
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS marca,
        s.Costo AS costo, s.Precio AS precioMinorista, s.Precio2 AS precioMayorista,
        s.Precio3 AS precioEspecial, s.Precio4 AS precioCajaCerrada,
        s.Stk AS stock
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      LEFT JOIN [${dbProd}].dbo.Marcas ma ON ma.Cod = p.Marca
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      WHERE LTRIM(RTRIM(s.Deposito)) = '0'
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Costo > 0 AND s.Stk <> 0
        AND (
          (s.Precio > 0 AND (s.Precio - s.Costo) * 100.0 / NULLIF(s.Precio, 0) < @minMargen) OR
          (s.Precio2 > 0 AND (s.Precio2 - s.Costo) * 100.0 / NULLIF(s.Precio2, 0) < @minMargen) OR
          (s.Precio3 > 0 AND (s.Precio3 - s.Costo) * 100.0 / NULLIF(s.Precio3, 0) < @minMargen) OR
          (s.Precio4 > 0 AND (s.Precio4 - s.Costo) * 100.0 / NULLIF(s.Precio4, 0) < @minMargen)
        )
      ORDER BY CASE WHEN s.Precio2 > 0 THEN (s.Precio2 - s.Costo) * 1.0 / NULLIF(s.Precio2, 0) ELSE 0 END ASC
    `);

    const productos = result.recordset.map((r: { sku: string; nombre: string; marca: string; costo: number; precioMinorista: number; precioMayorista: number; precioEspecial: number; precioCajaCerrada: number; stock: number }) => {
      const costo = Number(r.costo);
      const listas: { nombre: string; precio: number; margen: number }[] = [];
      for (const [nombre, precio] of [["Minorista", Number(r.precioMinorista)], ["Mayorista", Number(r.precioMayorista)], ["Especial", Number(r.precioEspecial)], ["Caja Cerrada", Number(r.precioCajaCerrada)]] as [string, number][]) {
        if (precio > 0) listas.push({ nombre, precio, margen: Math.round((precio - costo) / precio * 1000) / 10 });
      }
      const worstMargen = Math.min(...listas.map((l) => l.margen));
      return { sku: r.sku, nombre: r.nombre, marca: r.marca, costo, stock: Number(r.stock), listas, margen: worstMargen };
    });

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

    // Check ALL price lists for negative margins
    const LISTAS = [
      { col: "Precio", name: "Minorista" },
      { col: "Precio2", name: "Mayorista" },
      { col: "Precio3", name: "Especial" },
      { col: "Precio4", name: "Caja Cerrada" },
    ];

    const result = await pool.request().query(`
      SELECT LTRIM(RTRIM(p.Cod)) AS sku, LTRIM(RTRIM(p.Nombre)) AS nombre, s.Costo,
        s.Precio, s.Precio2, s.Precio3, s.Precio4, s.Stk
      FROM [${dbProd}].dbo.Stock s
      JOIN [${dbProd}].dbo.Productos p ON p.Cod = s.CodProducto
      WHERE LTRIM(RTRIM(s.Deposito)) = '0'
        AND (s.TalleColor IS NULL OR LTRIM(RTRIM(s.TalleColor)) = '')
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND s.Costo > 0 AND s.Stk <> 0
        AND (
          (s.Precio > 0 AND s.Precio < s.Costo) OR
          (s.Precio2 > 0 AND s.Precio2 < s.Costo) OR
          (s.Precio3 > 0 AND s.Precio3 < s.Costo) OR
          (s.Precio4 > 0 AND s.Precio4 < s.Costo)
        )
      ORDER BY s.Costo - ISNULL(NULLIF(s.Precio2, 0), s.Costo) DESC
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ ok: true, alert: false, message: "No hay productos con margen negativo" });
    }

    // Build WhatsApp message with all lists that have negative margin
    const alerts: string[] = [];
    for (const p of result.recordset) {
      const costo = Number(p.Costo);
      let lines = `#${p.sku} ${p.nombre}\nCosto: $${costo.toLocaleString("es-AR")}`;
      for (const lista of LISTAS) {
        const precio = Number(p[lista.col]);
        if (precio > 0 && precio < costo) {
          lines += `\n  ${lista.name}: $${precio.toLocaleString("es-AR")} (pierde $${(costo - precio).toLocaleString("es-AR")})`;
        }
      }
      alerts.push(lines);
    }

    const msg = `Alerta: ${result.recordset.length} producto${result.recordset.length > 1 ? "s" : ""} con margen negativo:\n\n${alerts.join("\n\n")}\n`;

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
