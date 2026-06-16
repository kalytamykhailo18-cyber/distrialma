import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { v2 as cloudinary } from "cloudinary";
import { generateReciboPdf } from "@/lib/recibo-pdf";
import { uploadRecibo } from "@/lib/gdrive";

export const dynamic = "force-dynamic";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

interface ChequeIn {
  tipo: "propio" | "tercero";
  formato?: "fisico" | "echeq";
  numero: string;
  banco: string;
  monto: number;
  fechaEmision: string;
  fechaCobro: string;
  cuentaId?: number | null;
  librador?: string | null;
  cuitLibrador?: string | null;
  fotoDataUrl?: string | null;          // legacy: single image
  fotoDataUrls?: string[] | null;       // new: multiple images per cheque
}

interface ReciboIn {
  proveedorCod: string;
  proveedorName: string;
  cheques?: ChequeIn[];
  efectivo?: { monto: number; imagenDataUrl?: string | null; imagenesDataUrls?: string[] | null } | null;
  transferencia?: { monto: number; referencia?: string | null } | null;
  ajuste?: { monto: number; motivo?: string | null } | null;
  concepto?: string | null;
}

// GET: list recibos for a proveedor
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const cod = searchParams.get("cod");
  if (!cod) return NextResponse.json({ recibos: [] });

  const recibos = await prisma.supplierPayment.findMany({
    where: { proveedorCod: cod, NOT: { tipoPago: "legacy" } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { cheques: true },
  });

  return NextResponse.json({
    recibos: recibos.map((r) => ({
      id: r.id,
      monto: Number(r.monto),
      tipoPago: r.tipoPago,
      montoCheques: Number(r.montoCheques),
      montoEfectivo: Number(r.montoEfectivo),
      montoTransferencia: Number(r.montoTransferencia),
      montoAjuste: Number(r.montoAjuste),
      ajusteMotivo: r.ajusteMotivo,
      transferenciaRef: r.transferenciaRef,
      concepto: r.concepto,
      usuario: r.usuario,
      createdAt: r.createdAt.toISOString(),
      pdfUrl: r.pdfUrl,
      driveUrl: r.driveUrl,
      cantidadCheques: r.cheques.length,
    })),
  });
}

