import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);

// Preparadores: employees who prepare reparto orders
// Configurable via settings, default Lorena (46) and Daiana (93)
async function getPreparadores() {
  const setting = await prisma.setting.findUnique({ where: { key: "preparadores_cods" } });
  const cods = setting?.value ? setting.value.split(",").map((s) => s.trim()) : ["46", "93"];

  const pool = await getPool();
  const dbEmp = getDbName("empleados");
  const list = cods.map((c, i) => `@cod${i}`).join(",");
  const req = pool.request();
  cods.forEach((c, i) => req.input(`cod${i}`, c));

  const result = await req.query(`
    SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre, LTRIM(RTRIM(ISNULL(Telefonos,''))) AS telefono
    FROM [${dbEmp}].dbo.Empleados WHERE LTRIM(RTRIM(Cod)) IN (${list})
  `);

  return result.recordset.map((r: { cod: string; nombre: string; telefono: string }) => ({
    cod: r.cod, nombre: r.nombre, telefono: r.telefono,
  }));
}

function toWaChatId(phone: string): string | null {
  let num = phone.replace(/\D/g, "");
  if (!num) return null;
  if (num.startsWith("0")) num = num.slice(1);
  if (num.startsWith("549")) { /* ok */ }
  else if (num.startsWith("54")) { num = "549" + num.slice(2); }
  else { num = "549" + num; }
  return `${num}@c.us`;
}

async function getDailyStats() {
  const pool = await getPool();
  const dbTransas = getDbName("transas");

  const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  const todayStr = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, "0")
    + String(now.getDate()).padStart(2, "0") + "000000";
  const fecha = `${now.getDate()}/${now.getMonth() + 1}`;

  // Count facturado pedidos for reparto (sucursal 7) today
  const result = await pool.request().input("desde", todayStr).query(`
    SELECT
      COUNT(DISTINCT t.Boleta) AS totalPedidos,
      COUNT(DISTINCT t.Cliente) AS totalClientes,
      SUM(t.Total) AS totalMonto
    FROM [${dbTransas}].dbo.Transas t
    WHERE t.Tipo = 'V'
      AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
      AND LTRIM(RTRIM(t.Sucursal)) = '7'
      AND t.Fechora >= @desde
      AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
  `);

  const stats = result.recordset[0] || { totalPedidos: 0, totalClientes: 0, totalMonto: 0 };

  // Also check delivery statuses marked today
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const deliveries = await prisma.deliveryStatus.count({
    where: { fecha: today, estado: "entregado" },
  });

  return {
    fecha,
    pedidos: Number(stats.totalPedidos),
    clientes: Number(stats.totalClientes),
    monto: Number(stats.totalMonto),
    entregados: deliveries,
  };
}

// GET: preview
export async function GET(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const preparadores = await getPreparadores();
    const stats = await getDailyStats();
    return NextResponse.json({ preparadores, stats });
  } catch (error) {
    console.error("Preparadores error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: send daily report
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const preparadores = await getPreparadores();
    const stats = await getDailyStats();

    if (stats.pedidos === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "No hay pedidos hoy" });
    }

    const fmt = (n: number) => "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
    let sent = 0;

    for (const prep of preparadores) {
      const chatId = toWaChatId(prep.telefono);
      if (!chatId) continue;

      const msg = `Rendimiento del dia ${stats.fecha}:\n\n` +
        `Pedidos preparados: ${stats.pedidos}\n` +
        `Clientes atendidos: ${stats.clientes}\n` +
        `Entregados: ${stats.entregados}\n` +
        `Total facturado: ${fmt(stats.monto)}`;

      try {
        await fetch("http://127.0.0.1:3099/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId, message: msg }),
        });
        sent++;
      } catch {}
      await new Promise((r) => setTimeout(r, 3000));
    }

    console.log(`[PREPARADORES] Sent to ${sent} preparadores. Pedidos: ${stats.pedidos}`);
    return NextResponse.json({ ok: true, sent, stats });
  } catch (error) {
    console.error("Preparadores error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
