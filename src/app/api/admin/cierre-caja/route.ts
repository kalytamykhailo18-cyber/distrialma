import { NextRequest, NextResponse } from "next/server";
import { getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import { Resend } from "resend";

// Using production server for cierre-caja (Server01 testing complete)
import { getPool as getMssqlPool } from "@/lib/mssql";
async function getPool() { return getMssqlPool(); }

export const dynamic = "force-dynamic";

// GET: Load current caja data (read-only)
export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sucursal = req.nextUrl.searchParams.get("sucursal") || "1";

  try {
    const data = await getCajaData(sucursal);
    return NextResponse.json(data);
  } catch (error) {
    console.error("Cierre caja error:", error);
    return NextResponse.json({ error: "Error al cargar datos de caja" }, { status: 500 });
  }
}

// POST: Save cierre record + send email with PDF
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { sucursal, pdfBase64, nuevoInicio, fotos, fotoTicket, empleado } = await req.json();
    const allFotos: string[] = fotos || (fotoTicket ? [fotoTicket] : []);
    const suc = sucursal || "1";
    const userName = empleado || (session.user as { name?: string })?.name || "unknown";
    const nuevoInicioVal = parseFloat(nuevoInicio) || 0;

    // Get current caja data
    const data = await getCajaData(suc);

    // Get email from settings
    const emailSetting = await prisma.setting.findUnique({ where: { key: "cierre_email" } });
    const emailTo = emailSetting?.value || "";

    // Save cierre record
    const cierre = await prisma.cierreCaja.create({
      data: {
        sucursal: suc,
        usuario: userName,
        desde: data.desde,
        cantVentas: data.ventas.cantidad,
        efectivo: data.ventas.efectivo,
        tarjeta: data.ventas.tarjeta,
        deuda: data.ventas.deuda,
        totalVentas: data.ventas.total,
        retiros: data.retiros,
        ingresos: data.ingresos,
        pagos: data.pagos,
        inicioCaja: data.inicioCaja,
        totalCaja: data.totalEfectivoCaja,
        nuevoInicio: nuevoInicioVal,
        emailTo: emailTo || null,
      },
    });

    // Write cierre + apertura to PunTouch
    try {
      const pool = await getPool();
      const dbTransas = getDbName("transas");
      // Use Argentina time (UTC-3) to match PunTouch local clock
      const now = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
      const fechora = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

      // Get next Cod and NroCierreCaja
      const maxResult = await pool.request().query(`
        SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS INT)) AS maxCod,
               MAX(NroCierreCaja) AS maxCierre
        FROM [${dbTransas}].dbo.Transas
        WHERE LEN(LTRIM(RTRIM(Cod))) <= 7
      `);
      let nextCodNum = (maxResult.recordset[0]?.maxCod || 0) + 1;
      const nextCierre = (maxResult.recordset[0]?.maxCierre || 0) + 1;

      // 1. Write cierre record (Tipo = 'C')
      const cierreCod = String(nextCodNum).padStart(9, " ");
      await pool.request()
        .input("cod", cierreCod)
        .input("suc", suc)
        .input("fechora", fechora)
        .input("inicio", nuevoInicioVal)
        .input("efectivo", data.totalEfectivoCaja)
        .input("tarjeta", data.ventas.tarjeta)
        .input("deuda", data.ventas.deuda)
        .input("retiros", data.retiros)
        .input("impoCos", data.inicioCaja)
        .input("nroCierre", nextCierre)
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
            (@cod, @cod, '', 'C', '', @suc, '', 0, @fechora, '',
             0, -@tarjeta, 0, @deuda, 0, @efectivo, @tarjeta, -@deuda, 0, @inicio,
             @retiros, 0, 0, @impoCos, @inicio, @nroCierre, 0,
             '', '', '', '', '', 0,
             '', '', '', '', '', '',
             '', '', '', '', '', '', '', '',
             '', '', '', '', '', '',
             0, 0, 0, 0, 0, 0,
             '', '', '', 0, 0, 0, 0, 0)
        `);
      console.log("PunTouch cierre written: NroCierre", nextCierre, "suc", suc);

      // 2. Write apertura record (Tipo = 'H', MovCaja = 'A')
      if (nuevoInicioVal > 0) {
        nextCodNum++;
        const aperturaCod = String(nextCodNum).padStart(9, " ");
        await pool.request()
          .input("cod", aperturaCod)
          .input("suc", suc)
          .input("fechora", fechora)
          .input("inicio", nuevoInicioVal)
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
              (@cod, @cod, '', 'H', '', @suc, '', 0, @fechora, '',
               0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
               0, 0, 0, 0, @inicio, 0, 0,
               '', 'A', '', '', '', 0,
               '', '', '', '', '', '',
               '', '', '', '', '', '', '', '',
               '', '', '', '', '', '',
               0, 0, 0, 0, 0, 0,
               '', '', '', 0, 0, 0, 0, 0)
          `);
        console.log("PunTouch apertura written:", nuevoInicioVal, "suc", suc);
      }
    } catch (e) {
      console.error("Error writing cierre/apertura to PunTouch:", e);
    }

    // Send email via Resend API (non-blocking)
    let emailSent = false;
    const resendKey = process.env.RESEND_API_KEY || "";
    if (emailTo && pdfBase64 && resendKey) {
      emailSent = true;
      const cierreId = cierre.id;
      (async () => {
        try {
          const resend = new Resend(resendKey);
          const fecha = new Date().toLocaleDateString("es-AR");
          const filename = `CierreCaja-Suc${suc}-${new Date().toISOString().slice(0, 10)}.pdf`;

          await resend.emails.send({
            from: process.env.RESEND_FROM || "Distrialma <onboarding@resend.dev>",
            to: emailTo,
            subject: `Cierre de Caja — Sucursal ${suc} — ${fecha}`,
            html: `
              <h2>Cierre de Caja — Sucursal ${suc}</h2>
              <p><strong>Fecha:</strong> ${fecha}</p>
              <p><strong>Responsable:</strong> ${userName}</p>
              <p><strong>Ventas:</strong> ${data.ventas.cantidad}</p>
              <p><strong>Total:</strong> $${(data.ventas.total || 0).toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
              <p><strong>Inicio de caja siguiente:</strong> $${nuevoInicioVal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
              <p>Ver detalle en el PDF adjunto.</p>
              <hr>
              <p style="color: #999; font-size: 12px;">Generado automáticamente por distrialma.com.ar</p>
            `,
            attachments: [
              {
                filename,
                content: pdfBase64,
              },
              ...allFotos.map((foto: string, i: number) => ({
                filename: `Ticket-Posnet-${i + 1}-${new Date().toISOString().slice(0, 10)}.jpg`,
                content: foto,
              })),
            ],
          });

          await prisma.cierreCaja.update({
            where: { id: cierreId },
            data: { emailSent: true },
          });
          console.log("Cierre email sent to", emailTo);
        } catch (emailErr) {
          console.error("Error sending cierre email:", emailErr);
        }
      })();
    }

    return NextResponse.json({
      ok: true,
      cierreId: cierre.id,
      emailSent,
      emailTo: emailTo || null,
      usuario: userName,
    });
  } catch (error) {
    console.error("Save cierre error:", error);
    return NextResponse.json({ error: "Error al guardar cierre" }, { status: 500 });
  }
}