// POST: create a recibo (1 SupplierPayment + N Cheques + saldo update)
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as { role?: string; permissions?: string[]; name?: string };
  const hasRecibos = user.role === "admin" || (user.permissions?.includes("recibos") ?? false);
  if (!hasRecibos) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  try {
    const body = (await req.json()) as ReciboIn;
    const { proveedorCod, proveedorName, cheques = [], efectivo, transferencia, ajuste, concepto } = body;
    if (!proveedorCod || !proveedorName) {
      return NextResponse.json({ error: "Proveedor requerido" }, { status: 400 });
    }

    const montoCheques = cheques.reduce((s, c) => s + (Number(c.monto) || 0), 0);
    const montoEfectivo = efectivo?.monto ? Number(efectivo.monto) : 0;
    const montoTransferencia = transferencia?.monto ? Number(transferencia.monto) : 0;
    // Ajuste is admin-only and can be positive (extra owed, e.g. perceptions) or
    // negative (over-payment / discount).
    const isAdmin = user.role === "admin";
    const montoAjuste = (isAdmin && ajuste?.monto) ? Number(ajuste.monto) : 0;
    const ajusteMotivo = (isAdmin && ajuste?.motivo) ? ajuste.motivo.substring(0, 200) : null;
    const total = Math.round((montoCheques + montoEfectivo + montoTransferencia + montoAjuste) * 100) / 100;
    if (total <= 0) {
      return NextResponse.json({ error: "El total debe ser mayor a 0" }, { status: 400 });
    }

    // Determine tipoPago
    const tipos: string[] = [];
    if (montoCheques > 0) tipos.push("cheques");
    if (montoEfectivo > 0) tipos.push("efectivo");
    if (montoTransferencia > 0) tipos.push("transferencia");
    let tipoPago: string;
    if (tipos.length === 0 && montoAjuste !== 0) {
      tipoPago = "ajuste";
    } else if (tipos.length === 1) {
      tipoPago = tipos[0];
    } else if (tipos.length > 1) {
      tipoPago = "mixto";
    } else {
      tipoPago = "mixto"; // shouldn't reach (total>0 guard above prevents)
    }

    // Upload all cheque photos to Cloudinary first (outside the DB transaction).
    // Accept the new fotoDataUrls array; fall back to single fotoDataUrl.
    const chequePhotos: string[][] = await Promise.all(
      cheques.map(async (c) => {
        const dataUrls: string[] = (() => {
          if (Array.isArray(c.fotoDataUrls)) return c.fotoDataUrls.filter((s) => typeof s === "string" && s);
          if (c.fotoDataUrl) return [c.fotoDataUrl];
          return [];
        })();
        const uploads = await Promise.all(dataUrls.map(async (du) => {
          try {
            const r = await cloudinary.uploader.upload(du, {
              folder: "distrialma/cheques",
              public_id: `cheque-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            });
            return r.secure_url as string;
          } catch (e) {
            console.error("[CHEQUE-UPLOAD]", (e as Error).message);
            return null;
          }
        }));
        return uploads.filter((u): u is string => !!u);
      })
    );

    // Collect all efectivo image dataURLs (new array form first, fall back to single)
    const efectivoDataUrls: string[] = (() => {
      if (efectivo?.imagenesDataUrls && Array.isArray(efectivo.imagenesDataUrls)) {
        return efectivo.imagenesDataUrls.filter((s) => typeof s === "string" && s);
      }
      if (efectivo?.imagenDataUrl) return [efectivo.imagenDataUrl];
      return [];
    })();
    const efectivoImagenesUrls: string[] = (
      await Promise.all(
        efectivoDataUrls.map(async (dataUrl) => {
          try {
            const r = await cloudinary.uploader.upload(dataUrl, {
              folder: "distrialma/pagos-efectivo",
              public_id: `pago-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            });
            return r.secure_url as string;
          } catch (e) {
            console.error("[EFECTIVO-UPLOAD]", (e as Error).message);
            return null;
          }
        })
      )
    ).filter((u): u is string => !!u);
    const efectivoImagenesJson = efectivoImagenesUrls.length > 0 ? JSON.stringify(efectivoImagenesUrls) : null;

    const userName = user.name || "admin";

    // Create the SupplierPayment + Cheques in a Postgres transaction
    const payment = await prisma.$transaction(async (tx) => {
      const sp = await tx.supplierPayment.create({
        data: {
          proveedorCod,
          proveedorName: proveedorName.substring(0, 60),
          monto: total,
          concepto: (concepto || "Recibo de pago").substring(0, 100),
          usuario: userName,
          tipoPago,
          montoCheques,
          montoEfectivo,
          montoTransferencia,
          montoAjuste,
          ajusteMotivo,
          transferenciaRef: transferencia?.referencia?.substring(0, 100) || null,
          efectivoImagenes: efectivoImagenesJson,
        },
      });

      for (let i = 0; i < cheques.length; i++) {
        const c = cheques[i];
        await tx.cheque.create({
          data: {
            tipo: c.tipo,
            formato: c.formato || "fisico",
            numero: c.numero.substring(0, 30),
            banco: c.banco.substring(0, 60),
            monto: Number(c.monto),
            fechaEmision: new Date(c.fechaEmision + "T00:00:00"),
            fechaCobro: new Date(c.fechaCobro + "T00:00:00"),
            cuentaId: c.tipo === "propio" ? c.cuentaId || null : null,
            librador: c.tipo === "tercero" ? c.librador?.substring(0, 100) || null : null,
            cuitLibrador: c.tipo === "tercero" ? c.cuitLibrador?.substring(0, 15) || null : null,
            proveedorCod,
            proveedorNombre: proveedorName.substring(0, 120),
            estado: "en-circulacion",
            fechaEstado: new Date(),
            usuario: userName,
            supplierPaymentId: sp.id,
            fotoUrls: chequePhotos[i].length > 0 ? JSON.stringify(chequePhotos[i]) : null,
          },
        });
      }

      return sp;
    });

    // Update PunTouch Proveedores.Saldo (best-effort, outside transaction)
    try {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      await pool
        .request()
        .input("cod", String(proveedorCod).padStart(7, " "))
        .input("monto", total)
        .query(`
          UPDATE [${dbProd}].dbo.Proveedores
          SET Saldo = ISNULL(Saldo, 0) - @monto
          WHERE Cod = @cod
        `);
    } catch (e) {
      console.error("[RECIBO-SALDO]", (e as Error).message);
    }

    // Eager Drive upload — generate PDF and upload synchronously so it's
    // saved in Drive before we return.  Both steps are best-effort: if
    // they fail the recibo is still created and the user can regenerate
    // via the GET endpoint.
    let driveUrl: string | null = null;
    try {
      const pdfBuffer = await generateReciboPdf(payment.id);
      const yearMonth = `${payment.createdAt.getFullYear()}-${String(payment.createdAt.getMonth() + 1).padStart(2, "0")}`;
      const filename = `Recibo-${payment.id}-${proveedorName.replace(/[^a-zA-Z0-9]/g, "_")}.pdf`;
      const driveResult = await uploadRecibo(pdfBuffer, filename, proveedorName, yearMonth);
      if (driveResult?.webViewLink) {
        driveUrl = driveResult.webViewLink;
        await prisma.supplierPayment.update({
          where: { id: payment.id },
          data: { driveUrl },
        });
      }
    } catch (e) {
      console.error("[RECIBO-DRIVE]", (e as Error).message);
    }

    return NextResponse.json({ ok: true, paymentId: payment.id, total, driveUrl });
  } catch (error) {
    console.error("Error creating recibo:", error);
    return NextResponse.json({ error: "Error al crear recibo: " + (error as Error).message }, { status: 500 });
  }
}
