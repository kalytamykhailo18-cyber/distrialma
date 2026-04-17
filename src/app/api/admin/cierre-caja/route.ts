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
        diferencia: nuevoInicioVal - data.totalEfectivoCaja,
        responsable: userName,
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
      // Round to 2 decimals for decimal(12,2) columns
      const clamp92 = (n: number) => Math.round(n * 100) / 100;
      const cierreCod = String(nextCodNum).padStart(9, " ");
      await pool.request()
        .input("cod", cierreCod)
        .input("suc", suc)
        .input("fechora", fechora)
        .input("inicio", clamp92(nuevoInicioVal))
        .input("efectivo", clamp92(data.ventas.efectivo))
        .input("tarjeta", clamp92(data.ventas.tarjeta))
        .input("deuda", clamp92(data.ventas.deuda))
        .input("retiros", clamp92(data.retiros))
        .input("impoCos", clamp92(data.inicioCaja))
        .input("totalVentas", clamp92(data.ventas.total))
        .input("nroCierre", nextCierre)
        .input("totalCaja", clamp92(data.totalEfectivoCaja))
        .input("diferencia", clamp92(nuevoInicioVal - data.totalEfectivoCaja))
        .input("obs", userName)
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
             0, -@tarjeta, 0, @totalCaja, 0, @efectivo, @tarjeta, 0, @diferencia, @inicio,
             @retiros, 0, @totalVentas, @impoCos, @inicio, @nroCierre, 0,
             '', '', @obs, '', '', 0,
             @obs, '', '', '', '', '',
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
            html: (() => {
              const f = (n: number) => "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2 });
              const diferencia = nuevoInicioVal - data.totalEfectivoCaja;
              const diffLabel = diferencia >= 0 ? "Sobrante" : "Faltante";
              const diffColor = diferencia >= 0 ? "#16a34a" : "#dc2626";
              let retirosHtml = "";
              if (data.retirosDetalle && data.retirosDetalle.length > 0) {
                retirosHtml = data.retirosDetalle.map((r: { concepto: string; total: number }) =>
                  `<li>${r.concepto}: ${f(r.total)}</li>`
                ).join("");
                retirosHtml = `<ul style="margin:4px 0">${retirosHtml}</ul>`;
              }
              return `
              <h2>Cierre de Caja — Sucursal ${suc}</h2>
              <p><strong>Fecha:</strong> ${fecha}</p>
              <p><strong>Responsable:</strong> ${userName}</p>
              <table style="border-collapse:collapse;width:100%;max-width:400px">
                <tr><td>Ventas:</td><td style="text-align:right"><strong>${data.ventas.cantidad}</strong></td></tr>
                <tr><td>Total ventas:</td><td style="text-align:right">${f(data.ventas.total)}</td></tr>
                <tr><td>Efectivo:</td><td style="text-align:right">${f(data.ventas.efectivo)}</td></tr>
                <tr><td>Tarjeta:</td><td style="text-align:right">${f(data.ventas.tarjeta)}</td></tr>
                <tr><td>Retiros (efectivo):</td><td style="text-align:right"><strong>${f(data.retiros)}</strong></td></tr>
              </table>
              ${retirosHtml}
              <hr>
              <table style="border-collapse:collapse;width:100%;max-width:400px">
                <tr><td>Total efectivo en caja:</td><td style="text-align:right">${f(data.totalEfectivoCaja)}</td></tr>
                <tr><td>Inicio de caja siguiente:</td><td style="text-align:right">${f(nuevoInicioVal)}</td></tr>
                <tr style="color:${diffColor}"><td><strong>${diffLabel}:</strong></td><td style="text-align:right"><strong>${f(Math.abs(diferencia))}</strong></td></tr>
              </table>
              <p>Ver detalle completo en el PDF adjunto.</p>
              <hr>
              <p style="color: #999; font-size: 12px;">Generado automáticamente por distrialma.com.ar</p>
            `})(),
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

    // Enqueue print job for silent printing
    if (pdfBase64) {
      try {
        await prisma.printJob.create({
          data: {
            tipo: "cierre",
            filename: `CierreCaja-Suc${suc}-${new Date().toISOString().slice(0, 10)}.pdf`,
            pdfBase64,
            sucursal: suc,
          },
        });
      } catch (e) { console.error("Print queue error:", e); }
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
    WHERE LTRIM(RTRIM(MovCaja)) IN ('R', 'I', 'P', 'p')
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
      AND ISNULL(Total, 0) > 0
  `);

  // Voided transaction details with employee names
  const dbEmpleados = getDbName("empleados");
  const anuladasDetalle = await pool.request().input("suc", sucursal).input("cierreCod", parseInt(cierreCod) || 0).query(`
    SELECT
      LTRIM(RTRIM(t.Boleta)) AS boleta,
      LTRIM(RTRIM(ISNULL(t.Nombre,''))) AS cliente,
      t.Total AS total,
      LTRIM(RTRIM(t.Fechora)) AS fechora,
      LTRIM(RTRIM(ISNULL(eu.Nombre, t.Usuario))) AS usuario,
      LTRIM(RTRIM(ISNULL(ee.Nombre, t.Empleado))) AS empleado
    FROM [${dbTransas}].dbo.Transas t
    LEFT JOIN [${dbEmpleados}].dbo.Empleados eu ON eu.Cod COLLATE Modern_Spanish_CI_AS = t.Usuario COLLATE Modern_Spanish_CI_AS
    LEFT JOIN [${dbEmpleados}].dbo.Empleados ee ON ee.Cod COLLATE Modern_Spanish_CI_AS = t.Empleado COLLATE Modern_Spanish_CI_AS
    WHERE t.Tipo = 'V'
      AND LTRIM(RTRIM(t.Sucursal)) = @suc
      AND CAST(LTRIM(RTRIM(t.Cod)) AS BIGINT) > @cierreCod
      AND t.Anulado IS NOT NULL AND LTRIM(RTRIM(t.Anulado)) != '' AND t.Anulado != ' '
      AND ISNULL(t.Total, 0) > 0
    ORDER BY t.Fechora DESC
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
  const retirosList = movimientos.recordset.filter((m: { tipo: string }) => m.tipo === "R");
  const retiros = retirosList.reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);
  // Group retiros by concepto
  const retirosMap = new Map<string, number>();
  for (const m of retirosList) {
    const key = ((m as { concepto: string }).concepto || "Sin concepto").toUpperCase();
    retirosMap.set(key, (retirosMap.get(key) || 0) + (m as { efectivo: number }).efectivo);
  }
  const retirosDetalle = Array.from(retirosMap.entries()).map(([concepto, total]) => ({ concepto, total }));

  const ingresos = movimientos.recordset
    .filter((m: { tipo: string }) => m.tipo === "I")
    .reduce((s: number, m: { efectivo: number }) => s + m.efectivo, 0);
  const pagos = movimientos.recordset
    .filter((m: { tipo: string }) => m.tipo === "P" || m.tipo === "p")
    .reduce((s: number, m: { efectivo: number }) => s + Math.abs(m.efectivo), 0);

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
      monto: Math.abs(m.efectivo) || Math.abs(m.total),
      fechora: m.fechora,
    })),
    retiros,
    retirosDetalle,
    ingresos,
    pagos,
    anuladas: {
      cantidad: anuladas.recordset[0]?.cnt || 0,
      total: anuladas.recordset[0]?.total || 0,
      detalle: anuladasDetalle.recordset.map((a: { boleta: string; cliente: string; total: number; fechora: string; usuario: string; empleado: string }) => ({
        boleta: a.boleta,
        cliente: a.cliente,
        total: a.total,
        fechora: a.fechora,
        usuario: a.usuario,
        empleado: a.empleado,
      })),
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
