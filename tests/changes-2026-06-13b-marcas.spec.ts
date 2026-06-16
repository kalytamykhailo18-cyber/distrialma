import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function loginAdmin(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', "test_e2e");
  await page.fill('input[type="password"]', "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Marcas en Landing — Refrescar button", () => {
  test("Refrescar button is visible and re-triggers the /api/brands fetch", async ({ page }) => {
    await loginAdmin(page);
    let brandFetchCount = 0;
    await page.route("**/api/brands", async (route) => {
      brandFetchCount++;
      await route.continue();
    });
    await page.goto(`${BASE}/admin/marcas`);
    await page.waitForLoadState("networkidle", { timeout: 10000 });
    expect(brandFetchCount).toBeGreaterThanOrEqual(1);
    const initial = brandFetchCount;
    const refreshBtn = page.locator('button:has-text("Refrescar")').first();
    await expect(refreshBtn).toBeVisible({ timeout: 5000 });
    await refreshBtn.click();
    await page.waitForLoadState("networkidle", { timeout: 10000 });
    expect(brandFetchCount).toBeGreaterThan(initial);
  });
});
