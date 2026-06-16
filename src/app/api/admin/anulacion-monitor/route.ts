import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || (process.env.RESEND_API_KEY || "").substring(0, 16);
const SUC_NAMES: Record<string, string> = {
  "1": "Minorista",
  "2": "Mayorista",
  "6": "Pontevedra",
  "7": "Distribuidora",
  "10": "Reventas",
  "11": "PedidosYa Local1",
};

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getSetting(key: string, def: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value || def;
}

export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get("secret");
  if (secret !== CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Use anulacion_monitor_phones if set, otherwise fall back to stock_alert_phone
    let phoneSetting = await getSetting("anulacion_monitor_phones", "");
    if (!phoneSetting) {
      phoneSetting = await getSetting("stock_alert_phone", process.env.GASTON_PHONE || "5491122254949");
    }
    const phones = phoneSetting.split(",").map((p) => p.trim()).filter(Boolean);
    if (phones.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no phones configured" });
    }

    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbPedidos = getDbName("pedidos");
    const dbProductos = getDbName("productos");

    // Find boletas anulated today that we haven't notified yet
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fechaStr =
      now.getFullYear().toString() +
      String(now.getMonth() + 1).padStart(2, "0") +
      String(now.getDate()).padStart(2, "0");
    const desde = `${fechaStr}000000`;
    const hasta = `${fechaStr}235959`;

    const ventas = await pool
      .request()
      .input("desde", desde)
      .input("hasta", hasta)
      .query(`
        SELECT
          LTRIM(RTRIM(t.Boleta)) AS boleta,
          LTRIM(RTRIM(t.Sucursal)) AS sucursal,
          LTRIM(RTRIM(ISNULL(t.Nombre,''))) AS cliente,
          ISNULL(t.Total, 0) AS total,
          LTRIM(RTRIM(t.Fechora)) AS fechora,
          LTRIM(RTRIM(ISNULL(t.Usuario, ''))) AS usuario
        FROM [${dbTransas}].dbo.Transas t
        WHERE t.Tipo = 'V'
          AND (LTRIM(RTRIM(t.Itm)) = '0' OR LTRIM(RTRIM(t.Itm)) = '')
          AND t.Fechora BETWEEN @desde AND @hasta
          AND t.Anulado IS NOT NULL AND LTRIM(RTRIM(t.Anulado)) != '' AND t.Anulado != ' '
        ORDER BY t.Fechora ASC
      `);

    const pendientes = await pool
      .request()
      .input("desde", desde)
      .input("hasta", hasta)
      .query(`
        SELECT
          LTRIM(RTRIM(p.Boleta)) AS boleta,
          LTRIM(RTRIM(p.Sucursal)) AS sucursal,
          LTRIM(RTRIM(ISNULL(p.Nombre,''))) AS cliente,
          ISNULL(p.Total, 0) AS total,
          LTRIM(RTRIM(p.Fechora)) AS fechora,
          LTRIM(RTRIM(ISNULL(p.Usuario, ''))) AS usuario
        FROM [${dbPedidos}].dbo.Pedidos p
        WHERE p.Tipo = 'V'
          AND (LTRIM(RTRIM(p.Itm)) = '0' OR LTRIM(RTRIM(p.Itm)) = '')
          AND p.Fechora BETWEEN @desde AND @hasta
          AND p.Anulado IS NOT NULL AND LTRIM(RTRIM(p.Anulado)) != '' AND p.Anulado != ' '
        ORDER BY p.Fechora ASC
      `);

    type Row = { boleta: string; sucursal: string; cliente: string; total: number; fechora: string; usuario: string; origen: "venta" | "pendiente" };
    const allRowsRaw: Row[] = [
      ...ventas.recordset.map((r: Row) => ({ ...r, origen: "venta" as const })),
      ...pendientes.recordset.map((r: Row) => ({ ...r, origen: "pendiente" as const })),
    ];

    // Filter out zero-total anulaciones — these are entries that were created
    // and immediately anulated (often without items) and only generate noise.
    // The user explicitly asked to suppress them.
    const allRows = allRowsRaw.filter((r) => Number(r.total) > 0);
    const skippedZero = allRowsRaw.length - allRows.length;

    if (allRows.length === 0) {
      return NextResponse.json({ ok: true, total: allRowsRaw.length, sent: 0, skippedZero });
    }

    // Filter out already-notified ones (anulacion_monitor OR pedido_anulado_web)
    const boletas = allRows.map((r) => r.boleta);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    todayStart.setHours(todayStart.getHours() + 3);
    const alreadyNotified = await prisma.notificationLog.findMany({
      where: {
        tipo: { in: ["anulacion_monitor", "pedido_anulado_web"] },
        createdAt: { gte: todayStart },
        clientId: { in: boletas },
      },
      select: { clientId: true },
    });
    const seen = new Set(alreadyNotified.map((n) => n.clientId));
    const newOnes = allRows.filter((h) => !seen.has(h.boleta));

    if (newOnes.length === 0) {
      return NextResponse.json({ ok: true, total: allRows.length, sent: 0 });
    }

    // For each new boleta, fetch its items
    let totalSent = 0;
    for (const h of newOnes) {
      const sourceTable = h.origen === "pendiente" ? `[${dbPedidos}].dbo.Pedidos` : `[${dbTransas}].dbo.Transas`;
      const items = await pool
        .request()
        .input("boleta", h.boleta)
        .query(`
          SELECT
            LTRIM(RTRIM(t.Producto)) AS sku,
            t.Cant AS cant,
            LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre
          FROM ${sourceTable} t
          LEFT JOIN [${dbProductos}].dbo.Productos p ON LTRIM(RTRIM(p.Cod)) = LTRIM(RTRIM(t.Producto))
          WHERE LTRIM(RTRIM(t.Boleta)) = @boleta AND t.Tipo = 'I'
          ORDER BY t.Itm
        `);

      const sucName = SUC_NAMES[h.sucursal] || `Suc ${h.sucursal}`;
      const hh = h.fechora.substring(8, 10) + ":" + h.fechora.substring(10, 12);
      const itemsTxt = items.recordset
        .map((i: { sku: string; cant: number; nombre: string }) => `  - ${i.cant} x ${i.nombre || "SKU " + i.sku}`)
        .join("\n");

      const tipoTxt = h.origen === "pendiente" ? "Anulacion de PENDIENTE" : "Anulacion detectada";
      const msg =
        `⚠️ ${tipoTxt}\n` +
        `${sucName} — ${hh}\n` +
        `Boleta: ${h.boleta}\n` +
        `Cliente: ${h.cliente || "(s/n)"}\n` +
        `Total: ${formatPrice(Number(h.total))}\n` +
        (itemsTxt ? `\nProductos:\n${itemsTxt}\n` : "") +
        `\nRevisar stock por bug de PunTouch al anular.`;

      // Send to each phone
      for (const p of phones) {
        const chatId = p.replace(/\D/g, "") + "@c.us";
        try {
          await fetch("http://127.0.0.1:3099/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chatId, message: msg }),
          });
        } catch {
          /* ignore */
        }
      }

      // Log so we don't re-send
      try {
        await prisma.notificationLog.create({
          data: {
            clientId: h.boleta,
            tipo: "anulacion_monitor",
            mensaje: msg.substring(0, 400),
            telefono: phones[0] || null,
            enviadoPor: "sistema",
            ok: true,
          },
        });
      } catch (e) {
        console.error("NotificationLog error (non-fatal):", e);
      }
      totalSent++;
    }

    console.log(`[ANULACION-MONITOR] sent ${totalSent} new alerts (skipped ${skippedZero} con total=0)`);
    return NextResponse.json({ ok: true, total: allRows.length, sent: totalSent, skippedZero });
  } catch (error) {
    console.error("Anulacion monitor error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
