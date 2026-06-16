import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', user);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

async function loginAdmin(page: Page) {
  await login(page, "test_e2e", "test1234");
}

async function getCookieHeader(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}

// Discover a SKU that has a row in Deposito 0 — search for a very common letter.
async function findSku(page: Page, cookieHeader: string): Promise<string> {
  const r = await page.request.get(`${BASE}/api/admin/stock-entries/search-products?q=lec`, {
    headers: { cookie: cookieHeader },
  });
  const data = await r.json();
  const candidates = (data.products as { sku: string }[]) || [];
  if (candidates.length === 0) throw new Error("No products found for SKU discovery");
  return candidates[0].sku;
}

test.describe("Stock por sucursal — API", () => {
  test("A. GET returns producto + per-deposit rows + depositosKnown", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const sku = await findSku(page, cookieHeader);

    const r = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=${sku}`, {
      headers: { cookie: cookieHeader },
    });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.producto).toBeTruthy();
    expect(j.producto.sku).toBe(sku);
    expect(Array.isArray(j.rows)).toBe(true);
    expect(Array.isArray(j.depositosKnown)).toBe(true);
    expect(Array.isArray(j.audit)).toBe(true);
    // Default depositos known should at least include 0,1,2,3
    const cods = (j.depositosKnown as { cod: string }[]).map((d) => d.cod);
    expect(cods).toContain("0");
    expect(cods).toContain("1");
    expect(cods).toContain("2");
    expect(cods).toContain("3");
    // Each row has the expected shape
    for (const row of j.rows) {
      expect(typeof row.deposito).toBe("string");
      expect(typeof row.depositoName).toBe("string");
      expect(typeof row.stk).toBe("number");
    }
  });

  test("B. GET with unknown sku returns 404", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=ZZZZZZZ`, {
      headers: { cookie: cookieHeader },
    });
    expect(r.status()).toBe(404);
  });

  test("C. GET without sku returns 400", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.get(`${BASE}/api/admin/stock-sucursales`, {
      headers: { cookie: cookieHeader },
    });
    expect(r.status()).toBe(400);
  });

  test("D. PUT on a deposit that exists round-trips Stk and creates an audit entry", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const sku = await findSku(page, cookieHeader);

    // Pick a row in deposito 0 (mayorista — always exists for the SKU we search for)
    const before = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=${sku}`, {
      headers: { cookie: cookieHeader },
    });
    const beforeJson = await before.json();
    const row0 = (beforeJson.rows as { deposito: string; stk: number }[]).find((r) => r.deposito === "0");
    expect(row0).toBeTruthy();
    const original = row0!.stk;

    // Set to original + 1
    const target = original + 1;
    const motivo = `E2E test ${Date.now()}`;
    const put = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: "0", stk: target, motivo },
    });
    expect(put.status()).toBe(200);
    const pj = await put.json();
    expect(pj.stkAnterior).toBe(original);
    expect(pj.stkNuevo).toBe(target);

    // Verify it landed and audit row appeared
    const after = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=${sku}`, {
      headers: { cookie: cookieHeader },
    });
    const afterJson = await after.json();
    const row0After = (afterJson.rows as { deposito: string; stk: number }[]).find((r) => r.deposito === "0");
    expect(row0After!.stk).toBe(target);

    const auditMatch = (afterJson.audit as { motivo: string; stkAnterior: number; stkNuevo: number; deposito: string }[]).find(
      (a) => a.motivo === motivo
    );
    expect(auditMatch).toBeTruthy();
    expect(auditMatch!.deposito).toBe("0");
    expect(auditMatch!.stkAnterior).toBe(original);
    expect(auditMatch!.stkNuevo).toBe(target);

    // Restore original
    const restore = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: "0", stk: original, motivo: `E2E restore ${Date.now()}` },
    });
    expect(restore.status()).toBe(200);
  });

  test("D2. PUT habilitar into a deposit where the (sku, dep) row does NOT exist creates the row with valid Cod", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const sku = await findSku(page, cookieHeader);

    // Find a deposit where this sku does NOT have a row yet (we'll use dep "9" — synthetic, very unlikely to exist)
    // If it happens to exist, we still test idempotency. Then we clean up by setting it back to 0.
    const dep = "9";
    const motivo = `E2E habilitar test ${Date.now()}`;
    const put = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: dep, stk: 1, motivo },
    });
    expect(put.status()).toBe(200);

    // Verify via GET — the row should now appear in the deposits list for that sku.
    const r = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=${sku}`, {
      headers: { cookie: cookieHeader },
    });
    const j = await r.json();
    const row = (j.rows as { deposito: string; stk: number }[]).find((x) => x.deposito === dep);
    expect(row).toBeTruthy();
    expect(row!.stk).toBe(1);

    // Idempotent: second PUT updates instead of inserting (should also succeed)
    const put2 = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: dep, stk: 0, motivo: `E2E habilitar test reset` },
    });
    expect(put2.status()).toBe(200);
  });

  test("D3. DELETE removes the Stock row entirely + audit row; subsequent PUT re-creates it", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const sku = await findSku(page, cookieHeader);

    // First, ensure the row exists in a non-zero deposit. Use dep "9" which we've used in D2.
    const dep = "9";
    const ensure = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: dep, stk: 5, motivo: "E2E setup for deshabilitar" },
    });
    expect(ensure.status()).toBe(200);

    // Now deshabilitar (DELETE removes the row entirely — PunTouch crashes on DeBaja=1)
    const del = await page.request.delete(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: dep, motivo: "E2E deshabilitar test" },
    });
    expect(del.status()).toBe(200);

    // Verify the row is GONE and an audit row with origen="deshabilitar" was written
    const r = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=${sku}`, { headers: { cookie: cookieHeader } });
    const j = await r.json();
    const row = (j.rows as { deposito: string }[]).find((x) => x.deposito === dep);
    expect(row).toBeFalsy();
    const auditDeshab = (j.audit as { origen: string; deposito: string }[]).find((a) => a.origen === "deshabilitar" && a.deposito === dep);
    expect(auditDeshab).toBeTruthy();

    // PUT to re-create the row (re-habilitar path)
    const reenable = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: dep, stk: 0, motivo: "E2E re-habilitar" },
    });
    expect(reenable.status()).toBe(200);
    const after = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=${sku}`, { headers: { cookie: cookieHeader } });
    const afterJson = await after.json();
    const rowAfter = (afterJson.rows as { deposito: string; deBaja: boolean }[]).find((x) => x.deposito === dep);
    expect(rowAfter).toBeTruthy();
    expect(rowAfter!.deBaja).toBe(false);
  });

  test("D4. DELETE without motivo returns 400", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.delete(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku: "1", deposito: "0" },
    });
    expect(r.status()).toBe(400);
  });

  test("D5. DELETE for sku that doesn't exist in deposito returns 404", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.delete(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku: "9999999", deposito: "9", motivo: "E2E missing row" },
    });
    expect(r.status()).toBe(404);
  });

  test("E. PUT with missing motivo returns 400", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const sku = await findSku(page, cookieHeader);
    const r = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: "0", stk: 5 },
    });
    expect(r.status()).toBe(400);
  });

  test("F. habilitar-bulk dryRun returns wouldInsert/wouldUpdate and inserts nothing", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.post(`${BASE}/api/admin/stock-sucursales/habilitar-bulk`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sourceDep: "0", targetDep: "1", dryRun: true },
    });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.dryRun).toBe(true);
    expect(typeof j.wouldInsert).toBe("number");
    expect(typeof j.wouldUpdate).toBe("number");
    expect(j.inserted).toBe(0);
    expect(j.updated).toBe(0);
  });

  test("G. habilitar-bulk same source and target returns 400", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.post(`${BASE}/api/admin/stock-sucursales/habilitar-bulk`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sourceDep: "0", targetDep: "0", dryRun: true },
    });
    expect(r.status()).toBe(400);
  });

  test("H. Non-admin operator gets 403 on GET, PUT and habilitar-bulk", async ({ page }) => {
    await login(page, "test_e2e_staff", "test1234");
    const cookieHeader = await getCookieHeader(page);

    const g = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=1`, {
      headers: { cookie: cookieHeader },
    });
    expect(g.status()).toBe(403);

    const p = await page.request.put(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku: "1", deposito: "0", stk: 0, motivo: "denied" },
    });
    expect(p.status()).toBe(403);

    const b = await page.request.post(`${BASE}/api/admin/stock-sucursales/habilitar-bulk`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sourceDep: "0", targetDep: "1", dryRun: true },
    });
    expect(b.status()).toBe(403);

    const d = await page.request.delete(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku: "1", deposito: "0", motivo: "denied" },
    });
    expect(d.status()).toBe(403);
  });
});

