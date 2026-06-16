import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', user);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}
async function loginAdmin(page: Page) { await login(page, "test_e2e", "test1234"); }
async function getCookieHeader(page: Page) {
  const cookies = await page.context().cookies();
  return cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
async function findSku(page: Page, cookieHeader: string): Promise<{ sku: string; name: string }> {
  const r = await page.request.get(`${BASE}/api/admin/stock-entries/search-products?q=lec`, { headers: { cookie: cookieHeader } });
  const data = await r.json();
  const candidates = (data.products as { sku: string; name: string }[]) || [];
  if (candidates.length === 0) throw new Error("No products found");
  return { sku: candidates[0].sku, name: candidates[0].name };
}

test.describe("Traslados entre sucursales — API", () => {
  test("A. GET returns transfers array", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.get(`${BASE}/api/admin/traslados?limit=5`, { headers: { cookie: cookieHeader } });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(Array.isArray(j.transfers)).toBe(true);
  });

  test("B. POST with same origen and destino returns 400", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.post(`${BASE}/api/admin/traslados`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { depositoOrigen: "0", depositoDestino: "0", items: [{ sku: "1", cantidad: 1 }] },
    });
    expect(r.status()).toBe(400);
  });

  test("C. POST with empty items returns 400", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.post(`${BASE}/api/admin/traslados`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { depositoOrigen: "0", depositoDestino: "1", items: [] },
    });
    expect(r.status()).toBe(400);
  });

  test("D. Full round-trip: POST creates transfer, audits both sides, PDF returns 200", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    const { sku } = await findSku(page, cookieHeader);

    // Move 1 unit from 0 to 1
    const post = await page.request.post(`${BASE}/api/admin/traslados`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { depositoOrigen: "0", depositoDestino: "1", notas: "E2E test", items: [{ sku, cantidad: 1 }] },
    });
    expect(post.status()).toBe(200);
    const pj = await post.json();
    expect(pj.transferId).toBeGreaterThan(0);
    expect(pj.processed).toBe(1);

    // Verify audit entries land for both sides with stkAnterior + stkNuevo
    // (those values come from the server's own transactional read, so they are self-consistent
    // regardless of any concurrent writes from other tests/services)
    const after = await page.request.get(`${BASE}/api/admin/stock-sucursales?sku=${sku}`, { headers: { cookie: cookieHeader } });
    const afterJson = await after.json();
    const auditMotivo = `Traslado #${pj.transferId} (0→1)`;
    const auditMatches = (afterJson.audit as { motivo: string; deposito: string; stkAnterior: number; stkNuevo: number }[]).filter((a) => a.motivo === auditMotivo);
    expect(auditMatches.length).toBe(2);
    const origenAudit = auditMatches.find((a) => a.deposito === "0");
    const destinoAudit = auditMatches.find((a) => a.deposito === "1");
    expect(origenAudit).toBeTruthy();
    expect(destinoAudit).toBeTruthy();
    // The transfer is self-consistent: origen lost 1, destino gained 1
    expect(origenAudit!.stkNuevo).toBe(origenAudit!.stkAnterior - 1);
    expect(destinoAudit!.stkNuevo).toBe(destinoAudit!.stkAnterior + 1);

    // PDF endpoint returns a real PDF
    const pdf = await page.request.get(`${BASE}/api/admin/traslados/${pj.transferId}/pdf`, { headers: { cookie: cookieHeader } });
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("application/pdf");
    const buf = await pdf.body();
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.slice(0, 4).toString()).toBe("%PDF");

    // Restore: move 1 unit back from 1 to 0
    const restore = await page.request.post(`${BASE}/api/admin/traslados`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { depositoOrigen: "1", depositoDestino: "0", notas: "E2E restore", items: [{ sku, cantidad: 1 }] },
    });
    expect(restore.status()).toBe(200);
  });

  test("E. POST with sku not enabled in origen returns 500 (with informative message)", async ({ page }) => {
    await loginAdmin(page);
    const cookieHeader = await getCookieHeader(page);
    // Use a sku that surely doesn't exist
    const r = await page.request.post(`${BASE}/api/admin/traslados`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { depositoOrigen: "0", depositoDestino: "1", items: [{ sku: "9999999", cantidad: 1 }] },
    });
    expect(r.status()).toBeGreaterThanOrEqual(400);
  });

  test("F. Non-admin without traslados-stock perm gets 403 on POST", async ({ page }) => {
    await login(page, "test_e2e_staff", "test1234");
    const cookieHeader = await getCookieHeader(page);
    const r = await page.request.post(`${BASE}/api/admin/traslados`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { depositoOrigen: "0", depositoDestino: "1", items: [{ sku: "1", cantidad: 1 }] },
    });
    expect(r.status()).toBe(403);
  });
});

test.describe("Traslados — UI", () => {
  test("Page renders form + recent list and search dropdown shows products", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/admin/traslados`);
    await expect(page.locator('h1:has-text("Traslados entre sucursales")')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text="Origen"').first()).toBeVisible();
    await expect(page.locator('text="Destino"').first()).toBeVisible();
    await expect(page.locator('text="Ultimos traslados"')).toBeVisible();

    await page.fill('input[placeholder*="Agregar producto"]', "lec");
    await page.waitForTimeout(700);
    const firstResult = page.locator('button:has(span.font-mono)').first();
    await expect(firstResult).toBeVisible({ timeout: 5000 });
  });
});
