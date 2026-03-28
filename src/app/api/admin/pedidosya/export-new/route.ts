import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";

export async function GET(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const weight = parseInt(req.nextUrl.searchParams.get("weight") || "100");
  const section = req.nextUrl.searchParams.get("section") || "Fiambres y Quesos";

  try {
    const pool = await getPool();
    const dbProd = getDbName("productos");

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

    const skus = result.recordset.map((r: { sku: string }) => r.sku);
    const images = await prisma.productImage.findMany({
      where: { sku: { in: skus } },
      orderBy: { position: "asc" },
    });
    const imageMap = new Map<string, string>();
    for (const img of images) {
      if (!imageMap.has(img.sku)) imageMap.set(img.sku, img.filename);
    }

    const weightKg = weight / 1000;
    const weightLabel = weight >= 1000 ? `${weight / 1000} kg` : `${weight} g`;

    // Build Excel with ExcelJS (proper styling support)
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Template");

    // Column widths
    ws.columns = [
      { width: 14 },  // A - Activo
      { width: 20 },  // B - Codigo de Barras
      { width: 12 },  // C - SKU
      { width: 12 },  // D - Precio
      { width: 24 },  // E - Seccion
      { width: 24 },  // F - Que producto es
      { width: 20 },  // G - Marca
      { width: 38 },  // H - Variante
      { width: 14 },  // I - Contenido
      { width: 12 },  // J - Unidad
      { width: 48 },  // K - Nombre formado
      { width: 65 },  // L - Imagen URL
      { width: 22 },  // M - Descripcion
      { width: 14 },  // N - Impuestos
      { width: 22 },  // O - Validation
    ];

    const thinBorder: Partial<ExcelJS.Borders> = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };

    // Row 1 — Headers
    const headerData = [
      "Activo (SI/NO)", "Codigo de Barras", "SKU", "Precio", "Seccion",
      "Que producto es", "Marca (brand)", "Variante", "Contenido",
      "Unidad", "Nombre formado", "Link/URL de la Imagen", "Descripcion",
      "Impuestos", "Validation INFO",
    ];
    const headerRow = ws.addRow(headerData);
    headerRow.height = 28;

    // Color-code headers like original template
    const headerColors: Record<number, string> = {
      // A-E: Red (mandatory always)
      1: "FFFA0050", 2: "FFFA0050", 3: "FFFA0050", 4: "FFFA0050", 5: "FFFA0050",
      // F-J: Orange (mandatory for new products)
      6: "FFFF9900", 7: "FFFF9900", 8: "FFFF9900", 9: "FFFF9900", 10: "FFFF9900",
      // K: Gray (auto-calculated)
      11: "FFB7B7B7",
      // L: Orange (image, mandatory for new)
      12: "FFFF9900",
      // M: Yellow (optional)
      13: "FFFFFF00",
      // N: Blue (taxes)
      14: "FFC9DAF8",
      // O: Gray (validation)
      15: "FFB7B7B7",
    };

    headerRow.eachCell((cell, colNumber) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: headerColors[colNumber] || "FFFA0050" },
      };
      cell.font = { bold: true, size: 11, color: { argb: "FF000000" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = thinBorder;
    });

    // Data rows
    for (const p of result.recordset as Array<{
      sku: string; nombre: string; codbar: string;
      rubro: string; marca: string; precio5: number;
    }>) {
      const price = Math.round(p.precio5 * weightKg);
      const brand = p.marca || "";
      const cleanName = p.nombre.replace(/\s*KG\s*/gi, "").replace(/\s*K\s*$/i, "").trim();
      const formedName = `${brand ? brand + " " : ""}${cleanName} ${weightLabel}`.trim();
      const imageUrl = imageMap.get(p.sku) || "";

      const row = ws.addRow([
        "SI", p.codbar || "", p.sku, price, section,
        p.rubro || "Fiambre", brand, cleanName, weight,
        weight >= 1000 ? "kg" : "g", formedName, imageUrl, "",
        "", "",
      ]);

      row.eachCell((cell) => {
        cell.alignment = { horizontal: "left", vertical: "middle" };
        cell.border = thinBorder;
        cell.font = { size: 11 };
      });
    }

    // Freeze panes (freeze row 1 and 2)
    ws.views = [{ state: "frozen", ySplit: 1 }];

    const buffer = await wb.xlsx.writeBuffer();

    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="PedidosYa-Nuevos-${weight}g-${new Date().toISOString().slice(0, 10)}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("Export PeYa new products error:", error);
    return NextResponse.json({ error: "Error al exportar" }, { status: 500 });
  }
}
