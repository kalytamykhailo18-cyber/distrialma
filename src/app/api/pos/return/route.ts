import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { boleta, items, motivo, empleadoCod } = await req.json() as {
      boleta: string;
      items: Array<{ sku: string; nombre: string; cantidad: number; precio: number; lista: number }>;
      motivo: string;
      empleadoCod: string;
    };

    if (!boleta || !items?.length || !empleadoCod) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const pool = await getPool();
    const dbTransas = getDbName("transas");

    // Verify original sale exists and is not voided
    const original = await pool.request().input("bol", boleta.padStart(9, " ")).query(`
      SELECT LTRIM(RTRIM(Anulado)) AS anulado, LTRIM(RTRIM(Sucursal)) AS sucursal,
        LTRIM(RTRIM(Cliente)) AS cliente, LTRIM(RTRIM(Nombre)) AS nombre
      FROM [${dbTransas}].dbo.Transas
      WHERE Boleta = @bol AND Tipo = 'V'
    `);

    if (original.recordset.length === 0) {
      return NextResponse.json({ error: "Venta original no encontrada" }, { status: 404 });
    }
    if (original.recordset[0].anulado?.trim()) {
      return NextResponse.json({ error: "La venta ya esta anulada" }, { status: 400 });
    }

    const suc = original.recordset[0].sucursal;
    const clienteCod = original.recordset[0].cliente;
    const clienteNombre = original.recordset[0].nombre;

    // Get next Cod
    const maxResult = await pool.request().query(`SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS BIGINT)) AS maxCod FROM [${dbTransas}].dbo.Transas`);
    let nextCod = Number(maxResult.recordset[0].maxCod || 0) + 1;

    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
    const fechora = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

    const totalReturn = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
    const totalCant = items.reduce((s, i) => s + i.cantidad, 0);
    const returnBoleta = String(nextCod).padStart(9, " ");
    const empCod = empleadoCod.padStart(7, " ");

    // Write return header (Tipo = 'N' for nota de credito / devolucion, negative amounts)
    await pool.request()
      .input("cod", returnBoleta)
      .input("suc", suc.padEnd(3, " "))
      .input("fechora", fechora.padEnd(14, " "))
      .input("cant", -totalCant)
      .input("total", -totalReturn)
      .input("empleado", empCod)
      .input("cliente", clienteCod.padStart(7, " "))
      .input("nombre", clienteNombre)
      .input("obs", (motivo || "Devolucion").substring(0, 80))
      .query(`
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
          (@cod, @cod, '  0', 'N', ' ', @suc, '0  ', 0, @fechora, '       ',
           @cant, 0, @total, @total, 0, @total, 0, 0, 0, 0,
           0, 0, 0, 0, 0, 0, 0,
           @obs, ' ', '', '    ', '', 0,
           '      0', @empleado, '       ', '', '', '',
           '', @cliente, @nombre, '', '', '', '', '',
           '', '', '', '              ', ' ', '',
           0, 0, 0, 0, 0, 0,
           'POS-DEV', '', '', 0, 0, 0, 0, 0)
      `);

    nextCod++;

    // Write return items (negative quantities)
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemCod = String(nextCod).padStart(9, " ");
      await pool.request()
        .input("cod", itemCod)
        .input("boleta", returnBoleta)
        .input("itm", String(i + 1).padStart(3, " "))
        .input("suc", suc.padEnd(3, " "))
        .input("fechora", fechora.padEnd(14, " "))
        .input("producto", item.sku.padStart(7, " "))
        .input("cant", -item.cantidad)
        .input("precio", item.precio)
        .input("impo", -(item.precio * item.cantidad))
        .input("total", -totalReturn)
        .input("listaPrecio", item.lista || 0)
        .input("empleado", empCod)
        .input("cliente", clienteCod.padStart(7, " "))
        .input("nombre", clienteNombre)
        .query(`
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
             '      0', @empleado, '       ', '', '', '',
             '', @cliente, @nombre, '', '', '', '', '',
             '', '', '', '              ', ' ', '',
             0, 0, 0, 0, 0, 0,
             'POS-DEV', '', '', 0, 0, 0, 0, 0)
        `);
      nextCod++;
    }

    console.log(`[RETURN] Boleta ${returnBoleta.trim()} — ${items.length} items, -${totalReturn} — motivo: ${motivo}`);

    return NextResponse.json({
      ok: true,
      returnBoleta: returnBoleta.trim(),
      originalBoleta: boleta,
      itemsReturned: items.length,
      totalReturn,
    });
  } catch (error) {
    console.error("POS return error:", error);
    return NextResponse.json({ error: "Error al procesar devolucion" }, { status: 500 });
  }
}
