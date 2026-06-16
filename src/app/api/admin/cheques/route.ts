import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

// GET: list cheques with filters
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const tipo = searchParams.get("tipo"); // propio | tercero | null (all)
  const estado = searchParams.get("estado"); // en-cartera | en-circulacion | pagado | rechazado | null (all)
  const cuentaId = searchParams.get("cuentaId");
  const search = searchParams.get("search");

  const where: Record<string, unknown> = {};
  if (tipo) where.tipo = tipo;
  if (estado) where.estado = estado;
  if (cuentaId) where.cuentaId = Number(cuentaId);
  if (search) {
    where.OR = [
      { numero: { contains: search } },
      { proveedorNombre: { contains: search, mode: "insensitive" } },
      { librador: { contains: search, mode: "insensitive" } },
      { banco: { contains: search, mode: "insensitive" } },
    ];
  }

  try {
    const cheques = await prisma.cheque.findMany({
      where,
      orderBy: { fechaCobro: "asc" },
      include: {
        cuenta: true,
        reemplaza: { select: { id: true, numero: true } },
        reemplazadoPor: { select: { id: true, numero: true } },
      },
    });

    // Summary totals grouped by estado
    const all = await prisma.cheque.findMany({ where: { tipo: tipo || undefined } });
    const enCirculacion = all.filter((c) => c.estado === "en-circulacion");
    const enCartera = all.filter((c) => c.estado === "en-cartera");
    // Normalize bank names: strip diacritics, uppercase, then try the
    // canonical BANCOS mapping.  Without this, "Galicia" vs "GALICIA" vs
    // "Banco Galicia" get registered as different banks in the summary.
    const { getBanco } = await import("@/lib/bancos");
    const canonicalBanco = (raw: string): string => {
      if (!raw) return "Sin banco";
      const upper = raw.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toUpperCase();
      if (!upper) return "Sin banco";
      const hit = getBanco(raw);
      return hit ? hit.nombre : upper;
    };
    const porBanco = new Map<string, { cantidad: number; total: number }>();
    for (const c of enCirculacion) {
      const key = canonicalBanco(c.banco || "");
      const prev = porBanco.get(key) || { cantidad: 0, total: 0 };
      porBanco.set(key, { cantidad: prev.cantidad + 1, total: prev.total + Number(c.monto) });
    }

    return NextResponse.json({
      cheques,
      resumen: {
        enCirculacion: {
          cantidad: enCirculacion.length,
          total: enCirculacion.reduce((s, c) => s + Number(c.monto), 0),
        },
        enCartera: {
          cantidad: enCartera.length,
          total: enCartera.reduce((s, c) => s + Number(c.monto), 0),
        },
        porBanco: Array.from(porBanco.entries()).map(([banco, v]) => ({ banco, ...v })),
      },
    });
  } catch (error) {
    console.error("Error fetching cheques:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// POST: create new cheque
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      tipo, formato, numero, banco, monto, fechaEmision, fechaCobro,
      cuentaId, librador, cuitLibrador, clienteCod,
      proveedorCod, proveedorNombre, estado, observaciones,
      reemplazaId, // if provided, this new cheque replaces an old one (the old one is marked as canjeado)
    } = body;

    if (!tipo || !numero || !banco || !monto || !fechaCobro) {
      return NextResponse.json({ error: "Faltan datos obligatorios" }, { status: 400 });
    }

    const userName = (session.user as { name?: string })?.name || "admin";
    const cheque = await prisma.cheque.create({
      data: {
        tipo,
        formato: formato || "fisico",
        numero,
        banco,
        monto: parseFloat(monto),
        fechaEmision: new Date(fechaEmision || new Date().toISOString().slice(0, 10)),
        fechaCobro: new Date(fechaCobro),
        cuentaId: cuentaId ? Number(cuentaId) : null,
        librador: librador || null,
        cuitLibrador: cuitLibrador || null,
        clienteCod: clienteCod || null,
        proveedorCod: proveedorCod || null,
        proveedorNombre: proveedorNombre || null,
        estado: estado || (tipo === "propio" ? "en-circulacion" : "en-cartera"),
        observaciones: observaciones || null,
        usuario: userName,
        reemplazaId: reemplazaId ? Number(reemplazaId) : null,
      },
    });

    // If this cheque replaces another one, mark the old one as "canjeado"
    if (reemplazaId) {
      await prisma.cheque.update({
        where: { id: Number(reemplazaId) },
        data: { estado: "canjeado", fechaEstado: new Date() },
      });
    }

    // If propio cheque with proveedor, register payment (subtract from proveedor saldo)
    if (tipo === "propio" && proveedorCod && parseFloat(monto) > 0) {
      try {
        const pool = await getPool();
        const dbProd = getDbName("productos");
        const provCodPadded = String(proveedorCod).padStart(7, " ");
        await pool.request()
          .input("cod", provCodPadded)
          .input("monto", Math.round(parseFloat(monto) * 100) / 100)
          .query(`UPDATE [${dbProd}].dbo.Proveedores SET Saldo = ISNULL(Saldo, 0) - @monto WHERE Cod = @cod`);

        await prisma.supplierPayment.create({
          data: {
            proveedorCod: String(proveedorCod),
            proveedorName: proveedorNombre || "",
            monto: Math.round(parseFloat(monto) * 100) / 100,
            concepto: `Cheque #${numero}`,
            usuario: userName,
          },
        });
      } catch (e) { console.error("Error registering cheque payment:", e); }
    }

    return NextResponse.json({ cheque });
  } catch (error) {
    console.error("Error creating cheque:", error);
    return NextResponse.json({ error: "Error al crear" }, { status: 500 });
  }
}

// PATCH: update cheque state or data
export async function PATCH(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const data: Record<string, unknown> = {};
    if (rest.estado !== undefined) { data.estado = rest.estado; data.fechaEstado = new Date(); }
    if (rest.numero !== undefined) data.numero = rest.numero;
    if (rest.banco !== undefined) data.banco = rest.banco;
    if (rest.formato !== undefined) data.formato = rest.formato;
    if (rest.monto !== undefined) data.monto = parseFloat(rest.monto);
    if (rest.fechaEmision !== undefined) data.fechaEmision = new Date(rest.fechaEmision);
    if (rest.fechaCobro !== undefined) data.fechaCobro = new Date(rest.fechaCobro);
    if (rest.cuentaId !== undefined) data.cuentaId = rest.cuentaId ? Number(rest.cuentaId) : null;
    if (rest.librador !== undefined) data.librador = rest.librador;
    if (rest.cuitLibrador !== undefined) data.cuitLibrador = rest.cuitLibrador;
    if (rest.proveedorCod !== undefined) data.proveedorCod = rest.proveedorCod;
    if (rest.proveedorNombre !== undefined) data.proveedorNombre = rest.proveedorNombre;
    if (rest.observaciones !== undefined) data.observaciones = rest.observaciones;

    const cheque = await prisma.cheque.update({ where: { id }, data });
    return NextResponse.json({ cheque });
  } catch (error) {
    console.error("Error updating cheque:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}

// DELETE
export async function DELETE(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "id requerido" }, { status: 400 });
    await prisma.cheque.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
