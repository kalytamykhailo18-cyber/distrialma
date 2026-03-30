import { NextRequest, NextResponse } from "next/server";
import { getDbName } from "@/lib/mssql";
import sql from "mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";

// Use Server01 for cierre-caja (test server)
const server01Config: sql.config = {
  server: process.env.MSSQL_SERVER01_HOST || process.env.MSSQL_HOST!,
  port: parseInt(process.env.MSSQL_SERVER01_PORT || process.env.MSSQL_PORT || "1433"),
  user: process.env.MSSQL_USER!,
  password: process.env.MSSQL_PASSWORD!,
  options: { encrypt: false, trustServerCertificate: true },
  connectionTimeout: 15000,
  requestTimeout: 15000,
  pool: { max: 3, min: 0, idleTimeoutMillis: 30000 },
};

let server01Pool: sql.ConnectionPool | null = null;

async function getPool(): Promise<sql.ConnectionPool> {
  if (server01Pool && server01Pool.connected) return server01Pool;
  server01Pool = await new sql.ConnectionPool(server01Config).connect();
  return server01Pool;
}

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
    const { sucursal, pdfBase64, nuevoInicio, fotoTicket, empleado } = await req.json();
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

    // Write apertura to PunTouch for next day
    if (nuevoInicioVal > 0) {
      try {
        const pool = await getPool();
        const dbTransas = getDbName("transas");
        // Get next Cod
        const maxCod = await pool.request().query(`SELECT MAX(CAST(LTRIM(RTRIM(Cod)) AS BIGINT)) AS maxCod FROM [${dbTransas}].dbo.Transas`);
        const nextCod = String((maxCod.recordset[0]?.maxCod || 0) + 1).padStart(9, " ");
        const now = new Date();
        const fechora = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;

        await pool.request()
          .input("cod", nextCod)
          .input("suc", suc)
          .input("fechora", fechora)
          .input("inicio", nuevoInicioVal)
          .query(`
            INSERT INTO [${dbTransas}].dbo.Transas (Cod, Boleta, Tipo, Sucursal, Fechora, MovCaja, InicioCaja, Efectivo, Total, Terminal)
            VALUES (@cod, @cod, 'H', @suc, @fechora, 'A', @inicio, 0, 0, 0)
          `);
        console.log("PunTouch apertura written:", nuevoInicioVal, "for sucursal", suc);
      } catch (e) {
        console.error("Error writing apertura to PunTouch:", e);
      }
    }

    // Send email if configured
    let emailSent = false;
    if (emailTo && pdfBase64) {
      try {
        const smtpHost = process.env.SMTP_HOST || "smtp.gmail.com";
        const smtpPort = parseInt(process.env.SMTP_PORT || "587");
        const smtpUser = process.env.SMTP_USER || "";
        const smtpPass = process.env.SMTP_PASS || "";

        if (smtpUser && smtpPass) {
          const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465,
            auth: { user: smtpUser, pass: smtpPass },
          });

          const fecha = new Date().toLocaleDateString("es-AR");
          const filename = `CierreCaja-Suc${suc}-${new Date().toISOString().slice(0, 10)}.pdf`;

          await transporter.sendMail({
            from: smtpUser,
            to: emailTo,
            subject: `Cierre de Caja — Sucursal ${suc} — ${fecha}`,
            html: `
              <h2>Cierre de Caja — Sucursal ${suc}</h2>
              <p><strong>Fecha:</strong> ${fecha}</p>
              <p><strong>Responsable:</strong> ${userName}</p>
              <p><strong>Ventas:</strong> ${data.ventas.cantidad}</p>
              <p><strong>Total:</strong> $${data.ventas.total.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
              <p><strong>Inicio de caja siguiente:</strong> $${nuevoInicioVal.toLocaleString("es-AR", { minimumFractionDigits: 2 })}</p>
              <p>Ver detalle en el PDF adjunto.</p>
              <hr>
              <p style="color: #999; font-size: 12px;">Generado automáticamente por distrialma.com.ar</p>
            `,
            attachments: [
              {
                filename,
                content: Buffer.from(pdfBase64, "base64"),
                contentType: "application/pdf",
              },
              ...(fotoTicket ? [{
                filename: `Ticket-Posnet-${new Date().toISOString().slice(0, 10)}.jpg`,
                content: Buffer.from(fotoTicket, "base64"),
                contentType: "image/jpeg",
              }] : []),
            ],
          });

          emailSent = true;
          await prisma.cierreCaja.update({
            where: { id: cierre.id },
            data: { emailSent: true },
          });
        }
      } catch (emailErr) {
        console.error("Error sending cierre email:", emailErr);
      }
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

  const lastApertura = await pool.request().input("suc", sucursal).query(`
    SELECT TOP 1 Fechora, InicioCaja
    FROM [${dbTransas}].dbo.Transas
    WHERE LTRIM(RTRIM(MovCaja)) = 'A'
      AND LTRIM(RTRIM(Sucursal)) = @suc
    ORDER BY Fechora DESC
  `);

  // Default to today 00:00 if no apertura found (not Jan 1)
  const today = new Date();
  const todayStr = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}000000`;
  const desde = lastApertura.recordset[0]?.Fechora?.trim() || todayStr;
  const inicioCaja = lastApertura.recordset[0]?.InicioCaja || 0;

  const ventas = await pool.request().input("suc", sucursal).input("desde", desde).query(`
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
      AND Fechora >= @desde
      AND (Anulado IS NULL OR LTRIM(RTRIM(Anulado)) = '' OR Anulado = ' ')
  `);

  const movimientos = await pool.request().input("suc", sucursal).input("desde", desde).query(`
    SELECT
      LTRIM(RTRIM(MovCaja)) AS tipo,
      LTRIM(RTRIM(ISNULL(Concepto, ''))) AS concepto,
      ISNULL(Efectivo, 0) AS efectivo,
      ISNULL(Total, 0) AS total,
      LTRIM(RTRIM(Fechora)) AS fechora
    FROM [${dbTransas}].dbo.Transas
    WHERE LTRIM(RTRIM(MovCaja)) IN ('R', 'I', 'P')
      AND LTRIM(RTRIM(Sucursal)) = @suc
      AND Fechora >= @desde
    ORDER BY Fechora ASC
  `);

  const anuladas = await pool.request().input("suc", sucursal).input("desde", desde).query(`
    SELECT COUNT(*) AS cnt, SUM(ISNULL(Total, 0)) AS total
    FROM [${dbTransas}].dbo.Transas
    WHERE Tipo = 'V'
      AND LTRIM(RTRIM(Sucursal)) = @suc
      AND Fechora >= @desde
      AND Anulado IS NOT NULL AND LTRIM(RTRIM(Anulado)) != '' AND Anulado != ' '
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
    inicioCaja,
    ventas: {
      cantidad: v.cantVentas,
      efectivo: v.efectivo,
      tarjeta: v.tarjeta,
      deuda: v.deuda,
      total: v.total,
      nroDesde: v.nroDesde,
      nroHasta: v.nroHasta,
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
    totalTarjeta: v.tarjeta,
    totalDeuda: v.deuda,
  };
}
