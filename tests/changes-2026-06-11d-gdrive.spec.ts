import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function loginAdmin(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', "test_e2e");
  await page.fill('input[type="password"]', "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Drive auto-upload for recibos", () => {
  test("Creating a recibo populates driveUrl and the file is reachable on Drive", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Create a $1.01 ajuste-only recibo against HERBAL (cod 190) — tiny amount so the
    // visible side-effect in Drive is harmless. We anular at the end to restore Saldo.
    const monto = 1.01;
    const res = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [],
        efectivo: null,
        transferencia: null,
        ajuste: { monto, motivo: "TEST e2e gdrive upload" },
        concepto: "test_e2e gdrive",
      },
    });
    expect(res.status()).toBe(200);
    const created = await res.json();
    expect(created.ok).toBe(true);
    expect(created.paymentId).toBeGreaterThan(0);

    // Critical assertion — driveUrl must be populated, meaning the eager Drive upload
    // in the POST path succeeded.
    expect(created.driveUrl).toBeTruthy();
    expect(String(created.driveUrl)).toMatch(/^https:\/\/drive\.google\.com\/file\/d\//);

    // Cleanup: anular the test recibo (no Saldo footprint on HERBAL)
    const cleanup = await request.post(`${BASE}/api/admin/proveedores/recibos/${created.paymentId}/anular`, {
      headers: { cookie: cookieHeader },
    });
    expect(cleanup.status()).toBe(200);
  });
});
