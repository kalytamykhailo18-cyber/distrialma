import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

/**
 * GET ?cod=...  — returns:
 *   { associated: [{marcaCod, nombre, logoUrl|null}],  available: [{cod, nombre, logoUrl|null}] }
 * `associated` is the explicit ProveedorMarca rows (in order).
 * `available` is the full Marcas list with their logo if any (for the selector).
 */
export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const cod = new URL(req.url).searchParams.get("cod");
  if (!cod) return NextResponse.json({ error: "cod requerido" }, { status: 400 });

  const pool = await getPool();
  const dbProd = getDbName("productos");
  const [marcasQ, assoc, allImages] = await Promise.all([
    pool.request().query(`SELECT LTRIM(RTRIM(Cod)) AS cod, LTRIM(RTRIM([Desc])) AS nombre FROM [${dbProd}].dbo.Marcas ORDER BY [Desc]`),
    prisma.proveedorMarca.findMany({ where: { proveedorCod: cod }, orderBy: { position: "asc" } }),
    prisma.productImage.findMany({ where: { sku: { startsWith: "brand-" } }, orderBy: { position: "asc" } }),
  ]);

  const logoBySku = new Map<string, string>();
  for (const img of allImages) {
    if (!logoBySku.has(img.sku)) logoBySku.set(img.sku, img.filename);
  }
  const nameByMarca = new Map<string, string>(
    (marcasQ.recordset as { cod: string; nombre: string }[]).map((m) => [m.cod, m.nombre])
  );

  const associated = assoc.map((a) => ({
    marcaCod: a.marcaCod,
    nombre: nameByMarca.get(a.marcaCod) || a.marcaCod,
    logoUrl: logoBySku.get(`brand-${a.marcaCod}`) || null,
  }));
  const available = (marcasQ.recordset as { cod: string; nombre: string }[]).map((m) => ({
    cod: m.cod,
    nombre: m.nombre,
    logoUrl: logoBySku.get(`brand-${m.cod}`) || null,
  }));

  return NextResponse.json({ associated, available });
}

/**
 * PUT { cod, marcaCods: string[] } — replaces the whole set of associations for this proveedor.
 * Order in marcaCods is persisted as the `position` field.  Admin only.
 */
export async function PUT(req: NextRequest) {
  const session = await requireStaff();
  if (!session) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  const user = session.user as { role?: string };
  if (user.role !== "admin") {
    return NextResponse.json({ error: "Solo admin" }, { status: 403 });
  }

  try {
    const { cod, marcaCods } = await req.json();
    if (!cod) return NextResponse.json({ error: "cod requerido" }, { status: 400 });
    if (!Array.isArray(marcaCods)) {
      return NextResponse.json({ error: "marcaCods debe ser un array" }, { status: 400 });
    }
    const cleaned = marcaCods
      .map((c: unknown) => (typeof c === "string" ? c.trim() : ""))
      .filter((c) => c.length > 0);

    await prisma.$transaction(async (tx) => {
      await tx.proveedorMarca.deleteMany({ where: { proveedorCod: String(cod) } });
      if (cleaned.length > 0) {
        await tx.proveedorMarca.createMany({
          data: cleaned.map((mc, idx) => ({
            proveedorCod: String(cod),
            marcaCod: mc,
            position: idx,
          })),
        });
      }
    });

    return NextResponse.json({ ok: true, count: cleaned.length });
  } catch (e) {
    console.error("PUT proveedor marcas error:", e);
    return NextResponse.json({ error: "Error al guardar: " + (e as Error).message }, { status: 500 });
  }
}
