import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { getPool, getDbName } from "@/lib/mssql";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await requireStaff();
  if (!session) return NextResponse.json({ error: "No autorizado" }, { status: 401 });

  const q = req.nextUrl.searchParams.get("q") || "";
  if (q.length < 2) return NextResponse.json({ products: [] });

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Get markup setting
    const markupSetting = await prisma.setting.findUnique({ where: { key: "vendedor_markup" } });
    const markup = parseFloat(markupSetting?.value || "3");
    const factor = 1 + markup / 100;

    const result = await pool
      .request()
      .input("q", `%${q}%`)
      .query(`
        SELECT TOP 30
          LTRIM(RTRIM(p.Cod)) AS sku,
          LTRIM(RTRIM(p.Nombre)) AS nombre,
          LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS barcode,
          LTRIM(RTRIM(ISNULL(p.Rubro, ''))) AS rubro,
          LTRIM(RTRIM(ISNULL(p.Unidad, 'UN'))) AS unidad,
          ISNULL(CAST(NULLIF(LTRIM(RTRIM(p.Palabra2)), '') AS FLOAT), 0) AS pesoMayorista,
          LTRIM(RTRIM(ISNULL(p.Palabra1, ''))) AS minimoCompra,
          ISNULL(CAST(NULLIF(LTRIM(RTRIM(p.Palabra3)), '') AS FLOAT), 0) AS cantPorCaja,
          ISNULL(s.Precio2, 0) AS mayorista,
          ISNULL(s.Precio4, 0) AS precioCajaCerrada,
          ISNULL(s.Stk, 0) AS stock
        FROM [${dbProd}].dbo.Productos p
        LEFT JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod AND LTRIM(RTRIM(s.Deposito)) = '0'
        WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
          AND s.Precio2 > 0
          AND s.Stk > 0
          AND (p.Nombre LIKE @q OR p.Cod LIKE @q OR p.Codbar LIKE @q)
        ORDER BY p.Nombre
      `);

    // Get promotional flags
    const promocionales = await prisma.articuloPromocional.findMany();
    const promoSet = new Set(promocionales.map((p) => p.sku));

    const products = result.recordset.map((p: { sku: string; nombre: string; barcode: string; rubro: string; unidad: string; pesoMayorista: number; minimoCompra: string; cantPorCaja: number; mayorista: number; precioCajaCerrada: number; stock: number }) => {
      // Parse minimoCompra: "1 BLISTER DE 20" → 20, "3 UNIDADES" → 3, "1 HORMA" → 1
      const minNums = (p.minimoCompra || "").match(/\d+/g);
      const minCompra = minNums ? parseInt(minNums[minNums.length - 1]) : 0;
      const cantCaja = Number(p.cantPorCaja) || 0;
      const precioCaja = Number(p.precioCajaCerrada) || 0;
      return {
        sku: p.sku,
        name: p.nombre,
        barcode: p.barcode,
        rubro: p.rubro,
        unidad: p.unidad,
        pesoMayorista: Number(p.pesoMayorista) || 0,
        minimoCompra: minCompra,
        minimoCompraText: p.minimoCompra || "",
        cantPorCaja: cantCaja,
        mayorista: Number(p.mayorista),
        precioCajaCerrada: precioCaja > 0 ? Math.round(precioCaja * factor) : 0,
        precioVenta: Math.round(Number(p.mayorista) * factor),
        stock: Number(p.stock),
        promocional: promoSet.has(p.sku),
      };
    });

    return NextResponse.json({ products, markup });
  } catch (error) {
    console.error("Error searching products:", error);
    return NextResponse.json({ error: "Error" }, { status: 500 });
  }
}
