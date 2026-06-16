import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function loginAdmin(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', "test_e2e");
  await page.fill('input[type="password"]', "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Drive upload live post-connect", () => {
  test("Status reports connected with the right email", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.get(`${BASE}/api/admin/conectar-drive`, { headers: { cookie: cookieHeader } });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.connected).toBe(true);
    expect(j.email).toContain("@gmail.com");
  });

  test("Creating a recibo populates driveUrl AND the file is reachable on Drive", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const monto = 1.01;
    const create = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [],
        efectivo: null,
        transferencia: null,
        ajuste: { monto, motivo: "TEST e2e drive live" },
        concepto: "test_e2e drive live",
      },
    });
    expect(create.status()).toBe(200);
    const c = await create.json();
    expect(c.ok).toBe(true);
    expect(c.paymentId).toBeGreaterThan(0);
    // Critical: driveUrl populated (eager upload in POST path succeeded)
    expect(c.driveUrl).toBeTruthy();
    expect(String(c.driveUrl)).toMatch(/^https:\/\/drive\.google\.com\//);

    // Confirm the URL actually serves something (Drive returns either 200 or 302 for webViewLink)
    const head = await request.head(String(c.driveUrl), { maxRedirects: 0 });
    expect([200, 302, 307]).toContain(head.status());

    // Cleanup — anular the test recibo
    const cleanup = await request.post(`${BASE}/api/admin/proveedores/recibos/${c.paymentId}/anular`, {
      headers: { cookie: cookieHeader },
    });
    expect(cleanup.status()).toBe(200);
  });
});
