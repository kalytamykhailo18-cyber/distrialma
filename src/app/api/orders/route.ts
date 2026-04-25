import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";
import type { CartItem } from "@/types";

const SUCURSAL = (process.env.PUNTOUCH_SUCURSAL || "7").padEnd(3, " ");
const TERMINAL = parseInt(process.env.PUNTOUCH_TERMINAL || "7");

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = session.user as { name?: string; role?: string; clientId?: string };
  if (!user.clientId || user.role === "admin" || user.role === "staff") {
    return NextResponse.json({ error: "Solo clientes pueden hacer pedidos" }, { status: 403 });
  }

  const body = await req.json();
  const items: CartItem[] = body.items;
  const notes: string = body.notes || "";

  if (!items || items.length === 0) {
    return NextResponse.json({ error: "Carrito vacío" }, { status: 400 });
  }

  try {
    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbClientes = getDbName("clientes");

    // Get client info
    const clientResult = await pool
      .request()
      .input("cod", user.clientId)
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

    // Get next Cod and Nroped
    const dbTransas = getDbName("transas");

    const maxResult = await pool.request().query(`
      SELECT ISNULL(MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)), 0) AS maxCod,
             ISNULL(MAX(CAST(LTRIM(RTRIM(Nroped)) AS INT)), 0) AS maxNroped,
             ISNULL(MAX(CAST(LTRIM(RTRIM(NroTransa)) AS INT)), 0) AS maxNroTransa
      FROM [${dbPedidos}].dbo.Pedidos
      WHERE LTRIM(RTRIM(Cod)) NOT LIKE '%[^0-9 ]%'
        AND LTRIM(RTRIM(Nroped)) NOT LIKE '%[^0-9 ]%'
    `);

    // NroMostra (turno) must come from Transas table for correct sequencing
    const maxMostra = await pool.request().query(`
      SELECT ISNULL(MAX(CAST(LTRIM(RTRIM(NroMostra)) AS INT)), 0) AS maxNroMostra
      FROM [${dbTransas}].dbo.Transas
    `);

    let nextCod = Number(maxResult.recordset[0].maxCod || 0) + 1;
    const nextNroped = String(maxResult.recordset[0].maxNroped + 1).padStart(8, "0");
    const nextNroTransa = String(maxResult.recordset[0].maxNroTransa + 1).padStart(8, "0");
    const nextNroMostra = String(maxMostra.recordset[0].maxNroMostra + 1).padStart(8, "0");

    // Build timestamp in Argentina time (UTC-3)
    const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const fechora =
      now.getUTCFullYear().toString() +
      String(now.getUTCMonth() + 1).padStart(2, "0") +
      String(now.getUTCDate()).padStart(2, "0") +
      String(now.getUTCHours()).padStart(2, "0") +
      String(now.getUTCMinutes()).padStart(2, "0") +
      String(now.getUTCSeconds()).padStart(2, "0");

    // Expand combos into individual products for PunTouch
    interface ExpandedItem {
      sku: string;
      name: string;
      cant: number;
      price: number;
      listaPrecio: number;
    }

    // Reparto restriction: specific SKUs forced to mayorista
    const REPARTO_MAYORISTA_ONLY = new Set(["482"]);
    const isReparto = (await prisma.clientDeliveryDay.count({ where: { clientId: user.clientId } })) > 0;

    const expandedItems: ExpandedItem[] = [];

    for (const item of items) {
      if (item.isCombo && item.comboItems) {
        // Combo: expand into individual products at their regular prices
        for (const ci of item.comboItems) {
          const prodResult = await pool
            .request()
            .input("prodSku", ci.sku.padStart(7, " "))
            .query(`
              SELECT s.Precio2 AS precio
              FROM [${getDbName("productos")}].dbo.Stock s
              WHERE s.CodProducto = @prodSku AND LTRIM(RTRIM(s.Deposito)) = '0'
            `);
          const unitPrice = prodResult.recordset[0]?.precio || 0;
          expandedItems.push({
            sku: ci.sku,
            name: ci.name || ci.sku,
            cant: ci.quantity * item.quantity,
            price: unitPrice,
            listaPrecio: 2,
          });
        }
      } else {
        const blockCaja = isReparto && REPARTO_MAYORISTA_ONLY.has(item.sku);
        const isBox = !blockCaja && item.mode === "box" && item.precioCajaCerrada > 0;
        const unitAutoBox = !blockCaja && item.mode === "unit" && item.precioCajaCerrada > 0 && item.cantidadPorCaja > 0 && item.quantity >= item.cantidadPorCaja;
        expandedItems.push({
          sku: item.sku,
          name: item.name || item.sku,
          cant: isBox ? item.cantidadPorCaja * item.quantity : item.quantity,
          price: isBox ? item.precioCajaCerrada : unitAutoBox ? item.precioCajaCerrada : item.precioMayorista,
          listaPrecio: (isBox || unitAutoBox) ? 4 : 2,
        });
      }
    }

    // Merge same SKU entries (box + unit → 1 line at caja cerrada price)
    const mergedItems: typeof expandedItems = [];
    for (const item of expandedItems) {
      const existing = mergedItems.find((m) => m.sku === item.sku);
      if (existing) {
        // Same SKU: merge into 1 line at the lower price (caja cerrada)
        existing.cant += item.cant;
        if (item.listaPrecio === 4) {
          existing.price = item.price;
          existing.listaPrecio = 4;
        } else if (existing.listaPrecio === 4) {
          // Keep existing caja price
        }
      } else {
        mergedItems.push({ ...item });
      }
    }
    expandedItems.length = 0;
    expandedItems.push(...mergedItems);

    // Load promotional config
    const [promoItems, minSetting, shippingSetting, shippingSkuSetting, shippingPriceSetting] = await Promise.all([
      prisma.articuloPromocional.findMany(),
      prisma.setting.findUnique({ where: { key: "promo_min_subtotal" } }),
      prisma.setting.findUnique({ where: { key: "shipping_threshold" } }),
      prisma.setting.findUnique({ where: { key: "shipping_sku" } }),
      prisma.setting.findUnique({ where: { key: "shipping_price" } }),
    ]);
    const promoSet = new Set(promoItems.map((p) => p.sku.trim()));
    const minSubtotal = parseFloat(minSetting?.value || "60000");
    const shippingThreshold = parseFloat(shippingSetting?.value || "200000");
    const shippingSku = shippingSkuSetting?.value || "";
    const shippingPrice = parseFloat(shippingPriceSetting?.value || "0");

    // Calculate non-promotional subtotal
    let nonPromoTotal = 0;
    for (const ei of expandedItems) {
      if (!promoSet.has(ei.sku.trim())) {
        nonPromoTotal += ei.price * ei.cant;
      }
    }

    // Validate minimum order
    if (nonPromoTotal < minSubtotal) {
      return NextResponse.json(
        { error: `El subtotal de productos no promocionales debe ser al menos $${minSubtotal.toLocaleString("es-AR")}. Actual: $${nonPromoTotal.toLocaleString("es-AR")}` },
        { status: 400 }
      );
    }

    // Auto-add shipping if below threshold
    if (nonPromoTotal < shippingThreshold && shippingSku && shippingPrice > 0) {
      expandedItems.push({
        sku: shippingSku,
        name: "ENVIO REPARTO",
        cant: 1,
        price: shippingPrice,
        listaPrecio: 2,
      });
    }

    // Auto-add bonificacion SKU 22 at $0.01 when shipping is free (above threshold)
    if (nonPromoTotal >= shippingThreshold) {
      expandedItems.push({
        sku: "22",
        name: "ENVIO BONIFICACION",
        cant: 1,
        price: 0.01,
        listaPrecio: 2,
      });
    }

    // Calculate totals
    let totalCant = 0;
    let totalImpo = 0;

    for (const ei of expandedItems) {
      totalCant += ei.cant;
      totalImpo += ei.price * ei.cant;
    }

    const boletaCod = String(nextCod).padStart(9, " ");

    // Insert header row (Tipo = 'V', Itm = '0')
    const headerReq = pool.request();
    headerReq.input("cod", String(nextCod).padStart(9, " "));
    headerReq.input("boleta", boletaCod);
    headerReq.input("fechora", fechora.padEnd(14, " "));
    headerReq.input("cant", totalCant);
    headerReq.input("impo", totalImpo);
    headerReq.input("total", totalImpo);
    headerReq.input("nroped", nextNroped);
    headerReq.input("cliente", client.cod.padStart(7, " "));
    headerReq.input("nombre", client.nombre);
    headerReq.input("calle", client.calle);
    headerReq.input("nume", client.nume);
    headerReq.input("pisoDto", client.pisoDto);
    headerReq.input("localidad", client.localidad.padEnd(4, " "));
    headerReq.input("cuit", client.cuit.padEnd(14, " "));
    headerReq.input("iva", client.iva.padEnd(1, " "));
    headerReq.input("telefono", client.telefono.padEnd(14, " "));
    headerReq.input("obs", (notes || "").substring(0, 80));

    headerReq.input("nroTransa", nextNroTransa);
    headerReq.input("nroMostra", nextNroMostra);
    headerReq.input("sucursal", SUCURSAL);
    headerReq.input("terminal", TERMINAL);

    await headerReq.query(`
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
         'WEB', '', '',
         0, 0, 0, 0, 0,
         0, 0, 0, 0, 0)
    `);

    nextCod++;

    // Insert item rows (Tipo = 'I', Itm = '1', '2', ...)
    for (let i = 0; i < expandedItems.length; i++) {
      const ei = expandedItems[i];
      const cant = ei.cant;
      const price = ei.price;
      const impo = price * cant;
      const listaPrecio = ei.listaPrecio;

      const itemReq = pool.request();
      itemReq.input("cod", String(nextCod).padStart(9, " "));
      itemReq.input("boleta", boletaCod);
      itemReq.input("itm", String(i + 1).padStart(3, " "));
      itemReq.input("fechora", fechora.padEnd(14, " "));
      itemReq.input("producto", ei.sku.padStart(7, " "));
      itemReq.input("cant", cant);
      itemReq.input("precio", price);
      itemReq.input("impo", impo);
      itemReq.input("total", totalImpo);
      itemReq.input("nroped", nextNroped);
      itemReq.input("cliente", client.cod.padStart(7, " "));
      itemReq.input("nombre", client.nombre);
      itemReq.input("calle", client.calle);
      itemReq.input("nume", client.nume);
      itemReq.input("pisoDto", client.pisoDto);
      itemReq.input("localidad", client.localidad.padEnd(4, " "));
      itemReq.input("cuit", client.cuit.padEnd(14, " "));
      itemReq.input("iva", client.iva.padEnd(1, " "));
      itemReq.input("telefono", client.telefono.padEnd(14, " "));
      itemReq.input("listaPrecio", listaPrecio);
      itemReq.input("nroTransa", nextNroTransa);
      itemReq.input("nroMostra", nextNroMostra);
      itemReq.input("sucursal", SUCURSAL);
      itemReq.input("terminal", TERMINAL);

      await itemReq.query(`
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
           'WEB', '', '',
           0, 0, 0, 0, 0,
           0, 0, 0, 0, 0)
      `);

      nextCod++;
    }

    // Save precarga snapshot to PostgreSQL for future comparison
    try {
      await prisma.archivedOrder.create({
        data: {
          boleta: boletaCod.trim(),
          nroped: nextNroped,
          fechora: fechora,
          clienteCod: client.cod.padStart(7, " "),
          clienteName: client.nombre,
          totalCant: totalCant,
          total: totalImpo,
          notas: notes || "",
          items: {
            create: expandedItems.map((ei) => ({
              sku: ei.sku.padStart(7, " "),
              productName: ei.name.substring(0, 60),
              cant: ei.cant,
              precio: ei.price,
              impo: ei.price * ei.cant,
              listaPrecio: ei.listaPrecio,
            })),
          },
        },
      });
    } catch (archiveErr) {
      console.error("Error saving precarga snapshot:", archiveErr);
    }

    // Instant backup to PedidoBackup (so it persists even if deleted from PunTouch before cron runs)
    try {
      await prisma.pedidoBackup.upsert({
        where: { boleta: boletaCod.trim() },
        update: {},
        create: {
          boleta: boletaCod.trim(),
          clienteCod: client.cod.trim(),
          clienteName: client.nombre,
          total: totalImpo,
          fechora: fechora,
          nroped: nextNroped,
          items: JSON.stringify(expandedItems.map((ei) => ({
            sku: ei.sku.trim(),
            name: ei.name,
            cant: ei.cant,
            price: ei.price,
            listaPrecio: ei.listaPrecio,
          }))),
          active: true,
        },
      });
    } catch (backupErr) {
      console.error("Error saving instant PedidoBackup:", backupErr);
    }

    return NextResponse.json({
      ok: true,
      nroped: nextNroped,
    });
  } catch (error) {
    console.error("Order creation error:", error);
    return NextResponse.json(
      { error: "Error al crear el pedido" },
      { status: 500 }
    );
  }
}
