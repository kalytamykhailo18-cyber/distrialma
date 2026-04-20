import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { sucursal, empleadoCod, clienteCod, items, notes } = await req.json();

    if (!items?.length || !sucursal || !empleadoCod) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const pool = await getPool();
    const dbPedidos = getDbName("pedidos");
    const dbClientes = getDbName("clientes");

    // Get next Cod and Nroped
    const maxResult = await pool.request().query(`
      SELECT MAX(CAST(Cod AS BIGINT)) AS maxCod,
             MAX(CAST(LTRIM(RTRIM(Nroped)) AS BIGINT)) AS maxNroped
      FROM [${dbPedidos}].dbo.Pedidos
    `);
    let nextCod = Number(maxResult.recordset[0].maxCod || 0) + 1;
    const nextNroped = String(Number(maxResult.recordset[0].maxNroped || 0) + 1).padStart(8, " ");
    const nextNroTransa = "";
    const nextNroMostra = "";

    const suc = sucursal.padEnd(3, " ");
    const empCod = empleadoCod.padStart(7, " ");
    const cliCod = (clienteCod || "0").padStart(7, " ");

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fechora = now.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);

    const totalImpo = items.reduce((s: number, i: { cantidad: number; precio: number }) => s + i.precio * i.cantidad, 0);
    const totalCant = items.reduce((s: number, i: { cantidad: number }) => s + i.cantidad, 0);

    // Get client info
    let clienteNombre = "", clienteCalle = "", clienteNume = "", clientePisoDto = "";
    let clienteLocalidad = "", clienteCuit = "", clienteIva = "", clienteTelefono = "";

    if (clienteCod) {
      const cr = await pool.request().input("cod", cliCod).query(`
        SELECT LTRIM(RTRIM(Nombre)) AS nombre, LTRIM(RTRIM(ISNULL(Calle,''))) AS calle,
          LTRIM(RTRIM(ISNULL(Nume,''))) AS nume, LTRIM(RTRIM(ISNULL(PisoDto,''))) AS pisoDto,
          LTRIM(RTRIM(ISNULL(Localidad,''))) AS localidad, LTRIM(RTRIM(ISNULL(CUIT,''))) AS cuit,
          LTRIM(RTRIM(ISNULL(IVA,''))) AS iva, LTRIM(RTRIM(ISNULL(Telclave3,ISNULL(TelClave1,'')))) AS telefono
        FROM [${dbClientes}].dbo.Clientes WHERE Cod = @cod
      `);
      if (cr.recordset.length > 0) {
        const c = cr.recordset[0];
        clienteNombre = c.nombre; clienteCalle = c.calle; clienteNume = c.nume;
        clientePisoDto = c.pisoDto; clienteLocalidad = c.localidad; clienteCuit = c.cuit;
        clienteIva = c.iva; clienteTelefono = c.telefono;
      }
    }

    const boletaCod = String(nextCod).padStart(9, " ");

    // Write header (Tipo = 'V', Itm = '0')
    await pool.request()
      .input("cod", boletaCod).input("boleta", boletaCod)
      .input("suc", suc).input("fechora", fechora.padEnd(14, " "))
      .input("cant", totalCant).input("impo", totalImpo).input("total", totalImpo)
      .input("nroped", nextNroped).input("nroTransa", nextNroTransa).input("nroMostra", nextNroMostra)
      .input("empleado", empCod).input("cliente", cliCod)
      .input("nombre", clienteNombre).input("calle", clienteCalle).input("nume", clienteNume)
      .input("pisoDto", clientePisoDto).input("localidad", clienteLocalidad.padEnd(4, " "))
      .input("cuit", clienteCuit.padEnd(14, " ")).input("iva", clienteIva.padEnd(1, " "))
      .input("telefono", clienteTelefono.padEnd(14, " "))
      .input("obs", (notes || "").substring(0, 80))
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
          (@cod, @boleta, '0  ', 'V', ' ', @suc, '0  ', 0, @fechora,
           '       ', @cant, 0, @impo, @total, 0, 0, 0, 0, 0, 0,
           0, 0, 0, 0, 0, 0, 0,
           @obs, ' ', '', '    ', '', 0,
           '      0', @empleado, '       ', @nroped, @nroMostra, @nroTransa,
           @telefono, @cliente, @nombre, @calle, @nume, @pisoDto, '', '',
           @localidad, @cuit, @iva, '              ', ' ', '', 0,
           'POS', '', '',
           0, 0, 0, 0, 0,
           0, 0, 0, 0, 0)
      `);

    nextCod++;

    // Write items (Tipo = 'I')
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemCod = String(nextCod).padStart(9, " ");
      await pool.request()
        .input("cod", itemCod).input("boleta", boletaCod)
        .input("itm", String(i + 1).padStart(3, " "))
        .input("suc", suc).input("fechora", fechora.padEnd(14, " "))
        .input("producto", item.sku.padStart(7, " "))
        .input("cant", item.cantidad).input("precio", item.precio)
        .input("impo", item.precio * item.cantidad).input("total", totalImpo)
        .input("listaPrecio", item.lista || 0)
        .input("nroped", nextNroped).input("nroTransa", nextNroTransa).input("nroMostra", nextNroMostra)
        .input("empleado", empCod).input("cliente", cliCod)
        .input("nombre", clienteNombre).input("calle", clienteCalle).input("nume", clienteNume)
        .input("pisoDto", clientePisoDto).input("localidad", clienteLocalidad.padEnd(4, " "))
        .input("cuit", clienteCuit.padEnd(14, " ")).input("iva", clienteIva.padEnd(1, " "))
        .input("telefono", clienteTelefono.padEnd(14, " "))
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
            (@cod, @boleta, @itm, 'I', ' ', @suc, '0  ', 0, @fechora,
             @producto, @cant, @precio, @impo, @total, 0, 0, 0, 0, 0, 0,
             0, 0, 0, 0, 0, 0, 0,
             '', ' ', '', '    ', '', @listaPrecio,
             '      0', @empleado, '       ', @nroped, @nroMostra, @nroTransa,
             @telefono, @cliente, @nombre, @calle, @nume, @pisoDto, '', '',
             @localidad, @cuit, @iva, '              ', ' ', '', 0,
             'POS', '', '',
             0, 0, 0, 0, 0,
             0, 0, 0, 0, 0)
        `);
      nextCod++;
    }

    return NextResponse.json({ ok: true, nroped: nextNroped.trim(), boleta: boletaCod.trim() });
  } catch (error) {
    console.error("POS pending error:", error);
    return NextResponse.json({ error: "Error al crear pedido pendiente" }, { status: 500 });
  }
}
