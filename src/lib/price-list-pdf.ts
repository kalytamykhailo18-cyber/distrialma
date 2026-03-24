import jsPDF from "jspdf";

export type PriceListFormat = "lista" | "catalogo" | "combinado";

export const FORMAT_LABELS: Record<PriceListFormat, string> = {
  lista: "Lista simple",
  catalogo: "Catálogo por rubro",
  combinado: "Combinado (rubro + marca)",
};

interface PriceProduct {
  sku: string;
  name: string;
  category: string;
  brand: string;
  unit: string;
  precioMayorista: number;
  precioEspecial?: number;
  precioCajaCerrada: number;
  cantidadPorCaja: string;
}

function fmtPrice(price: number): string {
  if (!price) return "-";
  return "$" + price.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function addHeader(doc: jsPDF, pageW: number, date: string, isEspecial: boolean) {
  doc.setFillColor(251, 161, 71);
  doc.rect(0, 0, pageW, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255);
  const title = isEspecial
    ? "DISTRIALMA — Lista de Precios Especial"
    : "DISTRIALMA — Lista de Precios";
  doc.text(title, pageW / 2, 8, { align: "center" });
  doc.setFontSize(9);
  doc.text(date, pageW / 2, 12, { align: "center" });
  doc.setTextColor(0);
}

function addFooter(doc: jsPDF, pageW: number, pageH: number, pageNum: number) {
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Página ${pageNum}`, pageW / 2, pageH - 5, { align: "center" });
  doc.text("Precios sujetos a cambio sin previo aviso. Precios en efectivo.", pageW / 2, pageH - 2, { align: "center" });
  doc.setTextColor(0);
}

function tableHeader(doc: jsPDF, y: number, showBrand: boolean, isEspecial: boolean): number {
  doc.setFillColor(240, 240, 240);
  doc.rect(10, y - 3, 190, 5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(80);
  doc.text("SKU", 12, y);
  doc.text("Producto", 28, y);
  if (showBrand) doc.text("Marca", 105, y);
  doc.text("UN", 130, y);
  if (isEspecial) {
    doc.text("Especial", 142, y);
  } else {
    doc.text("Mayorista", 142, y);
  }
  doc.text("Caja Cerr.", 165, y);
  doc.text("x Caja", 190, y);
  doc.setTextColor(0);
  return y + 5;
}

function tableRow(doc: jsPDF, p: PriceProduct, y: number, showBrand: boolean, isEspecial: boolean): number {
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.text(p.sku, 12, y);
  doc.text(p.name.substring(0, 48), 28, y);
  if (showBrand) doc.text((p.brand || "").substring(0, 15), 105, y);
  doc.text(p.unit || "UN", 130, y);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 100, 0);
  if (isEspecial) {
    const precio = p.precioEspecial && p.precioEspecial > 0 ? p.precioEspecial : p.precioMayorista;
    doc.text(fmtPrice(precio), 142, y);
  } else {
    doc.text(fmtPrice(p.precioMayorista), 142, y);
  }
  doc.setTextColor(200, 80, 0);
  doc.text(p.precioCajaCerrada > 0 ? fmtPrice(p.precioCajaCerrada) : "-", 165, y);
  doc.setTextColor(0);
  doc.setFont("helvetica", "normal");
  const caja = parseInt(p.cantidadPorCaja) || 0;
  doc.text(caja > 0 ? `x${caja}` : "-", 190, y);
  return y + 4;
}

export function generatePriceListPdf(
  format: PriceListFormat,
  products: PriceProduct[],
  isEspecial = false
): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = 210;
  const pageH = 297;
  const date = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
  let pageNum = 1;
  let y = 20;

  addHeader(doc, pageW, date, isEspecial);
  y = 20;

  if (format === "lista") {
    y = tableHeader(doc, y, true, isEspecial);
    for (const p of products) {
      if (y > pageH - 15) {
        addFooter(doc, pageW, pageH, pageNum);
        doc.addPage();
        pageNum++;
        addHeader(doc, pageW, date, isEspecial);
        y = 20;
        y = tableHeader(doc, y, true, isEspecial);
      }
      y = tableRow(doc, p, y, true, isEspecial);
    }
  } else if (format === "catalogo") {
    const byCategory = new Map<string, PriceProduct[]>();
    for (const p of products) {
      const cat = p.category || "SIN RUBRO";
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(p);
    }

    for (const [cat, prods] of Array.from(byCategory)) {
      if (y > pageH - 30) {
        addFooter(doc, pageW, pageH, pageNum);
        doc.addPage();
        pageNum++;
        addHeader(doc, pageW, date, isEspecial);
        y = 20;
      }

      doc.setFillColor(251, 161, 71);
      doc.rect(10, y - 3, 190, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255);
      doc.text(cat, 12, y + 1);
      doc.setTextColor(0);
      y += 6;

      y = tableHeader(doc, y, true, isEspecial);

      for (const p of prods) {
        if (y > pageH - 15) {
          addFooter(doc, pageW, pageH, pageNum);
          doc.addPage();
          pageNum++;
          addHeader(doc, pageW, date, isEspecial);
          y = 20;
          y = tableHeader(doc, y, true, isEspecial);
        }
        y = tableRow(doc, p, y, true, isEspecial);
      }
      y += 3;
    }
  } else {
    const byCategory = new Map<string, Map<string, PriceProduct[]>>();
    for (const p of products) {
      const cat = p.category || "SIN RUBRO";
      const brand = p.brand || "SIN MARCA";
      if (!byCategory.has(cat)) byCategory.set(cat, new Map());
      const brandMap = byCategory.get(cat)!;
      if (!brandMap.has(brand)) brandMap.set(brand, []);
      brandMap.get(brand)!.push(p);
    }

    for (const [cat, brands] of Array.from(byCategory)) {
      if (y > pageH - 30) {
        addFooter(doc, pageW, pageH, pageNum);
        doc.addPage();
        pageNum++;
        addHeader(doc, pageW, date, isEspecial);
        y = 20;
      }

      doc.setFillColor(251, 161, 71);
      doc.rect(10, y - 3, 190, 6, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(255);
      doc.text(cat, 12, y + 1);
      doc.setTextColor(0);
      y += 6;

      for (const [brand, prods] of Array.from(brands)) {
        if (y > pageH - 20) {
          addFooter(doc, pageW, pageH, pageNum);
          doc.addPage();
          pageNum++;
          addHeader(doc, pageW, date, isEspecial);
          y = 20;
        }

        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100);
        doc.text(brand, 14, y);
        doc.setTextColor(0);
        y += 4;

        y = tableHeader(doc, y, false, isEspecial);

        for (const p of prods) {
          if (y > pageH - 15) {
            addFooter(doc, pageW, pageH, pageNum);
            doc.addPage();
            pageNum++;
            addHeader(doc, pageW, date, isEspecial);
            y = 20;
            y = tableHeader(doc, y, false, isEspecial);
          }
          y = tableRow(doc, p, y, false, isEspecial);
        }
        y += 2;
      }
      y += 3;
    }
  }

  addFooter(doc, pageW, pageH, pageNum);
  return doc;
}
