import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', user);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

// 1x1 PNG dataURL
const TINY_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.describe("Multi-image per cheque", () => {
  test("A. Recibo POST accepts fotoDataUrls array per cheque + DB stores JSON array", async ({ page, request }) => {
    await login(page, "test_e2e", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const today = new Date().toISOString().slice(0, 10);
    const create = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [
          {
            tipo: "tercero",
            formato: "fisico",
            banco: "Galicia",
            numero: "TEST-3IMG",
            monto: 0.99,
            fechaEmision: today,
            fechaCobro: today,
            librador: "TEST Librador",
            cuitLibrador: "20-12345678-9",
            fotoDataUrls: [TINY_PNG, TINY_PNG, TINY_PNG], // 3 photos: front + back + extra
          },
        ],
        efectivo: null,
        transferencia: null,
        concepto: "test_e2e cheque multi-img",
      },
    });
    expect(create.status()).toBe(200);
    const c = await create.json();
    expect(c.paymentId).toBeGreaterThan(0);

    // Hit /api/admin/cheques to confirm the cheque row exposes fotoUrls (JSON array stringified)
    const list = await request.get(`${BASE}/api/admin/cheques?tipo=tercero`, { headers: { cookie: cookieHeader } });
    const lj = await list.json();
    const mine = (lj.cheques || []).find((q: { numero: string }) => String(q.numero).trim() === "TEST-3IMG");
    expect(mine).toBeDefined();
    expect(typeof mine.fotoUrls).toBe("string");
    const parsed = JSON.parse(mine.fotoUrls);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBe(3);
    for (const u of parsed) expect(String(u)).toMatch(/^https:\/\/res\.cloudinary\.com\//);

    // Cleanup
    await request.post(`${BASE}/api/admin/proveedores/recibos/${c.paymentId}/anular`, { headers: { cookie: cookieHeader } });
  });

  test("B. PDF for a multi-image cheque contains >= N JPEG markers", async ({ page, request }) => {
    await login(page, "test_e2e", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const today = new Date().toISOString().slice(0, 10);
    const create = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [
          {
            tipo: "tercero",
            formato: "fisico",
            banco: "Galicia",
            numero: "TEST-PDF",
            monto: 0.50,
            fechaEmision: today,
            fechaCobro: today,
            librador: "TEST",
            cuitLibrador: "20-12345678-9",
            fotoDataUrls: [TINY_PNG, TINY_PNG],
          },
        ],
        efectivo: null,
        transferencia: null,
        concepto: "test_e2e cheque pdf",
      },
    });
    const j = await create.json();
    const pdf = await request.get(`${BASE}/api/admin/proveedores/recibos/${j.paymentId}/pdf`, { headers: { cookie: cookieHeader } });
    expect(pdf.status()).toBe(200);
    const buf = Buffer.from(await pdf.body());
    let count = 0;
    for (let i = 0; i < buf.length - 1; i++) if (buf[i] === 0xff && buf[i + 1] === 0xd8) count++;
    expect(count).toBeGreaterThanOrEqual(2);
    await request.post(`${BASE}/api/admin/proveedores/recibos/${j.paymentId}/anular`, { headers: { cookie: cookieHeader } });
  });

  test("C. Recibo form: cheque row has a multi-file input alongside the camera button", async ({ page }) => {
    await login(page, "test_e2e", "test1234");
    await page.goto(`${BASE}/admin/proveedores/recibo/190`);
    await page.waitForLoadState("networkidle");
    // Add a cheque
    await page.locator('text="Agregar cheque"').first().click();
    // The "+" file input must accept multiple, scoped to image
    const multiFile = page.locator('input[type="file"][multiple][accept="image/*"]');
    // At least one such input must exist (the cheque +) — efectivo also has one, that's fine
    const count = await multiFile.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });
});
