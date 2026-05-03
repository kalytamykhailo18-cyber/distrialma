import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
}

// GET: preview
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const data = await getDailyData();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Vendedor resumen error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: send email
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const data = await getDailyData();
    if (data.clientes.length === 0 && data.pedidos.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "Sin actividad hoy" });
    }

    // Get recipients: Gaston + any admin with email
    const gastonEmail = "despensaalma2020@gmail.com";

    // Build email HTML
    const fecha = new Date().toLocaleDateString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
    let html = `<h2>Resumen del vendedor — ${fecha}</h2>`;

    // Clients section
    if (data.clientes.length > 0) {
      html += `<h3>Clientes dados de alta (${data.clientes.length})</h3>`;
      for (const c of data.clientes) {
        html += `<div style="border:1px solid #ddd;border-radius:8px;padding:12px;margin-bottom:12px">`;
        html += `<strong>${c.nombre}</strong><br>`;
        if (c.direccion) html += `Direccion: ${c.direccion}<br>`;
        if (c.telefono) html += `Telefono: ${c.telefono}<br>`;
        if (c.whatsapp) html += `WhatsApp: ${c.whatsapp}<br>`;
        if (c.cuit) html += `CUIT: ${c.cuit}<br>`;
        if (c.registradoPor) html += `<span style="color:#888">Registrado por: ${c.registradoPor}</span><br>`;
        if (c.fotoLocal) html += `<br><img src="${c.fotoLocal}" style="max-width:300px;border-radius:8px" alt="Frente del local"><br>`;
        if (c.fotoCuit) html += `<img src="${c.fotoCuit}" style="max-width:300px;border-radius:8px" alt="Constancia CUIT"><br>`;
        if (c.lat && c.lng) html += `<a href="https://maps.google.com/?q=${c.lat},${c.lng}">Ver ubicacion</a><br>`;
        html += `</div>`;
      }
    }

    // Orders section
    if (data.pedidos.length > 0) {
      html += `<h3>Pedidos levantados (${data.pedidos.length})</h3>`;
      html += `<table style="border-collapse:collapse;width:100%;font-size:13px">`;
      html += `<tr style="background:#f5f5f5"><th style="text-align:left;padding:6px">Cliente</th><th style="text-align:left;padding:6px">Vendedor</th><th style="text-align:right;padding:6px">Items</th><th style="text-align:right;padding:6px">Total</th><th style="text-align:right;padding:6px">Comision</th></tr>`;
      for (const p of data.pedidos) {
        html += `<tr><td style="padding:6px;border-top:1px solid #eee">${p.clienteName}</td><td style="padding:6px;border-top:1px solid #eee">${p.vendedorName}</td><td style="text-align:right;padding:6px;border-top:1px solid #eee">${p.itemCount}</td><td style="text-align:right;padding:6px;border-top:1px solid #eee">${formatPrice(p.total)}</td><td style="text-align:right;padding:6px;border-top:1px solid #eee">${formatPrice(p.comision)}</td></tr>`;
      }
      const totalVenta = data.pedidos.reduce((s, p) => s + p.total, 0);
      const totalComision = data.pedidos.reduce((s, p) => s + p.comision, 0);
      html += `<tr style="font-weight:bold;border-top:2px solid #333"><td colspan="3" style="padding:6px">TOTAL</td><td style="text-align:right;padding:6px">${formatPrice(totalVenta)}</td><td style="text-align:right;padding:6px">${formatPrice(totalComision)}</td></tr>`;
      html += `</table>`;
    }

    // Send email
    const resend = new Resend(process.env.RESEND_API_KEY || "");
    await resend.emails.send({
      from: process.env.RESEND_FROM || "Administracion <no-responder@alertrasadmin.com>",
      to: gastonEmail,
      subject: `Vendedor — ${fecha} — ${data.clientes.length} altas, ${data.pedidos.length} pedidos`,
      html,
    });

    console.log(`[VENDEDOR-RESUMEN] Sent: ${data.clientes.length} clientes, ${data.pedidos.length} pedidos`);
    return NextResponse.json({ ok: true, clientes: data.clientes.length, pedidos: data.pedidos.length });
  } catch (error) {
    console.error("Vendedor resumen error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

async function getDailyData() {
  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

  // New clients registered today
  const registros = await prisma.clienteRegistro.findMany({
    where: { createdAt: { gte: todayStart, lt: todayEnd } },
    orderBy: { createdAt: "desc" },
  });

  const clientes = registros.map((r) => ({
    clienteCod: r.clienteCod.trim(),
    nombre: r.clienteCod.trim(), // Will be enriched below
    direccion: "",
    telefono: "",
    whatsapp: r.whatsapp,
    cuit: "",
    fotoLocal: r.fotoLocal,
    fotoCuit: r.fotoCuit,
    lat: r.lat,
    lng: r.lng,
    registradoPor: r.registradoPor,
  }));

  // Enrich with PunTouch data
  if (clientes.length > 0) {
    try {
      const { getPool, getDbName } = await import("@/lib/mssql");
      const pool = await getPool();
      const dbCli = getDbName("clientes");
      for (const c of clientes) {
        const r = await pool.request().input("cod", c.clienteCod.padStart(7, " ")).query(
          `SELECT LTRIM(RTRIM(Nombre)) AS nombre, LTRIM(RTRIM(ISNULL(Calle,''))) AS calle, LTRIM(RTRIM(ISNULL(TelClave1,''))) AS tel, LTRIM(RTRIM(ISNULL(CUIT,''))) AS cuit FROM [${dbCli}].dbo.Clientes WHERE Cod = @cod`
        );
        if (r.recordset[0]) {
          c.nombre = r.recordset[0].nombre;
          c.direccion = r.recordset[0].calle;
          c.telefono = r.recordset[0].tel;
          c.cuit = r.recordset[0].cuit;
        }
      }
    } catch {}
  }

  // Vendedor orders today
  const pedidos = await prisma.vendedorOrder.findMany({
    where: { createdAt: { gte: todayStart, lt: todayEnd } },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });

  return {
    fecha: `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear()}`,
    clientes,
    pedidos: pedidos.map((p) => ({
      clienteName: p.clienteName,
      vendedorName: p.vendedorName,
      total: Number(p.total),
      comision: Number(p.comisionTotal),
      itemCount: p.items.length,
    })),
  };
}
