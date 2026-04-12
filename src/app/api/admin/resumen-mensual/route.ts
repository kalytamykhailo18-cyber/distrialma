import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Authenticate via cron secret or staff session
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");
  const cronSecret = process.env.CRON_SECRET || process.env.RESEND_API_KEY?.slice(0, 16);
  if (secret !== cronSecret) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");

    // Previous month
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    let year = now.getFullYear();
    let month = now.getMonth(); // 0-indexed, so this IS last month
    if (month === 0) { month = 12; year--; }
    const mesLabel = `${year}-${String(month).padStart(2, "0")}`;
    const desde = `${year}${String(month).padStart(2, "0")}01000000`;
    let hastaYear = year;
    let hastaMonth = month + 1;
    if (hastaMonth > 12) { hastaMonth = 1; hastaYear++; }
    const hasta = `${hastaYear}${String(hastaMonth).padStart(2, "0")}01000000`;

    const meses = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

    // Totals
    const totals = await pool.request().input("desde", desde).input("hasta", hasta).query(`
      SELECT
        COUNT(DISTINCT CASE WHEN t.Tipo = 'V' THEN t.Boleta END) AS cantVentas,
        SUM(CASE WHEN t.Tipo = 'I' THEN t.Impo ELSE 0 END) AS totalVenta,
        SUM(CASE WHEN t.Tipo = 'I' THEN t.Costo ELSE 0 END) AS totalCosto
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Fechora >= @desde AND t.Fechora < @hasta
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        AND t.Cant > 0
    `);

    const t = totals.recordset[0] || {};
    const ventas = Number(t.cantVentas) || 0;
    const totalVenta = Number(t.totalVenta) || 0;
    const totalCosto = Number(t.totalCosto) || 0;
    const ganancia = totalVenta - totalCosto;
    const margen = totalVenta > 0 ? ((ganancia / totalVenta) * 100).toFixed(1) : "0";

    // Per sucursal
    const porSuc = await pool.request().input("desde", desde).input("hasta", hasta).query(`
      SELECT
        LTRIM(RTRIM(t.Sucursal)) AS sucursal,
        COUNT(DISTINCT CASE WHEN t.Tipo = 'V' THEN t.Boleta END) AS cantVentas,
        SUM(CASE WHEN t.Tipo = 'I' THEN t.Impo ELSE 0 END) AS totalVenta
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Fechora >= @desde AND t.Fechora < @hasta
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        AND t.Cant > 0
      GROUP BY LTRIM(RTRIM(t.Sucursal))
      ORDER BY SUM(CASE WHEN t.Tipo = 'I' THEN t.Impo ELSE 0 END) DESC
    `);

    const SUC_NAMES: Record<string, string> = { "1": "Minorista 435", "2": "Mayorista 387", "6": "May. Pontevedra", "7": "Distribuidora" };

    // Top 10 products
    const topProd = await pool.request().input("desde", desde).input("hasta", hasta).query(`
      SELECT TOP 10
        LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
        SUM(t.Impo) AS totalVenta,
        SUM(t.Impo - t.Costo) AS ganancia
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
      WHERE t.Tipo = 'I' AND t.Fechora >= @desde AND t.Fechora < @hasta
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        AND t.Cant > 0
      GROUP BY LTRIM(RTRIM(ISNULL(pr.Nombre, '')))
      ORDER BY SUM(t.Impo) DESC
    `);

    // Top 10 clients
    const topCli = await pool.request().input("desde", desde).input("hasta", hasta).query(`
      SELECT TOP 10
        LTRIM(RTRIM(t.Nombre)) AS nombre,
        SUM(t.Impo) AS totalVenta,
        COUNT(DISTINCT t.Boleta) AS cantCompras
      FROM [${dbTransas}].dbo.Transas t
      WHERE t.Tipo = 'V' AND LTRIM(RTRIM(t.Itm)) = '0'
        AND t.Fechora >= @desde AND t.Fechora < @hasta
        AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
        AND LTRIM(RTRIM(t.Cliente)) <> ''
      GROUP BY LTRIM(RTRIM(t.Nombre))
      ORDER BY SUM(t.Impo) DESC
    `);

    const f = (n: number) => "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });

    // Build email HTML
    const sucHtml = porSuc.recordset.map((s: { sucursal: string; cantVentas: number; totalVenta: number }) =>
      `<tr><td>${SUC_NAMES[s.sucursal] || `Suc ${s.sucursal}`}</td><td style="text-align:right">${s.cantVentas}</td><td style="text-align:right">${f(Number(s.totalVenta))}</td></tr>`
    ).join("");

    const prodHtml = topProd.recordset.map((p: { nombre: string; totalVenta: number; ganancia: number }, i: number) =>
      `<tr><td>${i + 1}. ${p.nombre}</td><td style="text-align:right">${f(Number(p.totalVenta))}</td><td style="text-align:right">${f(Number(p.ganancia))}</td></tr>`
    ).join("");

    const cliHtml = topCli.recordset.map((c: { nombre: string; totalVenta: number; cantCompras: number }, i: number) =>
      `<tr><td>${i + 1}. ${c.nombre}</td><td style="text-align:right">${f(Number(c.totalVenta))}</td><td style="text-align:right">${c.cantCompras}</td></tr>`
    ).join("");

    const html = `
      <h2>Resumen Mensual — ${meses[month]} ${year}</h2>
      <table style="border-collapse:collapse;width:100%;max-width:500px;margin-bottom:20px">
        <tr><td>Total ventas:</td><td style="text-align:right"><strong>${ventas.toLocaleString("es-AR")}</strong></td></tr>
        <tr><td>Facturado:</td><td style="text-align:right"><strong>${f(totalVenta)}</strong></td></tr>
        <tr><td>Ganancia:</td><td style="text-align:right;color:#16a34a"><strong>${f(ganancia)}</strong></td></tr>
        <tr><td>Margen:</td><td style="text-align:right"><strong>${margen}%</strong></td></tr>
      </table>

      <h3>Por Sucursal</h3>
      <table style="border-collapse:collapse;width:100%;max-width:500px;margin-bottom:20px">
        <tr style="background:#f3f4f6"><th style="text-align:left;padding:4px">Sucursal</th><th style="text-align:right;padding:4px">Ventas</th><th style="text-align:right;padding:4px">Facturado</th></tr>
        ${sucHtml}
      </table>

      <h3>Top 10 Productos</h3>
      <table style="border-collapse:collapse;width:100%;max-width:500px;margin-bottom:20px">
        <tr style="background:#f3f4f6"><th style="text-align:left;padding:4px">Producto</th><th style="text-align:right;padding:4px">Venta</th><th style="text-align:right;padding:4px">Ganancia</th></tr>
        ${prodHtml}
      </table>

      <h3>Top 10 Clientes</h3>
      <table style="border-collapse:collapse;width:100%;max-width:500px;margin-bottom:20px">
        <tr style="background:#f3f4f6"><th style="text-align:left;padding:4px">Cliente</th><th style="text-align:right;padding:4px">Total</th><th style="text-align:right;padding:4px">Compras</th></tr>
        ${cliHtml}
      </table>

      <p>Ver detalle completo en <a href="https://distrialma.com.ar/admin/resumen-productos">distrialma.com.ar/admin/resumen-productos</a></p>
      <hr>
      <p style="color:#999;font-size:12px">Generado automaticamente por distrialma.com.ar</p>
    `;

    // Send email
    const resendKey = process.env.RESEND_API_KEY || "";
    const emailTo = (await prisma.setting.findUnique({ where: { key: "cierre_email" } }))?.value || "";

    if (resendKey && emailTo) {
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: process.env.RESEND_FROM || "Distrialma <onboarding@resend.dev>",
        to: emailTo,
        subject: `Resumen Mensual — ${meses[month]} ${year} — Distrialma`,
        html,
      });
      console.log(`Monthly summary sent to ${emailTo} for ${mesLabel}`);
    }

    return NextResponse.json({ ok: true, mes: mesLabel, ventas, totalVenta, ganancia, emailTo });
  } catch (error) {
    console.error("Error resumen mensual:", error);
    return NextResponse.json({ error: "Error al generar resumen" }, { status: 500 });
  }
}
