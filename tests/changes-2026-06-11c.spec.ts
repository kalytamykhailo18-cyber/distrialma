import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function loginStaff(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', "test_e2e");
  await page.fill('input[type="password"]', "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Proveedor alias + CBU", () => {
  test("A. API GET returns alias + cbu fields for each proveedor", async ({ page, request }) => {
    await loginStaff(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.get(`${BASE}/api/admin/proveedores`, { headers: { cookie: cookieHeader } });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.proveedores.length).toBeGreaterThan(0);
    for (const p of j.proveedores.slice(0, 5)) {
      expect(typeof p.alias).toBe("string");
      expect(typeof p.cbu).toBe("string");
    }
  });

  test("B. PATCH updates alias and cbu independently, GET reflects them, then restore", async ({ page, request }) => {
    await loginStaff(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // Use proveedor 190 (HERBAL) for round-trip
    const list = await request.get(`${BASE}/api/admin/proveedores`, { headers: { cookie: cookieHeader } });
    const before = (await list.json()).proveedores.find((p: { cod: string }) => p.cod === "190");
    const origAlias = before.alias || "";
    const origCbu = before.cbu || "";

    const testAlias = "TEST.ALIAS.HERBAL";
    const testCbu = "0070099820000012345678";

    // Update alias only
    const r1 = await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", alias: testAlias },
    });
    expect(r1.status()).toBe(200);

    // Update cbu only
    const r2 = await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", cbu: testCbu },
    });
    expect(r2.status()).toBe(200);

    // Confirm both are now set independently
    const after = await request.get(`${BASE}/api/admin/proveedores`, { headers: { cookie: cookieHeader } });
    const afterProv = (await after.json()).proveedores.find((p: { cod: string }) => p.cod === "190");
    expect(afterProv.alias).toBe(testAlias);
    expect(afterProv.cbu).toBe(testCbu);

    // Restore both
    const restore = await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", alias: origAlias, cbu: origCbu },
    });
    expect(restore.status()).toBe(200);
    const final = await request.get(`${BASE}/api/admin/proveedores`, { headers: { cookie: cookieHeader } });
    const finalProv = (await final.json()).proveedores.find((p: { cod: string }) => p.cod === "190");
    expect(finalProv.alias).toBe(origAlias);
    expect(finalProv.cbu).toBe(origCbu);
  });

  test("C. /admin/proveedores list shows Alias badge in header when set", async ({ page, request }) => {
    await loginStaff(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const testAlias = "alias.test.row";
    await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", alias: testAlias },
    });
    await page.goto(`${BASE}/admin/proveedores`);
    await page.fill('input[placeholder="Filtrar proveedores..."]', "HERBAL");
    await expect(page.locator(`text="Alias ${testAlias}"`).first()).toBeVisible({ timeout: 8000 });
    // restore
    await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", alias: "" },
    });
  });

  test("D. /admin/proveedores expanded panel shows Alias + CBU rows with edit buttons", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/proveedores`);
    await page.fill('input[placeholder="Filtrar proveedores..."]', "HERBAL");
    // Click the row to expand
    await page.locator('text="HERBAL"').first().click();
    // Wait for expanded panel: should contain "CUIT:", "Alias:", "CBU:" labels
    await expect(page.locator('text="CUIT:"').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text="Alias:"').first()).toBeVisible();
    await expect(page.locator('text="CBU:"').first()).toBeVisible();
  });

  test("E. Nuevo proveedor form has Alias + CBU inputs alongside Nombre + CUIT", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/proveedores`);
    await page.locator('text="Nuevo proveedor"').first().click();
    await expect(page.locator('input[placeholder="Nombre del proveedor"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('input[placeholder="20-12345678-9"]')).toBeVisible();
    await expect(page.locator('input[placeholder="alias.del.banco"]')).toBeVisible();
    await expect(page.locator('input[placeholder="22 digitos"]')).toBeVisible();
  });
});
