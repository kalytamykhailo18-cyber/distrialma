import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function loginAdmin(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', "test_e2e");
  await page.fill('input[type="password"]', "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Proveedor marcas association", () => {
  test("A. GET returns associated + available, PUT round-trips, then cleanup empties it", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // 1) Start clean
    let put0 = await request.put(`${BASE}/api/admin/proveedores/marcas`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", marcaCods: [] },
    });
    expect(put0.status()).toBe(200);

    // 2) Get available marcas for proveedor 190 (HERBAL)
    const r0 = await request.get(`${BASE}/api/admin/proveedores/marcas?cod=190`, { headers: { cookie: cookieHeader } });
    expect(r0.status()).toBe(200);
    const j0 = await r0.json();
    expect(Array.isArray(j0.associated)).toBe(true);
    expect(j0.associated.length).toBe(0);
    expect(Array.isArray(j0.available)).toBe(true);
    expect(j0.available.length).toBeGreaterThan(10);
    for (const m of j0.available.slice(0, 5)) {
      expect(typeof m.cod).toBe("string");
      expect(typeof m.nombre).toBe("string");
    }

    // 3) PUT: associate the first 2 marcas in a specific order
    const codA = j0.available[0].cod;
    const codB = j0.available[1].cod;
    const put1 = await request.put(`${BASE}/api/admin/proveedores/marcas`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", marcaCods: [codB, codA] }, // intentionally reverse to verify order
    });
    expect(put1.status()).toBe(200);
    const pj = await put1.json();
    expect(pj.count).toBe(2);

    // 4) Re-GET: associated should be [codB, codA] in that order
    const r1 = await request.get(`${BASE}/api/admin/proveedores/marcas?cod=190`, { headers: { cookie: cookieHeader } });
    const j1 = await r1.json();
    expect(j1.associated.length).toBe(2);
    expect(j1.associated[0].marcaCod).toBe(codB);
    expect(j1.associated[1].marcaCod).toBe(codA);

    // 5) Cleanup
    const put2 = await request.put(`${BASE}/api/admin/proveedores/marcas`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", marcaCods: [] },
    });
    expect(put2.status()).toBe(200);
    const r2 = await request.get(`${BASE}/api/admin/proveedores/marcas?cod=190`, { headers: { cookie: cookieHeader } });
    const j2 = await r2.json();
    expect(j2.associated.length).toBe(0);
  });

  test("B. Non-admin staff cannot PUT", async ({ page, request }) => {
    await page.goto(`${BASE}/login`);
    await page.fill('input[type="text"]', "test_e2e_staff");
    await page.fill('input[type="password"]', "test1234");
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/admin/, { timeout: 10000 });
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.put(`${BASE}/api/admin/proveedores/marcas`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", marcaCods: ["1"] },
    });
    expect(r.status()).toBe(403);
  });

  test("C. PDF: when an explicit assoc exists, it overrides the auto cross-query", async ({ page, request }) => {
    // SERENISIMA (188) auto-infers marca 83 from products. We'll force HERBAL (190)
    // to use marca 83 via explicit assoc; its PDF should then embed the brand-83 logo.
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // Set HERBAL's marca to 83 (SERENISIMA's logo)
    const put1 = await request.put(`${BASE}/api/admin/proveedores/marcas`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", marcaCods: ["83"] },
    });
    expect(put1.status()).toBe(200);

    // Create a tiny recibo for HERBAL
    const create = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [],
        efectivo: null,
        transferencia: null,
        ajuste: { monto: 0.01, motivo: "TEST explicit marca" },
        concepto: "test_e2e marca override",
      },
    });
    const j = await create.json();
    const pdf = await request.get(`${BASE}/api/admin/proveedores/recibos/${j.paymentId}/pdf`, { headers: { cookie: cookieHeader } });
    expect(pdf.status()).toBe(200);
    const buf = Buffer.from(await pdf.body());
    // The brand-83 logo embed should grow the PDF noticeably beyond a baseline ~120KB
    expect(buf.length).toBeGreaterThan(200000);

    // Cleanup: anular + remove assoc
    await request.post(`${BASE}/api/admin/proveedores/recibos/${j.paymentId}/anular`, { headers: { cookie: cookieHeader } });
    await request.put(`${BASE}/api/admin/proveedores/marcas`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", marcaCods: [] },
    });
  });

  test("D. UI: expanded panel renders 'Marcas asociadas' section + 'Editar' button (admin)", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/admin/proveedores`);
    await page.fill('input[placeholder="Filtrar proveedores..."]', "HERBAL");
    await page.locator('text="HERBAL"').first().click();
    await expect(page.locator('text=/Marcas asociadas/i').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('button:has-text("Editar")').first()).toBeVisible();
  });
});
