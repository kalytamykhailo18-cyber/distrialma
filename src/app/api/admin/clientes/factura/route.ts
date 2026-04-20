import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET: get invoice items for a specific boleta
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

    const result = await pool.request().input("boleta", boleta.padStart(9, " ")).query(`
      SELECT
        LTRIM(RTRIM(t.Producto)) AS sku,
        LTRIM(RTRIM(ISNULL(p.Nombre, ''))) AS nombre,
        t.Cant AS cantidad,
        t.Precio AS precio,
        t.Impo AS impo,
        LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unidad,
        ISNULL(TRY_CAST(LTRIM(RTRIM(p.Palabra2)) AS FLOAT), 0) AS pesoPorPieza,
        t.ListaPrecio AS listaPrecio
      FROM [${dbTransas}].dbo.Transas t
      LEFT JOIN [${dbProd}].dbo.Productos p ON p.Cod = t.Producto
      WHERE t.Boleta = @boleta AND t.Tipo = 'I'
      ORDER BY CAST(t.Itm AS INT)
    `);

    const LISTA_LABELS: Record<number, string> = { 1: "Minorista", 2: "Mayorista", 3: "Especial", 4: "Caja Cerrada", 5: "PedidosYa" };

    return NextResponse.json({
      items: result.recordset.map((i: { sku: string; nombre: string; cantidad: number; precio: number; impo: number; unidad: string; pesoPorPieza: number; listaPrecio: number }) => {
        const isKg = i.unidad === "KG";
        const pesoPieza = Number(i.pesoPorPieza) || 0;
        const cant = Number(i.cantidad);
        // Estimate units: if peso known, divide. If not, each line = 1 unit
        let unidadesAprox: number | null = null;
        if (isKg && cant > 0) {
          unidadesAprox = pesoPieza > 0 ? Math.max(1, Math.round(cant / pesoPieza)) : 1;
        }
        return {
          sku: i.sku,
          nombre: i.nombre,
          cantidad: cant,
          precio: Number(i.precio),
          impo: Number(i.impo),
          unidad: i.unidad,
          unidadesAprox,
          listaPrecio: Number(i.listaPrecio) || 0,
          listaLabel: LISTA_LABELS[Number(i.listaPrecio)] || `Lista ${i.listaPrecio}`,
        };
      }),
    });
  } catch (error) {
    console.error("Factura error:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
