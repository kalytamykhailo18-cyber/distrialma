import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

interface SaleItem {
  sku: string;
  nombre: string;
  cantidad: number;
  precio: number;
  lista: number;
}

interface SalePayment {
  method: string; // efectivo, debito, credito, cuotas, qr, transferencia, cuenta
  amount: number;
}

export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { sucursal, empleadoCod, clienteCod, items, payments, vuelto } = await req.json() as {
      sucursal: string;
      empleadoCod: string;
      clienteCod?: string;
      items: SaleItem[];
      payments: SalePayment[];
      vuelto: number;
    };

    if (!items?.length || !payments?.length || !sucursal || !empleadoCod) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbClientes = getDbName("clientes");

    // Get next Cod
    const maxCodResult = await pool.request().query(`SELECT MAX(CAST(Cod AS BIGINT)) AS maxCod FROM [${dbTransas}].dbo.Transas`);
    let nextCod = Number(maxCodResult.recordset[0].maxCod || 0) + 1;

    // Get next NroTransa and NroMostra
    const maxNroResult = await pool.request().query(`
      SELECT MAX(CAST(LTRIM(RTRIM(NroTransa)) AS BIGINT)) AS maxNro,
             MAX(CAST(LTRIM(RTRIM(NroMostra)) AS BIGINT)) AS maxMostra
      FROM [${dbTransas}].dbo.Transas
    `);
    const nextNroTransa = String(Number(maxNroResult.recordset[0].maxNro || 0) + 1).padStart(8, "0");
    const nextNroMostra = String(Number(maxNroResult.recordset[0].maxMostra || 0) + 1).padStart(8, "0");

    // Calculate totals
    const totalImpo = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const totalCant = items.reduce((s, i) => s + i.cantidad, 0);

    // Calculate payment splits
    const efectivo = payments.filter((p) => p.method === "efectivo").reduce((s, p) => s + p.amount, 0);
    const tarjeta = payments.filter((p) => ["debito", "credito", "cuotas"].includes(p.method)).reduce((s, p) => s + p.amount, 0);
    const deuda = payments.filter((p) => p.method === "cuenta").reduce((s, p) => s + p.amount, 0);
    // QR and transfer count as efectivo in PunTouch
    const digitalEfectivo = payments.filter((p) => ["qr", "transferencia"].includes(p.method)).reduce((s, p) => s + p.amount, 0);
    const totalEfectivo = efectivo + digitalEfectivo;

    // Build fechora
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fechora = now.toISOString().replace(/[-T:\.Z]/g, "").slice(0, 14);

    // Get client info if provided
    let clienteNombre = "";
    let clienteCalle = "";
    let clienteNume = "";
    let clientePisoDto = "";
    let clienteLocalidad = "";
    let clienteCuit = "";
    let clienteIva = "";
    let clienteTelefono = "";

    if (clienteCod) {
      const clientResult = await pool.request().input("cod", clienteCod.padStart(7, " ")).query(`
        SELECT LTRIM(RTRIM(Nombre)) AS nombre, LTRIM(RTRIM(ISNULL(Calle, ''))) AS calle,
          LTRIM(RTRIM(ISNULL(Nume, ''))) AS nume, LTRIM(RTRIM(ISNULL(PisoDto, ''))) AS pisoDto,
          LTRIM(RTRIM(ISNULL(Localidad, ''))) AS localidad, LTRIM(RTRIM(ISNULL(CUIT, ''))) AS cuit,
          LTRIM(RTRIM(ISNULL(IVA, ''))) AS iva, LTRIM(RTRIM(ISNULL(Telclave3, ISNULL(TelClave1, '')))) AS telefono
        FROM [${dbClientes}].dbo.Clientes WHERE Cod = @cod
      `);
      if (clientResult.recordset.length > 0) {
        const c = clientResult.recordset[0];
        clienteNombre = c.nombre;
        clienteCalle = c.calle;
        clienteNume = c.nume;
        clientePisoDto = c.pisoDto;
        clienteLocalidad = c.localidad;
        clienteCuit = c.cuit;
        clienteIva = c.iva;
        clienteTelefono = c.telefono;
      }
    }

    const boletaCod = String(nextCod).padStart(9, " ");
    const suc = sucursal.padEnd(3, " ");
    const empCod = empleadoCod.padStart(7, " ");
    const cliCod = (clienteCod || "0").padStart(7, " ");

    // Write header (Tipo = 'V', Itm = '0')
    const headerReq = pool.request();
    headerReq.input("cod", boletaCod);
    headerReq.input("suc", suc);
    headerReq.input("fechora", fechora.padEnd(14, " "));
    headerReq.input("cant", totalCant);
    headerReq.input("impo", totalImpo);
    headerReq.input("total", totalImpo);
    headerReq.input("efectivo", totalEfectivo);
    headerReq.input("tarjeta", tarjeta);
    headerReq.input("deuda", deuda);
    headerReq.input("vuelto", vuelto || 0);
    headerReq.input("nroTransa", nextNroTransa);
    headerReq.input("nroMostra", nextNroMostra);
    headerReq.input("empleado", empCod);
    headerReq.input("cliente", cliCod);
    headerReq.input("nombre", clienteNombre);
    headerReq.input("calle", clienteCalle);
    headerReq.input("nume", clienteNume);
    headerReq.input("pisoDto", clientePisoDto);
    headerReq.input("localidad", clienteLocalidad.padEnd(4, " "));
    headerReq.input("cuit", clienteCuit.padEnd(14, " "));
    headerReq.input("iva", clienteIva.padEnd(1, " "));
    headerReq.input("telefono", clienteTelefono.padEnd(14, " "));

    await headerReq.query(`
      INSERT INTO [${dbTransas}].dbo.Transas
        (Cod, Boleta, Itm, Tipo, TipoFac, Sucursal, Deposito, Terminal, Fechora, Producto,
         Cant, Precio, Impo, Total, Costo, Efectivo, Tarjeta, Deuda, Vuelto, Sena,
         Descuento, Recargo, ImpoIva, ImpoCos, InicioCaja, NroCierreCaja, PorceDescuento,
         Observaciones, MovCaja, Concepto, CodTarjeta, NroTarjeta, ListaPrecio,
         Usuario, Empleado, Proveedor, Nroped, NroMostra, NroTransa,
         Telefono, Cliente, Nombre, Calle, Nume, PisoDto, Entre1, Entre2,
         Localidad, CUIT, IVA, FechoraEntregar, Anulado, TalleColor,
         Stkinicial, FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
         Filler1, Filler2, Filler3, FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
      VALUES
        (@cod, @cod, '  0', 'V', ' ', @suc, '0  ', 0, @fechora, '       ',
         @cant, 0, @impo, @total, 0, @efectivo, @tarjeta, @deuda, @vuelto, 0,
         0, 0, 0, 0, 0, 0, 0,
         '', ' ', '', '    ', '', 0,
         '      0', @empleado, '       ', '', @nroMostra, @nroTransa,
         @telefono, @cliente, @nombre, @calle, @nume, @pisoDto, '', '',
         @localidad, @cuit, @iva, '              ', ' ', '',
         0, 0, 0, 0, 0, 0,
         'POS', '', '', 0, 0, 0, 0, 0)
    `);

    nextCod++;

    // Write item rows (Tipo = 'I')
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemCod = String(nextCod).padStart(9, " ");
      const itemReq = pool.request();
      itemReq.input("cod", itemCod);
      itemReq.input("boleta", boletaCod);
      itemReq.input("itm", String(i + 1).padStart(3, " "));
      itemReq.input("suc", suc);
      itemReq.input("fechora", fechora.padEnd(14, " "));
      itemReq.input("producto", item.sku.padStart(7, " "));
      itemReq.input("cant", item.cantidad);
      itemReq.input("precio", item.precio);
      itemReq.input("impo", item.precio * item.cantidad);
      itemReq.input("total", totalImpo);
      itemReq.input("listaPrecio", item.lista);
      itemReq.input("nroTransa", nextNroTransa);
      itemReq.input("nroMostra", nextNroMostra);
      itemReq.input("empleado", empCod);
      itemReq.input("cliente", cliCod);
      itemReq.input("nombre", clienteNombre);
      itemReq.input("calle", clienteCalle);
      itemReq.input("nume", clienteNume);
      itemReq.input("pisoDto", clientePisoDto);
      itemReq.input("localidad", clienteLocalidad.padEnd(4, " "));
      itemReq.input("cuit", clienteCuit.padEnd(14, " "));
      itemReq.input("iva", clienteIva.padEnd(1, " "));
      itemReq.input("telefono", clienteTelefono.padEnd(14, " "));

      await itemReq.query(`
        INSERT INTO [${dbTransas}].dbo.Transas
          (Cod, Boleta, Itm, Tipo, TipoFac, Sucursal, Deposito, Terminal, Fechora, Producto,
           Cant, Precio, Impo, Total, Costo, Efectivo, Tarjeta, Deuda, Vuelto, Sena,
           Descuento, Recargo, ImpoIva, ImpoCos, InicioCaja, NroCierreCaja, PorceDescuento,
           Observaciones, MovCaja, Concepto, CodTarjeta, NroTarjeta, ListaPrecio,
           Usuario, Empleado, Proveedor, Nroped, NroMostra, NroTransa,
           Telefono, Cliente, Nombre, Calle, Nume, PisoDto, Entre1, Entre2,
           Localidad, CUIT, IVA, FechoraEntregar, Anulado, TalleColor,
           Stkinicial, FillerNum1, FillerNum2, FillerNum3, FillerNum4, FillerNum5,
           Filler1, Filler2, Filler3, FillerBit1, FillerBit2, FillerBit3, FillerBit4, FillerBit5)
        VALUES
          (@cod, @boleta, @itm, 'I', ' ', @suc, '0  ', 0, @fechora, @producto,
           @cant, @precio, @impo, @total, 0, 0, 0, 0, 0, 0,
           0, 0, 0, 0, 0, 0, 0,
           '', ' ', '', '    ', '', @listaPrecio,
           '      0', @empleado, '       ', '', @nroMostra, @nroTransa,
           @telefono, @cliente, @nombre, @calle, @nume, @pisoDto, '', '',
           @localidad, @cuit, @iva, '              ', ' ', '',
           0, 0, 0, 0, 0, 0,
           'POS', '', '', 0, 0, 0, 0, 0)
      `);

      nextCod++;
    }

    // Update client saldo if cuenta corriente was used
    if (deuda > 0 && clienteCod) {
      await pool.request()
        .input("cod", clienteCod.padStart(7, " "))
        .input("deuda", deuda)
        .query(`UPDATE [${dbClientes}].dbo.Clientes SET Saldo = ISNULL(Saldo, 0) + @deuda WHERE Cod = @cod`);
    }

    return NextResponse.json({
      ok: true,
      boleta: boletaCod.trim(),
      nroTransa: nextNroTransa,
      total: totalImpo,
    });
  } catch (error) {
    console.error("POS sale error:", error);
    return NextResponse.json({ error: "Error al registrar la venta" }, { status: 500 });
  }
}
