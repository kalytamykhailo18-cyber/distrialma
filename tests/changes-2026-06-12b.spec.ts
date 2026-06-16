import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', user);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Saldo hidden for non-admin + manual ajuste", () => {
  test("A. Non-admin operator does NOT see saldo column, filters, or history in proveedores list", async ({ page }) => {
    await login(page, "test_e2e_staff", "test1234");
    await page.goto(`${BASE}/admin/proveedores`);
    await page.waitForLoadState("networkidle", { timeout: 10000 });
    // Filters that would reveal saldo state must be hidden
    await expect(page.locator('text="Solo con deuda"')).toHaveCount(0);
    await expect(page.locator('text="Con saldo a favor"')).toHaveCount(0);
    // The Pago rapido chip must not be present anywhere
    await expect(page.locator('text="Pago rapido"')).toHaveCount(0);
    // The "Nuevo recibo" chip MUST still be visible (operator has 'recibos' perm)
    await expect(page.locator('text="Nuevo recibo"').first()).toBeVisible({ timeout: 8000 });
  });

  test("B. Non-admin expanding a proveedor sees CUIT/Alias/CBU but NOT movements/ajuste/PDF/Excel", async ({ page }) => {
    await login(page, "test_e2e_staff", "test1234");
    await page.goto(`${BASE}/admin/proveedores`);
    await page.fill('input[placeholder="Filtrar proveedores..."]', "HERBAL");
    await page.locator('text="HERBAL"').first().click();
    await page.waitForTimeout(800);
    // Identity fields stay visible
    await expect(page.locator('text="CUIT:"').first()).toBeVisible({ timeout: 5000 });
    // Admin-only sections must be absent
    await expect(page.locator('text="Ajuste manual de saldo"')).toHaveCount(0);
    await expect(page.locator('text="Desde:"')).toHaveCount(0);
    await expect(page.locator('button:has-text("PDF")')).toHaveCount(0);
    await expect(page.locator('button:has-text("Excel")')).toHaveCount(0);
  });

  test("C. Non-admin on /admin/proveedores/recibo/[cod] does NOT see 'saldo actual' text", async ({ page }) => {
    await login(page, "test_e2e_staff", "test1234");
    await page.goto(`${BASE}/admin/proveedores/recibo/190`);
    await page.waitForLoadState("networkidle", { timeout: 10000 });
    // The header line should say "Proveedor: HERBAL" without saldo info
    await expect(page.locator('text=/saldo actual/i')).toHaveCount(0);
    await expect(page.locator('text=/Proveedor:/i').first()).toBeVisible();
  });

  test("D. POST /api/admin/proveedores/ajuste-saldo by non-admin returns 403", async ({ page, request }) => {
    await login(page, "test_e2e_staff", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.post(`${BASE}/api/admin/proveedores/ajuste-saldo`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", delta: 100, motivo: "denied" },
    });
    expect(r.status()).toBe(403);
  });

  test("E. Admin applies ajuste, saldo moves by delta, audit row created, then reverse to restore", async ({ page, request }) => {
    await login(page, "test_e2e", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Read current saldo of HERBAL (cod 190)
    const before = await request.get(`${BASE}/api/admin/proveedores`, { headers: { cookie: cookieHeader } });
    const beforeProv = (await before.json()).proveedores.find((p: { cod: string }) => p.cod === "190");
    const saldoBefore = Number(beforeProv.saldo);

    // Apply +1.50 delta
    const r1 = await request.post(`${BASE}/api/admin/proveedores/ajuste-saldo`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", delta: 1.50, motivo: "TEST e2e ajuste +1.50" },
    });
    expect(r1.status()).toBe(200);
    const j1 = await r1.json();
    expect(j1.ok).toBe(true);
    expect(Number(j1.nuevoSaldo)).toBeCloseTo(saldoBefore + 1.50, 2);
    expect(j1.paymentId).toBeGreaterThan(0);

    // Reverse with -1.50 to restore
    const r2 = await request.post(`${BASE}/api/admin/proveedores/ajuste-saldo`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", delta: -1.50, motivo: "TEST e2e revert" },
    });
    expect(r2.status()).toBe(200);
    const j2 = await r2.json();
    expect(Number(j2.nuevoSaldo)).toBeCloseTo(saldoBefore, 2);
  });

  test("F. Ajuste-saldo rejects delta=0, missing motivo, missing cod", async ({ page, request }) => {
    await login(page, "test_e2e", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const noMotivo = await request.post(`${BASE}/api/admin/proveedores/ajuste-saldo`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", delta: 1 },
    });
    expect(noMotivo.status()).toBe(400);
    const noCod = await request.post(`${BASE}/api/admin/proveedores/ajuste-saldo`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { delta: 1, motivo: "x" },
    });
    expect(noCod.status()).toBe(400);
    const zeroDelta = await request.post(`${BASE}/api/admin/proveedores/ajuste-saldo`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", delta: 0, motivo: "zero" },
    });
    expect(zeroDelta.status()).toBe(400);
  });
});
