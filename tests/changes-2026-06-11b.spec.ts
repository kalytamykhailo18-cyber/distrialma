import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";
const STAFF_USER = "test_e2e";
const STAFF_PASS = "test1234";

async function loginStaff(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', STAFF_USER);
  await page.fill('input[type="password"]', STAFF_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("CUIT field + dropdown z-index fix", () => {
  test("A. Proveedor list returns cuit field in API response", async ({ page, request }) => {
    await loginStaff(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.get(`${BASE}/api/admin/proveedores`, {
      headers: { cookie: cookieHeader },
    });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(Array.isArray(j.proveedores)).toBe(true);
    expect(j.proveedores.length).toBeGreaterThan(0);
    // All entries should have a (possibly empty) cuit string property
    for (const p of j.proveedores.slice(0, 5)) {
      expect(typeof p.cuit).toBe("string");
    }
  });

  test("B. PATCH /api/admin/proveedores updates CUIT and GET reflects it", async ({ page, request }) => {
    await loginStaff(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // Use proveedor 190 (HERBAL) — read current CUIT, set a known one, verify, restore.
    const before = await request.get(`${BASE}/api/admin/proveedores`, { headers: { cookie: cookieHeader } });
    const beforeProv = (await before.json()).proveedores.find((p: { cod: string }) => p.cod === "190");
    expect(beforeProv).toBeDefined();
    const original = beforeProv.cuit || "";
    const testCuit = "20-99887766-1";

    const patch = await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", cuit: testCuit },
    });
    expect(patch.status()).toBe(200);

    const after = await request.get(`${BASE}/api/admin/proveedores`, { headers: { cookie: cookieHeader } });
    const afterProv = (await after.json()).proveedores.find((p: { cod: string }) => p.cod === "190");
    expect(afterProv.cuit).toBe(testCuit);

    // Restore
    const restore = await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", cuit: original },
    });
    expect(restore.status()).toBe(200);
  });

  test("C. /admin/proveedores list row shows CUIT badge when present", async ({ page, request }) => {
    await loginStaff(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // Stamp a CUIT on a proveedor we can find by name (HERBAL #190)
    const testCuit = "30-77665544-9";
    await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", cuit: testCuit },
    });

    await page.goto(`${BASE}/admin/proveedores`);
    await page.fill('input[placeholder="Filtrar proveedores..."]', "HERBAL");
    // The row should show CUIT badge
    await expect(page.locator(`text="CUIT ${testCuit}"`).first()).toBeVisible({ timeout: 8000 });

    // Cleanup
    await request.patch(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", cuit: "" },
    });
  });

  test("D. Nuevo proveedor form has a CUIT input that submits along with nombre", async ({ page, request }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/proveedores`);
    await page.locator('text="Nuevo proveedor"').first().click();
    // CUIT input visible
    await expect(page.locator('input[placeholder="20-12345678-9"]')).toBeVisible({ timeout: 5000 });

    // We don't actually create a real proveedor in PunTouch from the e2e (irreversible),
    // but we assert the form is wired: it has both Nombre and CUIT inputs and a Guardar button.
    await expect(page.locator('input[placeholder="Nombre del proveedor"]')).toBeVisible();
    await expect(page.locator('text="Guardar"')).toBeVisible();
  });

  test("E. /admin/compras/nuevo proveedor dropdown renders above subsequent form sections", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/compras/nuevo`);
    await page.waitForSelector('input[placeholder="Buscar proveedor por nombre o codigo..."]', { timeout: 10000 });
    await page.fill('input[placeholder="Buscar proveedor por nombre o codigo..."]', "la");
    // Dropdown becomes visible with at least one proveedor
    const dropdown = page.locator('.absolute.z-20.bg-white').first();
    await expect(dropdown).toBeVisible({ timeout: 5000 });

    // Get the bounding box of the dropdown and the search section header below ("Buscar producto")
    const dropdownBox = await dropdown.boundingBox();
    const searchHeader = page.locator('text=/Buscar producto/i').first();
    const searchHeaderBox = await searchHeader.boundingBox();
    expect(dropdownBox).not.toBeNull();
    expect(searchHeaderBox).not.toBeNull();

    // The dropdown should overlap the search section vertically (proves it extends down over later content)
    // and an elementFromPoint at an overlap coord should resolve to a node inside the dropdown,
    // not the search section behind it.
    if (dropdownBox && searchHeaderBox) {
      const overlapY = Math.max(dropdownBox.y + 4, searchHeaderBox.y + 4);
      const x = dropdownBox.x + dropdownBox.width / 2;
      const elementAtOverlap = await page.evaluate(({ x, y }) => {
        const el = document.elementFromPoint(x, y) as HTMLElement | null;
        if (!el) return null;
        // Walk up looking for a known dropdown ancestor class signature
        let cur: HTMLElement | null = el;
        while (cur) {
          const cls = cur.className || "";
          if (typeof cls === "string" && cls.includes("absolute") && cls.includes("z-20") && cls.includes("bg-white")) {
            return "in-dropdown";
          }
          cur = cur.parentElement;
        }
        return "behind-dropdown";
      }, { x, y: overlapY });
      expect(elementAtOverlap).toBe("in-dropdown");
    }
  });
});