// Shared function to get caja data
async function getCajaData(sucursal: string) {
  const pool = await getPool();
  const dbTransas = getDbName("transas");

  const lastCierre = await pool.request().input("suc", sucursal).query(`
    SELECT TOP 1 LTRIM(RTRIM(Cod)) AS cod, Fechora, InicioCaja, LTRIM(RTRIM(Sucursal)) AS suc, NroCierreCaja
    FROM [${dbTransas}].dbo.Transas
    WHERE Tipo = 'C'
      AND LTRIM(RTRIM(Sucursal)) = @suc
    ORDER BY Fechora DESC
  `);

  const cierreCod = lastCierre.recordset[0]?.cod?.trim() || "0";
  const desde = lastCierre.recordset[0]?.Fechora?.trim() || "20260101000000";
  const inicioCaja = lastCierre.recordset[0]?.InicioCaja || 0;

  // Filter by Cod > cierre Cod (captures all sales after the cierre record, regardless of timestamp)
  const ventas = await pool.request().input("suc", sucursal).input("cierreCod", parseInt(cierreCod) || 0).query(`
    SELECT
      COUNT(*) AS cantVentas,
      SUM(ISNULL(Efectivo, 0)) AS efectivo,
      SUM(ISNULL(Tarjeta, 0)) AS tarjeta,
      SUM(ISNULL(Deuda, 0)) AS deuda,
      SUM(ISNULL(Total, 0)) AS total,
      MIN(LTRIM(RTRIM(NroTransa))) AS nroDesde,
      MAX(LTRIM(RTRIM(NroTransa))) AS nroHasta
    FROM [${dbTransas}].dbo.Transas
    WHERE Tipo = 'V'
      AND LTRIM(RTRIM(Sucursal)) = @suc
      AND CAST(LTRIM(RTRIM(Cod)) AS BIGINT) > @cierreCod
      AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
  `);

  const movimientos = await pool.request().input("suc", sucursal).input("cierreCod", parseInt(cierreCod) || 0).query(`
    SELECT
      LTRIM(RTRIM(MovCaja)) AS tipo,
      LTRIM(RTRIM(ISNULL(Concepto, ''))) AS concepto,
      ISNULL(Efectivo, 0) AS efectivo,
      ISNULL(Total, 0) AS total,
      LTRIM(RTRIM(Fechora)) AS fechora
    FROM [${dbTransas}].dbo.Transas
    WHERE LTRIM(RTRIM(MovCaja)) IN ('R', 'I', 'P')
      AND LTRIM(RTRIM(Sucursal)) = @suc
      AND CAST(LTRIM(RTRIM(Cod)) AS BIGINT) > @cierreCod
    ORDER BY Fechora ASC
  `);

  const anuladas = await pool.request().input("suc", sucursal).input("cierreCod", parseInt(cierreCod) || 0).query(`
    SELECT COUNT(*) AS cnt, SUM(ISNULL(Total, 0)) AS total
    FROM [${dbTransas}].dbo.Transas
    WHERE Tipo = 'V'
      AND LTRIM(RTRIM(Sucursal)) = @suc
      AND CAST(LTRIM(RTRIM(Cod)) AS BIGINT) > @cierreCod
      AND Anulado IS NOT NULL AND LTRIM(RTRIM(Anulado)) != '' AND Anulado != ' '
  `);

  // Card payment breakdown by type
  const dbVarios = getDbName("transas").replace("BDTRANSAS", "BDVARIOS");
  const tarjetasDetalle = await pool.request().input("suc", sucursal).input("cierreCod", parseInt(cierreCod) || 0).query(`
    SELECT LTRIM(RTRIM(t.CodTarjeta)) AS cod,
      LTRIM(RTRIM(ISNULL(tj.[Desc], 'Otro'))) AS nombre,
      SUM(t.Tarjeta) AS total, COUNT(*) AS cnt
    FROM [${dbTransas}].dbo.Transas t
    LEFT JOIN [${dbVarios}].dbo.Tarjetas tj ON tj.Cod COLLATE Modern_Spanish_CI_AS = t.CodTarjeta COLLATE Modern_Spanish_CI_AS
    WHERE t.Tipo = 'V' AND t.Tarjeta > 0
      AND LTRIM(RTRIM(t.Sucursal)) = @suc
      AND CAST(LTRIM(RTRIM(t.Cod)) AS BIGINT) > @cierreCod
      AND (t.Anulado IS NULL OR LTRIM(RTRIM(t.Anulado)) = '' OR t.Anulado = ' ')
    GROUP BY t.CodTarjeta, tj.[Desc]
    ORDER BY SUM(t.Tarjeta) DESC
  `);

  const v = ventas.recordset[0];
  const retiros = movimientos.recordset
    .filter((m: { tipo: string }) => m.tipo === "R")
    .reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);
  const ingresos = movimientos.recordset
    .filter((m: { tipo: string }) => m.tipo === "I")
    .reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);
  const pagos = movimientos.recordset
    .filter((m: { tipo: string }) => m.tipo === "P")
    .reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);

  const totalEfectivoCaja = inicioCaja + v.efectivo - retiros + ingresos - pagos;

  const desdeStr = desde.length >= 12
    ? `${desde.slice(6, 8)}/${desde.slice(4, 6)}/${desde.slice(0, 4)} ${desde.slice(8, 10)}:${desde.slice(10, 12)}`
    : desde;

  return {
    sucursal,
    desde: desdeStr,
    desdeRaw: desde,
    nroCaja: lastCierre.recordset[0]?.NroCierreCaja || 0,
    inicioCaja,
    ventas: {
      cantidad: v.cantVentas || 0,
      efectivo: v.efectivo || 0,
      tarjeta: v.tarjeta || 0,
      deuda: v.deuda || 0,
      total: v.total || 0,
      nroDesde: v.nroDesde || "—",
      nroHasta: v.nroHasta || "—",
    },
    movimientos: movimientos.recordset.map((m: { tipo: string; concepto: string; efectivo: number; total: number; fechora: string }) => ({
      tipo: m.tipo === "R" ? "Retiro" : m.tipo === "I" ? "Ingreso" : "Pago proveedor",
      concepto: m.concepto,
      monto: m.efectivo || m.total,
      fechora: m.fechora,
    })),
    retiros,
    ingresos,
    pagos,
    anuladas: {
      cantidad: anuladas.recordset[0]?.cnt || 0,
      total: anuladas.recordset[0]?.total || 0,
    },
    totalEfectivoCaja,
    totalTarjeta: v.tarjeta || 0,
    totalDeuda: v.deuda || 0,
    tarjetasDetalle: tarjetasDetalle.recordset.map((t: { cod: string; nombre: string; total: number; cnt: number }) => ({
      cod: t.cod,
      nombre: t.nombre,
      total: t.total,
      cantidad: t.cnt,
    })),
  };
}
