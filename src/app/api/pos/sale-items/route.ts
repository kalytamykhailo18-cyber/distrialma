import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const boleta = req.nextUrl.searchParams.get("boleta");
  if (!boleta) return NextResponse.json({ error: "boleta requerida" }, { status: 400 });

  try {
    const pool = await getPool();
    const dbTransas = getDbName("transas");
    const dbProd = getDbName("productos");

    const result = await pool.request().input("bol", boleta.padStart(9, " ")).query(`
      SELECT
        LTRIM(RTRIM(t.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(pr.Nombre, ''))) AS nombre,
        t.Cant AS cantidad,
        t.Precio AS precio,
        t.Impo AS impo,
        t.ListaPrecio AS lista
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos pr ON pr.Cod = t.Producto
      WHERE t.Boleta = @bol AND t.Tipo = 'I'
      ORDER BY CAST(t.Itm AS INT)
    `);

    return NextResponse.json({
      items: result.recordset.map((i: Record<string, unknown>) => ({
        sku: i.sku as string,
        nombre: i.nombre as string,
        cantidad: Number(i.cantidad),
        precio: Number(i.precio),
        impo: Number(i.impo),
        lista: Number(i.lista),
      })),
    });
  } catch (error) {
    console.error("Sale items error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
