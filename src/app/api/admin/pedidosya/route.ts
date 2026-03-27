import { NextRequest, NextResponse } from "next/server";
import { getPool, getDbName } from "@/lib/mssql";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

const PEYA_GRAPHQL = "https://catalog-vss-api-latam.deliveryhero.io/graphql";
const VENDOR = { globalEntityId: "PY_AR", platformVendorId: "319352" };

async function getPeyaToken(): Promise<string | null> {
  const setting = await prisma.setting.findUnique({ where: { key: "peya_access_token" } });
  return setting?.value || null;
}

async function fetchPeyaProducts(token: string): Promise<Array<{ sku: string; name: string; price: number; barcodes: string[] }>> {
  const allProducts: Array<{ sku: string; name: string; price: number; barcodes: string[] }> = [];
  let page = 1;
  const pageSize = 100;

  while (true) {
    const res = await fetch(PEYA_GRAPHQL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-client-source": "one-web",
      },
      body: JSON.stringify({
        operationName: "GetProducts",
        query: `query GetProducts($filter: ProductFilter!, $page: PageInput!) {
          products(filter: $filter, page: $page) {
            items { sku name pieceBarcodes price active }
            pagedResult { itemCount pageSize }
          }
        }`,
        variables: {
          filter: { vendorIdentifier: VENDOR, locale: "en", active: true },
          page: { pageNumber: page, pageSize },
        },
      }),
    });

    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0]?.message || "GraphQL error");

    const items = data.data.products.items;
    const total = data.data.products.pagedResult.itemCount;

    for (const item of items) {
      allProducts.push({
        sku: item.sku,
        name: item.name,
        price: item.price,
        barcodes: item.pieceBarcodes || [],
      });
    }

    if (allProducts.length >= total || items.length < pageSize) break;
    page++;
  }

  return allProducts;
}

async function updatePeyaPrices(
  token: string,
  updates: Array<{ sku: string; price: number }>
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(PEYA_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      operationName: "ProductsUpdate",
      query: `mutation ProductsUpdate($productsUpdate: ProductsUpdate!) {
        productsUpdate(productsUpdate: $productsUpdate) {
          ... on ProductsUpdatedSuccessResult { __typename }
          ... on ProductsUpdateAccepted { __typename }
          ... on ProductsUpdateAsyncAccepted { __typename }
          ... on ProductsUpdateValidationErrors { errors { field message sku } __typename }
        }
      }`,
      variables: {
        productsUpdate: {
          vendorIdentifiers: [VENDOR],
          products: updates.map((u) => ({ sku: u.sku, price: u.price })),
        },
      },
    }),
  });

  const data = await res.json();
  if (data.errors) return { success: false, error: data.errors[0]?.message };

  const result = data.data?.productsUpdate;
  if (result?.__typename === "ProductsUpdateValidationErrors") {
    return { success: false, error: JSON.stringify(result.errors?.slice(0, 5)) };
  }

  return { success: true };
}

// GET: Compare PedidosYa prices with PunTouch Precio5
export async function GET() {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const token = await getPeyaToken();
    if (!token) {
      return NextResponse.json({ error: "Token de PedidosYa no configurado. Iniciá sesión primero." }, { status: 400 });
    }

    // Fetch PedidosYa products
    const peyaProducts = await fetchPeyaProducts(token);

    // Fetch PunTouch products with Precio5 and barcodes
    const pool = await getPool();
    const dbProd = getDbName("productos");
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM(p.Cod)) AS sku,
        LTRIM(RTRIM(p.Nombre)) AS nombre,
        LTRIM(RTRIM(ISNULL(p.Codbar, ''))) AS codbar,
        ISNULL(s.Precio5, 0) AS precio5
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND s.Precio5 > 0
    `);

    // Build lookup maps: barcode → product, SKU → product
    type PtProd = { sku: string; nombre: string; precio5: number };
    const puntouchByBarcode = new Map<string, PtProd>();
    const puntouchBySku = new Map<string, PtProd>();
    for (const row of result.recordset) {
      const prod = { sku: row.sku, nombre: row.nombre, precio5: row.precio5 };
      // Map by SKU (PunTouch Cod)
      puntouchBySku.set(row.sku, prod);
      if (row.codbar) {
        // Map by barcode and stripped barcode
        puntouchByBarcode.set(row.codbar, prod);
        const stripped = row.codbar.replace(/^0+/, "");
        puntouchByBarcode.set(stripped, prod);
      }
    }

    // Compare prices
    const changes: Array<{
      peyaSku: string;
      peyaName: string;
      barcode: string;
      puntouchSku: string;
      currentPrice: number;
      newPrice: number;
    }> = [];
    let matched = 0;
    let unmatched = 0;

    for (const peyaProd of peyaProducts) {
      let ptProd: PtProd | null = null;

      // 1. Try matching by barcode (EAN)
      for (const bc of peyaProd.barcodes) {
        ptProd = puntouchByBarcode.get(bc) || puntouchByBarcode.get(bc.replace(/^0+/, "")) || null;
        if (ptProd) break;
      }

      // 2. Fallback: try matching by PedidosYa SKU = PunTouch Cod
      if (!ptProd) {
        ptProd = puntouchBySku.get(peyaProd.sku) || null;
      }

      if (!ptProd) {
        unmatched++;
        continue;
      }

      matched++;
      if (Math.round(ptProd.precio5) !== Math.round(peyaProd.price)) {
        changes.push({
          peyaSku: peyaProd.sku,
          peyaName: peyaProd.name,
          barcode: peyaProd.barcodes[0] || "",
          puntouchSku: ptProd.sku,
          currentPrice: peyaProd.price,
          newPrice: Math.round(ptProd.precio5),
        });
      }
    }

    return NextResponse.json({
      peyaTotal: peyaProducts.length,
      puntouchTotal: result.recordset.length,
      matched,
      unmatched,
      changes,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("PedidosYa sync error:", error);
    if (msg.includes("401") || msg.includes("Unauthorized") || msg.includes("expired")) {
      return NextResponse.json({ error: "Token expirado. Necesitás volver a iniciar sesión en PedidosYa." }, { status: 401 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST: Apply price updates to PedidosYa
export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { updates } = await req.json();
    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
    }

    const token = await getPeyaToken();
    if (!token) {
      return NextResponse.json({ error: "Token no configurado" }, { status: 400 });
    }

    // Update in batches of 50
    let totalUpdated = 0;
    const errors: string[] = [];

    for (let i = 0; i < updates.length; i += 50) {
      const batch = updates.slice(i, i + 50);
      const result = await updatePeyaPrices(token, batch);
      if (result.success) {
        totalUpdated += batch.length;
      } else {
        errors.push(`Batch ${Math.floor(i / 50) + 1}: ${result.error}`);
      }
    }

    return NextResponse.json({ updated: totalUpdated, errors });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("PedidosYa update error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT: Save PedidosYa token (from login flow)
export async function PUT(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { accessToken, refreshToken } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: "Token requerido" }, { status: 400 });
    }

    await prisma.setting.upsert({
      where: { key: "peya_access_token" },
      update: { value: accessToken },
      create: { key: "peya_access_token", value: accessToken },
    });

    if (refreshToken) {
      await prisma.setting.upsert({
        where: { key: "peya_refresh_token" },
        update: { value: refreshToken },
        create: { key: "peya_refresh_token", value: refreshToken },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Error saving PeYa token:", error);
    return NextResponse.json({ error: "Error al guardar token" }, { status: 500 });
  }
}