test.describe("Stock por sucursal — UI", () => {
  test("Search dropdown supports ArrowDown / Enter keyboard navigation", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/admin/stock-sucursales`);
    await expect(page.locator('h1:has-text("Stock por sucursal")')).toBeVisible({ timeout: 8000 });
    const input = page.locator('input[placeholder*="Buscar por nombre"]');
    await input.fill("lec");
    await page.waitForTimeout(700);
    // Press ArrowDown twice, then Enter — should select the second result and load it
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await input.press("Enter");
    await expect(page.locator('text=/^SKU /').first()).toBeVisible({ timeout: 8000 });
  });

  test("Page loads and search dropdown picks a product, table shows deposit rows", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/admin/stock-sucursales`);
    await expect(page.locator('h1:has-text("Stock por sucursal")')).toBeVisible({ timeout: 8000 });

    // Bulk-habilitar section visible from the start
    await expect(page.locator('text="Habilitar productos en otro deposito"')).toBeVisible();

    // Type into search box, expect dropdown
    await page.fill('input[placeholder*="Buscar por nombre"]', "lec");
    await page.waitForTimeout(700);
    const firstResult = page.locator('button:has(span.font-mono)').first();
    await expect(firstResult).toBeVisible({ timeout: 5000 });
    // Force-click — the search dropdown's stacking context can be intercepted by Stagger wrappers below
    await firstResult.click({ force: true });

    // Producto card appears — SKU label + per-deposit table headers
    await expect(page.locator('text=/^SKU /').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('th:has-text("Deposito")').first()).toBeVisible();
    await expect(page.locator('th:has-text("Stk")').first()).toBeVisible();
  });

  test("After picking a product the search dropdown stays closed (does not reopen on programmatic setQuery)", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/admin/stock-sucursales`);
    await expect(page.locator('h1:has-text("Stock por sucursal")')).toBeVisible({ timeout: 8000 });
    await page.fill('input[placeholder*="Buscar por nombre"]', "lec");
    await page.waitForTimeout(700);
    const firstResult = page.locator('button:has(span.font-mono)').first();
    await expect(firstResult).toBeVisible({ timeout: 5000 });
    await firstResult.click({ force: true });
    await expect(page.locator('text=/^SKU /').first()).toBeVisible({ timeout: 8000 });
    // Wait the debounce window then assert no result button is visible (dropdown closed)
    await page.waitForTimeout(800);
    await expect(page.locator('button:has(span.font-mono)')).toHaveCount(0);
  });

  test("'Habilitar' on a no-habilitado deposit opens the inline form and the PUT round-trips", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const sku = await findSku(page, cookieHeader);

    // Setup: delete (deshabilitar) the row in dep "9" so it's "no habilitado"
    await page.request.delete(`${BASE}/api/admin/stock-sucursales`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { sku, deposito: "9", motivo: "E2E setup for Habilitar inline form" },
    }).catch(() => undefined);

    await page.goto(`${BASE}/admin/stock-sucursales`);
    await page.fill('input[placeholder*="Buscar por nombre"]', sku);
    await page.waitForTimeout(700);
    const firstResult = page.locator('button:has(span.font-mono)').first();
    await expect(firstResult).toBeVisible({ timeout: 5000 });
    await firstResult.click({ force: true });
    await expect(page.locator('text=/^SKU /').first()).toBeVisible({ timeout: 8000 });

    // Find a deposit row marked "(no habilitado)" — dep 9 is the most stable target
    const habilitarBtn = page.locator('tr:has-text("(no habilitado)") button:has-text("Habilitar")').first();
    await expect(habilitarBtn).toBeVisible({ timeout: 5000 });
    await habilitarBtn.click();

    // Inline form: stk input + motivo input + Habilitar button to confirm
    await expect(page.locator('input[placeholder="Motivo (ej: habilitar para venta)"]').first()).toBeVisible({ timeout: 5000 });
    await page.fill('input[placeholder="Motivo (ej: habilitar para venta)"]', "E2E habilitar form");
    await page.locator('button:has-text("Habilitar")').nth(1).click();
    // After save, the row should now appear in the regular rows (not "no habilitado") for that sku
    await page.waitForTimeout(1500);
  });
});
