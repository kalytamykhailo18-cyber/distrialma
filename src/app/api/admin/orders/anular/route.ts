import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const SUC_NAMES: Record<string, string> = {
  "1": "Minorista",
  "2": "Mayorista",
  "6": "Pontevedra",
  "7": "Distribuidora",
  "10": "Reventas",
  "11": "PedidosYa",
};

function formatPrice(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function getSetting(key: string, def: string): Promise<string> {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value || def;
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const boletasInput: string[] = Array.isArray(body.boletas)
      ? body.boletas.map((b: unknown) => String(b).trim()).filter(Boolean)
      : body.boleta
        ? [String(body.boleta).trim()]
        : [];

    if (boletasInput.length === 0) {
      return NextResponse.json({ error: "Boleta requerida" }, { status: 400 });
    }

    const pool = await getPool();
    const dbPed = getDbName("pedidos");
    const dbProd = getDbName("productos");

    const user = (session.user as { name?: string; email?: string }).name || (session.user as { email?: string }).email || "admin";

    let phoneSetting = await getSetting("anulacion_monitor_phones", "");
    if (!phoneSetting) {
      phoneSetting = await getSetting("stock_alert_phone", process.env.GASTON_PHONE || "5491122254949");
    }
    const phones = phoneSetting.split(",").map((p) => p.trim()).filter(Boolean);

    let totalUpdated = 0;
    const anulatedBoletas: string[] = [];

    for (const boleta of boletasInput) {
      const header = await pool
        .request()
        .input("boleta", boleta)
        .query(`
          SELECT TOP 1
            LTRIM(RTRIM(p.Sucursal)) AS sucursal,
            LTRIM(RTRIM(ISNULL(p.Nombre,''))) AS cliente,
            ISNULL(p.Total, 0) AS total,
            LTRIM(RTRIM(p.Fechora)) AS fechora
          FROM [${dbPed}].dbo.Pedidos p
          WHERE p.Tipo = 'V'
            AND (LTRIM(RTRIM(p.Itm)) = '0' OR LTRIM(RTRIM(p.Itm)) = '')
            AND LTRIM(RTRIM(p.Boleta)) = @boleta
        `);

      if (header.recordset.length === 0) continue;
      const h = header.recordset[0];

      const items = await pool
        .request()
        .input("boleta", boleta)
        .query(`
          SELECT
            LTRIM(RTRIM(p.Producto)) AS sku,
            p.Cant AS cant,
            LTRIM(RTRIM(ISNULL(pr.Nombre,''))) AS nombre
          FROM [${dbPed}].dbo.Pedidos p
          LEFT JOIN [${dbProd}].dbo.Productos pr ON LTRIM(RTRIM(pr.Cod)) = LTRIM(RTRIM(p.Producto))
          WHERE LTRIM(RTRIM(p.Boleta)) = @boleta AND p.Tipo = 'I'
          ORDER BY p.Itm
        `);

      const result = await pool
        .request()
        .input("boleta", boleta)
        .query(`
          DELETE FROM [${dbPed}].dbo.Pedidos
          WHERE LTRIM(RTRIM(Boleta)) = @boleta
        `);

      const updated = result.rowsAffected[0] || 0;
      if (updated === 0) continue;

      totalUpdated += updated;
      anulatedBoletas.push(boleta);

      const sucName = SUC_NAMES[h.sucursal] || `Suc ${h.sucursal}`;
      const hh = h.fechora?.length >= 12 ? h.fechora.substring(8, 10) + ":" + h.fechora.substring(10, 12) : "";
      const itemsTxt = items.recordset
        .map((i: { sku: string; cant: number; nombre: string }) => `  - ${i.cant} x ${i.nombre || "SKU " + i.sku}`)
        .join("\n");

      const msg =
        `✅ Anulacion desde la web\n` +
        `${sucName}${hh ? ` — ${hh}` : ""}\n` +
        `Boleta: ${boleta}\n` +
        `Cliente: ${h.cliente || "(s/n)"}\n` +
        `Total: ${formatPrice(Number(h.total))}\n` +
        (itemsTxt ? `\nProductos:\n${itemsTxt}\n` : "") +
        `\nEliminado de PunTouch por ${user} (no toca stock).`;

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

      try {
        await prisma.notificationLog.create({
          data: {
            clientId: boleta,
            tipo: "pedido_anulado_web",
            mensaje: msg.substring(0, 400),
            telefono: phones[0] || null,
            enviadoPor: user.substring(0, 60),
            ok: true,
          },
        });
      } catch (e) {
        console.error("NotificationLog error (non-fatal):", e);
      }
    }

    if (totalUpdated === 0) {
      return NextResponse.json({ error: "Ningun pedido pudo anularse (ya anulado o no encontrado)" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, updated: totalUpdated, anulated: anulatedBoletas, notified: phones.length });
  } catch (error) {
    console.error("Anular pedido error:", error);
    return NextResponse.json({ error: "Error al anular pedido" }, { status: 500 });
  }
}
