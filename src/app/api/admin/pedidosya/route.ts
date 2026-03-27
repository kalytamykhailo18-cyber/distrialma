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

async function fetchPeyaProducts(token: string): Promise<Array<{ sku: string; name: string; price: number; active: boolean; barcodes: string[] }>> {
  const allProducts: Array<{ sku: string; name: string; price: number; active: boolean; barcodes: string[] }> = [];
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
            items { sku name pieceBarcodes price active isWeighted }
            pagedResult { itemCount pageSize }
          }
        }`,
        variables: {
          filter: { vendorIdentifier: VENDOR, locale: "en", active: null },
          page: { pageNumber: page, pageSize },
        },
      }),
    });

    if (!res.ok || !res.headers.get("content-type")?.includes("json")) {
      throw new Error("Token expirado. Renová la sesión de PedidosYa.");
    }
    const data = await res.json();
    if (data.errors) throw new Error(data.errors[0]?.message || "GraphQL error");

    const items = data.data.products.items;
    const total = data.data.products.pagedResult.itemCount;

    for (const item of items) {
      allProducts.push({
        sku: item.sku,
        name: item.name,
        price: item.price,
        active: item.active,
        barcodes: item.pieceBarcodes || [],
      });
    }

    if (allProducts.length >= total || items.length < pageSize) break;
    page++;
  }

  return allProducts;
}

async function updatePeyaProducts(
  token: string,
  updates: Array<{ sku: string; price?: number; active?: boolean }>
): Promise<{ success: boolean; error?: string }> {
  const products = updates.map((u) => {
    const prod: { sku: string; price?: number; active?: boolean } = { sku: u.sku };
    if (u.price !== undefined) prod.price = u.price;
    if (u.active !== undefined) prod.active = u.active;
    return prod;
  });

  const res = await fetch(PEYA_GRAPHQL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-client-source": "one-web",
    },
    body: JSON.stringify({
      operationName: "ProductsUpdate",
      query: `mutation ProductsUpdate($productsUpdate: ProductsUpdate!) {
        productsUpdate(productsUpdate: $productsUpdate) {
          ... on ProductsUpdatedSuccessResult { __typename status }
          ... on ProductsUpdateAccepted { __typename bulkRequestId }
          ... on ProductsUpdateAsyncAccepted { __typename }
          ... on ProductsUpdateValidationErrors { __typename productsErrors { sku error } }
        }
      }`,
      variables: {
        productsUpdate: {
          vendorIdentifiers: [VENDOR],
          products,
        },
      },
    }),
  });

  if (!res.ok || !res.headers.get("content-type")?.includes("json")) {
    return { success: false, error: "Token expirado. Renová la sesión." };
  }
  const data = await res.json();
  console.log("PeYa update response:", JSON.stringify(data).substring(0, 500));
  if (data.errors) return { success: false, error: data.errors[0]?.message };

  const result = data.data?.productsUpdate;
  if (result?.__typename === "ProductsUpdateValidationErrors") {
    const errList = result.productsErrors?.slice(0, 5).map((e: { sku: string; error: string }) => `${e.sku}: ${e.error}`).join("; ");
    return { success: false, error: errList || "Validation error" };
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
        LTRIM(RTRIM(ISNULL(p.CodAlt, ''))) AS codalt,
        LTRIM(RTRIM(ISNULL(p.CodAlt2, ''))) AS codalt2,
        ISNULL(s.Precio5, 0) AS precio5,
        ISNULL(s.Stk, 0) AS stock,
        LTRIM(RTRIM(ISNULL(p.Unidad, ''))) AS unidad
      FROM [${dbProd}].dbo.Productos p
      JOIN [${dbProd}].dbo.Stock s ON s.CodProducto = p.Cod
      WHERE (p.DeBaja = 0 OR p.DeBaja IS NULL)
        AND LTRIM(RTRIM(s.Deposito)) = '0'
        AND s.Precio5 > 0
    `);

    // Build lookup maps: barcode → product, SKU → product
    type PtProd = { sku: string; nombre: string; precio5: number; stock: number; isKg: boolean };
    const puntouchByBarcode = new Map<string, PtProd>();
    const puntouchBySku = new Map<string, PtProd>();
    for (const row of result.recordset) {
      const isKg = row.unidad?.toUpperCase() === "KG";
      const precio5 = isKg ? Math.round(row.precio5 / 10) : row.precio5;
      const prod = { sku: row.sku, nombre: row.nombre, precio5, stock: row.stock, isKg };
      // Map by SKU (PunTouch Cod)
      puntouchBySku.set(row.sku, prod);
      // Map by all barcodes (main + alternatives)
      for (const bc of [row.codbar, row.codalt, row.codalt2]) {
        if (bc) {
          puntouchByBarcode.set(bc, prod);
          puntouchByBarcode.set(bc.replace(/^0+/, ""), prod);
        }
      }
    }

    // Compare prices and stock/active status
    const priceChanges: Array<{
      peyaSku: string;
      peyaName: string;
      barcode: string;
      puntouchSku: string;
      currentPrice: number;
      newPrice: number;
      puntouchHasDecimals: boolean;
    }> = [];
    const stockChanges: Array<{
      peyaSku: string;
      peyaName: string;
      currentActive: boolean;
      shouldBeActive: boolean;
      stock: number;
    }> = [];
    let matched = 0;
    let unmatched = 0;
    const unmatchedList: Array<{ peyaSku: string; peyaName: string; barcode: string; active: boolean }> = [];

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

      // 3. Fallback: try matching PedidosYa SKU against PunTouch barcodes
      if (!ptProd) {
        ptProd = puntouchByBarcode.get(peyaProd.sku) || puntouchByBarcode.get(peyaProd.sku.replace(/^0+/, "")) || null;
      }

      if (!ptProd) {
        unmatched++;
        unmatchedList.push({
          peyaSku: peyaProd.sku,
          peyaName: peyaProd.name,
          barcode: peyaProd.barcodes[0] || "",
          active: peyaProd.active,
        });
        continue;
      }

      matched++;

      // Price difference — PedidosYa only accepts integers, so round PunTouch price
      const roundedPt = Math.round(ptProd.precio5);
      if (roundedPt !== Math.round(peyaProd.price)) {
        priceChanges.push({
          peyaSku: peyaProd.sku,
          peyaName: peyaProd.name,
          barcode: peyaProd.barcodes[0] || "",
          puntouchSku: ptProd.sku,
          currentPrice: peyaProd.price,
          newPrice: roundedPt,
          puntouchHasDecimals: ptProd.precio5 !== roundedPt,
        });
      }

      // Stock/active difference: deactivate if stock <= 0, activate if stock > 0
      const shouldBeActive = ptProd.stock > 0;
      if (peyaProd.active !== shouldBeActive) {
        stockChanges.push({
          peyaSku: peyaProd.sku,
          peyaName: peyaProd.name,
          currentActive: peyaProd.active,
          shouldBeActive,
          stock: ptProd.stock,
        });
      }
    }

    return NextResponse.json({
      peyaTotal: peyaProducts.length,
      puntouchTotal: result.recordset.length,
      matched,
      unmatched,
      changes: priceChanges,
      stockChanges,
      unmatchedList,
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

// POST: Apply price and/or stock updates to PedidosYa
export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { updates, stockUpdates, skuUpdates } = await req.json();
    const allUpdates: Array<{ sku: string; price?: number; active?: boolean }> = [];
    const puntouchPriceUpdates: Array<{ peyaSku: string; puntouchSku: string; price: number }> = [];
    const skuChangeResults: string[] = [];

    if (updates && Array.isArray(updates)) {
      for (const u of updates) {
        allUpdates.push({ sku: u.sku, price: u.price });
        // Track PunTouch SKU for syncing Precio5 back
        if (u.puntouchSku && u.price) {
          puntouchPriceUpdates.push({ peyaSku: u.sku, puntouchSku: u.puntouchSku, price: u.price });
        }
      }
    }
    if (stockUpdates && Array.isArray(stockUpdates)) {
      for (const u of stockUpdates) {
        // Merge with existing price update if same SKU
        const existing = allUpdates.find((a) => a.sku === u.sku);
        if (existing) {
          existing.active = u.active;
        } else {
          allUpdates.push({ sku: u.sku, active: u.active });
        }
      }
    }

    const token = await getPeyaToken();
    if (!token) {
      return NextResponse.json({ error: "Token no configurado" }, { status: 400 });
    }

    let totalUpdated = 0;
    const errors: string[] = [];

    // Handle SKU changes (rename product SKU in PedidosYa)
    if (skuUpdates && Array.isArray(skuUpdates)) {
      for (const u of skuUpdates) {
        try {
          const res = await fetch(PEYA_GRAPHQL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "x-client-source": "one-web",
            },
            body: JSON.stringify({
              operationName: "ProductUpdateSKU",
              query: `mutation ProductUpdateSKU($vendorIdentifier: VendorIdentifier!, $oldSku: String!, $newSku: String!) {
                productUpdateSKU(vendorIdentifier: $vendorIdentifier, oldSku: $oldSku, newSku: $newSku) {
                  ... on ProductsUpdateSKUResult { sku }
                }
              }`,
              variables: {
                vendorIdentifier: VENDOR,
                oldSku: u.oldSku,
                newSku: u.newSku,
              },
            }),
          });
          const data = await res.json();
          if (data.errors) {
            errors.push(`SKU ${u.oldSku}: ${data.errors[0]?.message}`);
          } else {
            skuChangeResults.push(u.newSku);
            totalUpdated++;
          }
        } catch (e) {
          errors.push(`SKU ${u.oldSku}: ${e instanceof Error ? e.message : "Error"}`);
        }
      }
    }

    if (allUpdates.length === 0 && skuChangeResults.length === 0 && (!skuUpdates || skuUpdates.length === 0)) {
      return NextResponse.json({ error: "No hay cambios para aplicar" }, { status: 400 });
    }

    for (let i = 0; i < allUpdates.length; i += 50) {
      const batch = allUpdates.slice(i, i + 50);
      const result = await updatePeyaProducts(token, batch);
      if (result.success) {
        totalUpdated += batch.length;
      } else {
        errors.push(`Batch ${Math.floor(i / 50) + 1}: ${result.error}`);
      }
    }

    // Sync rounded prices back to PunTouch Precio5
    if (puntouchPriceUpdates.length > 0 && totalUpdated > 0) {
      try {
        const pool = await getPool();
        const dbProd = getDbName("productos");
        for (const u of puntouchPriceUpdates) {
          const codPadded = String(u.puntouchSku).padStart(7, " ");
          await pool.request()
            .input("cod", codPadded)
            .input("precio5", u.price)
            .query(`
              UPDATE [${dbProd}].dbo.Stock
              SET Precio5 = @precio5
              WHERE CodProducto = @cod AND LTRIM(RTRIM(Deposito)) = '0'
            `);
        }
        console.log(`Synced ${puntouchPriceUpdates.length} Precio5 values back to PunTouch`);
      } catch (e) {
        console.error("Error syncing Precio5 to PunTouch:", e);
        errors.push("Precios actualizados en PedidosYa pero error al sincronizar Precio5 en PunTouch");
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
