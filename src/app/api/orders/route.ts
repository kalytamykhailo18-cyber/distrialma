import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getPool, getDbName } from "@/lib/mssql";
import type { CartItem } from "@/types";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const user = session.user as { name?: string; role?: string; clientId?: string };
  if (!user.clientId || user.role === "admin") {
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
    const dbTransas = "c:\\puntouch\\bdtransas.mdf";

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

    let nextCod = maxResult.recordset[0].maxCod + 1;
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
      cant: number;
      price: number;
      listaPrecio: number;
    }

    const expandedItems: ExpandedItem[] = [];

    for (const item of items) {
      if (item.isCombo && item.comboItems) {
        // Combo: expand into individual products at their regular prices
        for (const ci of item.comboItems) {
          // Fetch individual product price from SQL Server
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
            cant: ci.quantity * item.quantity,
            price: unitPrice,
            listaPrecio: 2,
          });
        }
      } else {
        // Regular product
        const isBox = item.mode === "box" && item.precioCajaCerrada > 0;
        expandedItems.push({
          sku: item.sku,
          cant: isBox ? item.cantidadPorCaja * item.quantity : item.quantity,
          price: isBox ? item.precioCajaCerrada : item.precioMayorista,
          listaPrecio: isBox ? 4 : 2,
        });
      }
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
    headerReq.input("obs", notes);

    headerReq.input("nroTransa", nextNroTransa);
    headerReq.input("nroMostra", nextNroMostra);

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
        (@cod, @boleta, '0  ', 'V', ' ', '6  ', '0  ', 6, @fechora,
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
          (@cod, @boleta, @itm, 'I', ' ', '6  ', '0  ', 6, @fechora,
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
