import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";

export const dynamic = "force-dynamic";

function isAdminOrCosteo(session: { user?: unknown }): boolean {
  const u = session.user as { role?: string; permissions?: string[] } | undefined;
  if (u?.role === "admin") return true;
  return (u?.permissions || []).includes("costeo");
}

/**
 * GET — list all virtual-stock mappings with the product names attached.
 */
export async function GET() {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isAdminOrCosteo(session)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  const mappings = await prisma.virtualStockMapping.findMany({
    orderBy: { createdAt: "desc" },
  });

  // Fetch product names from PunTouch for both hijo and padre
  const skus = Array.from(new Set([...mappings.map((m) => m.skuHijo), ...mappings.map((m) => m.skuPadre)]));
  const nameBySku = new Map<string, string>();
  if (skus.length > 0) {
    try {
      const pool = await getPool();
      const dbProd = getDbName("productos");
      const codList = skus.map((s) => `'${s.padStart(7, " ")}'`).join(",");
      const res = await pool.request().query(`
        SELECT LTRIM(RTRIM(Cod)) AS sku, LTRIM(RTRIM(Nombre)) AS nombre
        FROM [${dbProd}].dbo.Productos
        WHERE Cod IN (${codList})
      `);
      for (const r of res.recordset) nameBySku.set(r.sku, r.nombre);
    } catch { /* names are best-effort */ }
  }

  return NextResponse.json({
    mappings: mappings.map((m) => ({
      id: m.id,
      skuHijo: m.skuHijo,
      skuPadre: m.skuPadre,
      nombreHijo: nameBySku.get(m.skuHijo) || null,
      nombrePadre: nameBySku.get(m.skuPadre) || null,
      ratio: Number(m.ratio),
      targetStock: Number(m.targetStock),
      active: m.active,
      notas: m.notas,
      createdAt: m.createdAt.toISOString(),
    })),
  });
}

/**
 * POST — create a new mapping.
 * Body: { skuHijo, skuPadre, ratio, targetStock, notas? }
 */
export async function POST(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isAdminOrCosteo(session)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const skuHijo = String(body.skuHijo || "").trim();
    const skuPadre = String(body.skuPadre || "").trim();
    const ratio = Number(body.ratio);
    const targetStock = Number(body.targetStock);
    const notas = body.notas ? String(body.notas).substring(0, 200) : null;

    if (!skuHijo || !skuPadre) return NextResponse.json({ error: "skuHijo y skuPadre requeridos" }, { status: 400 });
    if (skuHijo === skuPadre) return NextResponse.json({ error: "skuHijo y skuPadre no pueden ser iguales" }, { status: 400 });
    if (!isFinite(ratio) || ratio <= 0) return NextResponse.json({ error: "ratio debe ser > 0" }, { status: 400 });
    if (!isFinite(targetStock) || targetStock <= 0) return NextResponse.json({ error: "targetStock debe ser > 0" }, { status: 400 });

    // Prevent duplicate (hijo, padre) pairs — they would cumulatively deduct
    // from the padre each night without anyone noticing.
    const dup = await prisma.virtualStockMapping.findFirst({
      where: { skuHijo, skuPadre },
    });
    if (dup) {
      return NextResponse.json({ error: `Ya existe una vinculacion ${skuHijo} → ${skuPadre} (id ${dup.id}). Edita esa en vez de crear otra.` }, { status: 409 });
    }

    // When the same hijo already maps to other padres, force the new mapping's
    // targetStock to match the canonical (oldest) one — the cron only uses one
    // target per hijo and silently ignoring user input here is a footgun.
    const existing = await prisma.virtualStockMapping.findFirst({
      where: { skuHijo },
      orderBy: { id: "asc" },
    });
    const finalTarget = existing ? Number(existing.targetStock) : targetStock;
    if (existing && Number(existing.targetStock) !== targetStock) {
      // Don't error — just align silently and report it in the response so the UI can warn.
      // (UI sends matching value when it sees an existing mapping.)
    }

    const mapping = await prisma.virtualStockMapping.create({
      data: { skuHijo, skuPadre, ratio, targetStock: finalTarget, notas, active: true },
    });
    return NextResponse.json({
      mapping,
      note: existing && Number(existing.targetStock) !== targetStock
        ? `targetStock alineado al de la vinculacion existente para ${skuHijo} (${existing.targetStock})`
        : undefined,
    });
  } catch (e) {
    console.error("POST vinculaciones-stock error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * PUT — update an existing mapping.
 * Body: { id, skuHijo?, skuPadre?, ratio?, targetStock?, active?, notas? }
 */
export async function PUT(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isAdminOrCosteo(session)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    const data: { skuHijo?: string; skuPadre?: string; ratio?: number; targetStock?: number; active?: boolean; notas?: string | null } = {};
    if (body.skuHijo !== undefined) data.skuHijo = String(body.skuHijo).trim();
    if (body.skuPadre !== undefined) data.skuPadre = String(body.skuPadre).trim();
    if (body.ratio !== undefined) {
      const r = Number(body.ratio);
      if (!isFinite(r) || r <= 0) return NextResponse.json({ error: "ratio debe ser > 0" }, { status: 400 });
      data.ratio = r;
    }
    if (body.targetStock !== undefined) {
      const t = Number(body.targetStock);
      if (!isFinite(t) || t <= 0) return NextResponse.json({ error: "targetStock debe ser > 0" }, { status: 400 });
      data.targetStock = t;
    }
    if (body.active !== undefined) data.active = Boolean(body.active);
    if (body.notas !== undefined) data.notas = body.notas ? String(body.notas).substring(0, 200) : null;

    if (data.skuHijo && data.skuPadre && data.skuHijo === data.skuPadre) {
      return NextResponse.json({ error: "skuHijo y skuPadre no pueden ser iguales" }, { status: 400 });
    }

    const mapping = await prisma.virtualStockMapping.update({ where: { id }, data });
    return NextResponse.json({ mapping });
  } catch (e) {
    console.error("PUT vinculaciones-stock error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

/**
 * DELETE — remove a mapping.
 * Body: { id }
 */
export async function DELETE(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!isAdminOrCosteo(session)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const id = Number(body.id);
    if (!Number.isFinite(id) || id <= 0) return NextResponse.json({ error: "id requerido" }, { status: 400 });

    await prisma.virtualStockMapping.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE vinculaciones-stock error:", e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
