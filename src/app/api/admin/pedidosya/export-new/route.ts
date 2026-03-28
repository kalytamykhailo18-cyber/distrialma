import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const weight = parseInt(req.nextUrl.searchParams.get("weight") || "100");
  const section = req.nextUrl.searchParams.get("section") || "Fiambres y Quesos";

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

    // Get KG products with stock > 0 and Precio5 > 0
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS codbar,
        LTRIM(RTRIM(ISNULL(r.[Desc], ''))) AS rubro,
        LTRIM(RTRIM(ISNULL(m.[Desc], ''))) AS marca,
        ISNULL(s.Precio5, 0) AS precio5,
        ISNULL(s.Stk, 0) AS stock
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      LEFT JOIN [${dbProd}].dbo.Rubros r ON r.Cod = p.Rubro
      LEFT JOIN [${dbProd}].dbo.Marcas m ON m.Cod = p.Marca
      WHERE LTRIM(RTRIM(ISNULL(p.Unidad, ''))) = 'KG'
        AND (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND s.Stk > 0
        AND s.Precio5 > 0
      ORDER BY r.[Desc], p.Nombre
    `);

    // Get Cloudinary images
    const skus = result.recordset.map((r: { sku: string }) => r.sku);
    const images = await prisma.productImage.findMany({
      where: { sku: { in: skus } },
      orderBy: { position: "asc" },
    });
    const imageMap = new Map<string, string>();
    for (const img of images) {
      if (!imageMap.has(img.sku)) imageMap.set(img.sku, img.filename);
    }

    // Build CSV rows matching PedidosYa template
    // Columns: Activo, Codigo de Barras, SKU, Precio, Seccion, Que producto es, Marca, Variante, Contenido, Unidad, Nombre formado, Link/URL Imagen, Descripcion
    const weightKg = weight / 1000;
    const weightLabel = weight >= 1000 ? `${weight / 1000} kg` : `${weight} g`;

    const header = [
      "Activo (SI/NO)",
      "Codigo de Barras",
      "SKU",
      "Precio",
      "Seccion",
      "Que producto es",
      "Marca (brand)",
      "Variante",
      "Contenido",
      "Unidad",
      "Nombre formado",
      "Link/URL de la Imagen",
      "Descripcion",
    ];

    const rows = result.recordset.map((p: {
      sku: string; nombre: string; codbar: string;
      rubro: string; marca: string; precio5: number;
    }) => {
      // Price per weight: Precio5 is per KG (stored as KG price in PunTouch for these)
      const pricePerKg = p.precio5;
      const price = Math.round(pricePerKg * weightKg);

      // Product name parts
      const productType = p.rubro || "Fiambre";
      const brand = p.marca || "";
      const cleanName = p.nombre
        .replace(/\s*KG\s*/gi, "")
        .replace(/\s*K\s*$/i, "")
        .trim();
      const variant = cleanName;
      const content = String(weight);
      const unit = weight >= 1000 ? "kg" : "g";
      const formedName = `${brand ? brand + " " : ""}${cleanName} ${weightLabel}`.trim();

      const imageUrl = imageMap.get(p.sku) || "";

      return [
        "SI",
        p.codbar || "",
        p.sku,
        String(price),
        section,
        productType,
        brand,
        variant,
        content,
        unit,
        formedName,
        imageUrl,
        "",
      ];
    });

    // Generate CSV with BOM for Excel
    const BOM = "\uFEFF";
    const csv = BOM + [header, ...rows].map((r) =>
      r.map((c) => {
        const s = String(c);
        return s.includes(",") || s.includes('"') || s.includes("\n")
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(",")
    ).join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="PedidosYa-Nuevos-${weight}g-${new Date().toISOString().slice(0, 10)}.csv"`,
      },
    });
  } catch (error) {
    console.error("Export PeYa new products error:", error);
    return NextResponse.json({ error: "Error al exportar" }, { status: 500 });
  }
}
