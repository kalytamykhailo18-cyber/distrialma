import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { Resend } from "resend";

const SUCURSAL = (process.env.PUNTOUCH_SUCURSAL || "7").padEnd(3, " ");
const TERMINAL = parseInt(process.env.PUNTOUCH_TERMINAL || "7");

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const vendedorCod = req.nextUrl.searchParams.get("vendedorCod");
  const desde = req.nextUrl.searchParams.get("desde");
  const hasta = req.nextUrl.searchParams.get("hasta");

  const where: Record<string, unknown> = {};
  if (vendedorCod) where.vendedorCod = vendedorCod;
  if (desde && hasta) {
    where.createdAt = { gte: new Date(desde), lt: new Date(hasta) };
  }

  const orders = await prisma.vendedorOrder.findMany({
    where,
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return NextResponse.json({
    orders: orders.map((o) => ({
      id: o.id,
      vendedorCod: o.vendedorCod,
      vendedorName: o.vendedorName,
      clienteCod: o.clienteCod,
      clienteName: o.clienteName,
      total: Number(o.total),
      comisionTotal: Number(o.comisionTotal),
      estado: o.estado,
      latitude: o.latitude ? Number(o.latitude) : null,
      longitude: o.longitude ? Number(o.longitude) : null,
      notas: o.notas,
      createdAt: o.createdAt.toISOString(),
      itemCount: o.items.length,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      vendedorCod,
      vendedorName,
      clienteCod,
      clienteName,
      items,
      latitude,
      longitude,
      notas,
    } = body;

    if (!vendedorCod || !clienteCod || !items?.length) {
      return NextResponse.json({ error: "Datos requeridos" }, { status: 400 });
    }

    // Get settings
    const settings = await prisma.setting.findMany({
      where: { key: { in: ["vendedor_min_order", "vendedor_default_comision"] } },
    });
    const settingsMap = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    const minOrder = parseFloat(settingsMap.vendedor_min_order || "0");
    const defaultComision = parseFloat(settingsMap.vendedor_default_comision || "3");

    // Get vendedor commissions per rubro
    const vendComisiones = await prisma.vendedorComision.findMany({ where: { vendedorCod } });
    const comisionMap = new Map(vendComisiones.map((c) => [c.rubroCod, Number(c.porcentaje)]));

    // Get promotional items
    const promocionales = await prisma.articuloPromocional.findMany();
    const promoSet = new Set(promocionales.map((p) => p.sku));

    // Calculate totals and commissions
    let total = 0;
    let totalNonPromo = 0;
    let comisionTotal = 0;
    const itemsWithCommission = items.map(
      (item: {
        sku: string;
        productName: string;
        rubroCod?: string;
        cantidad: number;
        precioMayorista: number;
        precioVenta: number;
      }) => {
        const subtotal = item.precioVenta * item.cantidad;
        const esPromo = promoSet.has(item.sku);
        total += subtotal;
        if (!esPromo) totalNonPromo += subtotal;

        let comisionPorc = 0;
        if (!esPromo) {
          comisionPorc = item.rubroCod && comisionMap.has(item.rubroCod)
            ? (comisionMap.get(item.rubroCod) || 0)
            : defaultComision;
        }
        const comisionMonto = Math.round(subtotal * (comisionPorc / 100));
        comisionTotal += comisionMonto;

        return {
          sku: item.sku,
          productName: item.productName,
          rubroCod: item.rubroCod || null,
          cantidad: Math.round(item.cantidad * 1000) / 1000,
          precioMayorista: item.precioMayorista,
          precioVenta: item.precioVenta,
          comisionPorc,
          comisionMonto,
          esPromocional: esPromo,
        };
      }
    );

    // Check minimum order (excluding promo items)
    if (minOrder > 0 && totalNonPromo < minOrder) {
      return NextResponse.json(
        {
          error: `Pedido por debajo del mínimo. Mínimo: $${minOrder.toLocaleString("es-AR")}, total no-promo: $${totalNonPromo.toLocaleString("es-AR")}`,
        },
        { status: 400 }
      );
    }

    // Save to PunTouch as preventa (using same pattern as existing orders endpoint)
    let puntouchCod: string | null = null;
    let nextNroped: string | null = null;
    try {
      const pool = await getPool();
      const dbPedidos = getDbName("pedidos");
      const dbClientes = getDbName("clientes");
      const dbTransas = getDbName("transas");

      // Get client info
      const clientResult = await pool
        .request()
        .input("cod", clienteCod)
        .query(
          `SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM(Nombre)) AS nombre,
                  LTRIM(RTRIM(ISNULL(Calle,''))) AS calle,
                  LTRIM(RTRIM(ISNULL(Nume,''))) AS nume,
                  LTRIM(RTRIM(ISNULL(PisoDto,''))) AS pisoDto,
                  LTRIM(RTRIM(ISNULL(CUIT,''))) AS cuit,
                  LTRIM(RTRIM(ISNULL(IVA,''))) AS iva,
                  LTRIM(RTRIM(ISNULL(Localidad,''))) AS localidad,
                  LTRIM(RTRIM(ISNULL(Telclave3, ISNULL(TelClave1,'')))) AS telefono
           FROM [${dbClientes}].dbo.Clientes
           WHERE LTRIM(RTRIM(Cod)) = @cod`
        );

      if (clientResult.recordset.length === 0) {
        return NextResponse.json({ error: "Cliente no encontrado" }, { status: 404 });
      }
      const client = clientResult.recordset[0];

      // Get next sequence numbers
      const maxResult = await pool.request().query(`
        SELECT ISNULL(MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)), 0) AS maxCod,
               ISNULL(MAX(CAST(LTRIM(RTRIM(Nroped)) AS INT)), 0) AS maxNroped,
               ISNULL(MAX(CAST(LTRIM(RTRIM(NroTransa)) AS INT)), 0) AS maxNroTransa
        FROM [${dbPedidos}].dbo.Pedidos
        WHERE LTRIM(RTRIM(Cod)) NOT LIKE '%[^0-9 ]%'
          AND LTRIM(RTRIM(Nroped)) NOT LIKE '%[^0-9 ]%'
      `);
      const maxMostra = await pool.request().query(`
        SELECT ISNULL(MAX(CAST(LTRIM(RTRIM(NroMostra)) AS INT)), 0) AS maxNroMostra
        FROM [${dbTransas}].dbo.Transas
      `);

      let nextCod = maxResult.recordset[0].maxCod + 1;
      nextNroped = String(maxResult.recordset[0].maxNroped + 1).padStart(8, "0");
      const nextNroTransa = String(maxResult.recordset[0].maxNroTransa + 1).padStart(8, "0");
      const nextNroMostra = String(maxMostra.recordset[0].maxNroMostra + 1).padStart(8, "0");

      const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
      const fechora =
        now.getUTCFullYear().toString() +
        String(now.getUTCMonth() + 1).padStart(2, "0") +
        String(now.getUTCDate()).padStart(2, "0") +
        String(now.getUTCHours()).padStart(2, "0") +
        String(now.getUTCMinutes()).padStart(2, "0") +
        String(now.getUTCSeconds()).padStart(2, "0");

      const totalCant = itemsWithCommission.reduce((s: number, i: { cantidad: number }) => s + i.cantidad, 0);
      const boletaCod = String(nextCod).padStart(9, " ");
      puntouchCod = boletaCod;

      // Insert header (Tipo='V')
      await pool
        .request()
        .input("cod", boletaCod)
        .input("boleta", boletaCod)
        .input("fechora", fechora.padEnd(14, " "))
        .input("cant", totalCant)
        .input("impo", total)
        .input("total", total)
        .input("nroped", nextNroped)
        .input("cliente", client.cod.padStart(7, " "))
        .input("nombre", client.nombre)
        .input("calle", client.calle)
        .input("nume", client.nume)
        .input("pisoDto", client.pisoDto)
        .input("localidad", client.localidad.padEnd(4, " "))
        .input("cuit", client.cuit.padEnd(14, " "))
        .input("iva", client.iva.padEnd(1, " "))
        .input("telefono", client.telefono.padEnd(14, " "))
        .input("obs", `PREVENTA ${vendedorName || ""}`.substring(0, 80))
        .input("nroTransa", nextNroTransa)
        .input("nroMostra", nextNroMostra)
        .input("sucursal", SUCURSAL)
        .input("terminal", TERMINAL)
        .query(`
          INSERT INTO [${dbPedidos}].dbo.Pedidos
            (Cod, Boleta, Itm, Tipo, TipoFac, Sucursal, Deposito, Terminal, Fechora,
             Producto, Cant, Precio, Impo, Total, Costo, Efectivo, Tarjeta, Deuda, Vuelto, Sena,
             Descuento, Recargo, ImpoIva, ImpoCos, InicioCaja, NroCierreCaja, PorceDescuento,
             Observaciones, MovCaja, Concepto, CodTarjeta, NroTarjeta, ListaPrecio,
             Usuario, Empleado, Proveedor, Nroped, NroMostra, NroTransa,
             Telefono, Cliente, Nombre, Calle, Nume, PisoDto, Entre1, Entre2,
             Localidad, CUIT, IVA, FechoraEntregar, Anulado, TalleColor, Stkinicial,
             Filler1, Filler2, Filler3,
             FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
             FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
          VALUES
            (@cod, @boleta, '0  ', 'V', ' ', @sucursal, '0  ', @terminal, @fechora,
             '       ', @cant, 0, @impo, @total, 0, 0, 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0, 0,
             @obs, ' ', '', '    ', '', 0,
             '      0', '      0', '       ', @nroped, @nroMostra, @nroTransa,
             @telefono, @cliente, @nombre, @calle, @nume, @pisoDto, '', '',
             @localidad, @cuit, @iva, '              ', ' ', '', 0,
             'PREVENTA', '', '',
             0, 0, 0, 0, 0,
             0, 0, 0, 0, 0)
        `);
      nextCod++;

      // Insert items (Tipo='I')
      for (let i = 0; i < itemsWithCommission.length; i++) {
        const it = itemsWithCommission[i];
        const cant = it.cantidad;
        const price = it.precioVenta;
        const impo = price * cant;

        await pool
          .request()
          .input("cod", String(nextCod).padStart(9, " "))
          .input("boleta", boletaCod)
          .input("itm", String(i + 1).padStart(3, " "))
          .input("fechora", fechora.padEnd(14, " "))
          .input("producto", it.sku.padStart(7, " "))
          .input("cant", cant)
          .input("precio", price)
          .input("impo", impo)
          .input("total", total)
          .input("nroped", nextNroped)
          .input("cliente", client.cod.padStart(7, " "))
          .input("nombre", client.nombre)
          .input("calle", client.calle)
          .input("nume", client.nume)
          .input("pisoDto", client.pisoDto)
          .input("localidad", client.localidad.padEnd(4, " "))
          .input("cuit", client.cuit.padEnd(14, " "))
          .input("iva", client.iva.padEnd(1, " "))
          .input("telefono", client.telefono.padEnd(14, " "))
          .input("listaPrecio", 2)
          .input("nroTransa", nextNroTransa)
          .input("nroMostra", nextNroMostra)
          .input("sucursal", SUCURSAL)
          .input("terminal", TERMINAL)
          .query(`
            INSERT INTO [${dbPedidos}].dbo.Pedidos
              (Cod, Boleta, Itm, Tipo, TipoFac, Sucursal, Deposito, Terminal, Fechora,
               Producto, Cant, Precio, Impo, Total, Costo, Efectivo, Tarjeta, Deuda, Vuelto, Sena,
               Descuento, Recargo, ImpoIva, ImpoCos, InicioCaja, NroCierreCaja, PorceDescuento,
               Observaciones, MovCaja, Concepto, CodTarjeta, NroTarjeta, ListaPrecio,
               Usuario, Empleado, Proveedor, Nroped, NroMostra, NroTransa,
               Telefono, Cliente, Nombre, Calle, Nume, PisoDto, Entre1, Entre2,
               Localidad, CUIT, IVA, FechoraEntregar, Anulado, TalleColor, Stkinicial,
               Filler1, Filler2, Filler3,
               FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
               FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
            VALUES
              (@cod, @boleta, @itm, 'I', ' ', @sucursal, '0  ', @terminal, @fechora,
               @producto, @cant, @precio, @impo, @total, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, 0, 0, 0,
               '', ' ', '', '    ', '', @listaPrecio,
               '      0', '      0', '       ', @nroped, @nroMostra, @nroTransa,
               @telefono, @cliente, @nombre, @calle, @nume, @pisoDto, '', '',
               @localidad, @cuit, @iva, '              ', ' ', '', 0,
               'PREVENTA', '', '',
               0, 0, 0, 0, 0,
               0, 0, 0, 0, 0)
          `);
        nextCod++;
      }
    } catch (e) {
      console.error("Error writing to PunTouch:", e);
      // Continue — save to PG anyway
    }

    // Save to PostgreSQL
    const order = await prisma.vendedorOrder.create({
      data: {
        vendedorCod,
        vendedorName: vendedorName || "",
        clienteCod,
        clienteName: clienteName || "",
        total,
        comisionTotal,
        estado: "preventa",
        puntouchCod,
        latitude: latitude ?? null,
        longitude: longitude ?? null,
        notas: notas || null,
        items: {
          create: itemsWithCommission,
        },
      },
      include: { items: true },
    });

    // Send commission email to vendedor (fire-and-forget)
    const userSession = session.user as { userEmail?: string; name?: string };
    if (userSession.userEmail) {
      const fmt = (n: number) => "$" + n.toLocaleString("es-AR", { maximumFractionDigits: 0 });
      try {
        const resend = new Resend(process.env.RESEND_API_KEY || "");
        const itemsHtml = itemsWithCommission.map((i: { productName: string; cantidad: number; precioVenta: number; comisionPorc: number; comisionMonto: number; esPromocional: boolean }) =>
          `<tr><td>${i.productName}</td><td style="text-align:right">${i.cantidad}</td><td style="text-align:right">${fmt(i.precioVenta * i.cantidad)}</td><td style="text-align:right">${i.esPromocional ? "—" : i.comisionPorc + "%"}</td><td style="text-align:right">${fmt(i.comisionMonto)}</td></tr>`
        ).join("");
        await resend.emails.send({
          from: process.env.RESEND_FROM || "Administracion <no-responder@alertrasadmin.com>",
          to: userSession.userEmail,
          subject: `Pedido ${clienteName} — Comision aprox. ${fmt(comisionTotal)}`,
          html: `<h2>Pedido registrado</h2>
            <p><strong>Cliente:</strong> ${clienteName}</p>
            <p><strong>Total:</strong> ${fmt(total)}</p>
            <p><strong>Comision aproximada:</strong> ${fmt(comisionTotal)}</p>
            <table style="border-collapse:collapse;width:100%;font-size:13px">
              <tr style="background:#f5f5f5"><th style="text-align:left;padding:4px">Producto</th><th style="text-align:right;padding:4px">Cant</th><th style="text-align:right;padding:4px">Subtotal</th><th style="text-align:right;padding:4px">%</th><th style="text-align:right;padding:4px">Comision</th></tr>
              ${itemsHtml}
              <tr style="font-weight:bold;border-top:2px solid #333"><td colspan="4" style="padding:4px">TOTAL COMISION</td><td style="text-align:right;padding:4px">${fmt(comisionTotal)}</td></tr>
            </table>
            <p style="color:#888;font-size:11px">Esta comision es aproximada. La definitiva se calcula sobre lo real facturado.</p>`,
        });
      } catch {}
    }

    return NextResponse.json({ order, puntouchCod, nroped: nextNroped });
  } catch (error) {
    console.error("Error creating order:", error);
    return NextResponse.json({ error: "Error al crear pedido" }, { status: 500 });
  }
}
