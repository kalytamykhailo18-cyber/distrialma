import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function login(page: Page, user: string, pass: string) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', user);
  await page.fill('input[type="password"]', pass);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

// 1x1 PNG, base64 encoded, used as a fake remito to avoid any Cloudinary cropping.
const TINY_PNG_DATAURL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.describe("Efectivo multi-image, no crop", () => {
  test("A. Recibo POST accepts multiple efectivo dataURLs; payment row carries them through GET", async ({ page, request }) => {
    await login(page, "test_e2e", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const create = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [],
        efectivo: { monto: 2.34, imagenesDataUrls: [TINY_PNG_DATAURL, TINY_PNG_DATAURL, TINY_PNG_DATAURL] },
        transferencia: null,
        concepto: "test_e2e multi remito",
      },
    });
    expect(create.status()).toBe(200);
    const c = await create.json();
    expect(c.ok).toBe(true);
    expect(c.paymentId).toBeGreaterThan(0);

    // Read back through /payments and assert 3 efectivoImagenes
    const payments = await request.get(`${BASE}/api/admin/proveedores/payments?cod=190`, { headers: { cookie: cookieHeader } });
    const pj = await payments.json();
    const mine = (pj.payments || []).find((p: { id: number }) => p.id === c.paymentId);
    expect(mine).toBeDefined();
    expect(Array.isArray(mine.efectivoImagenes)).toBe(true);
    expect(mine.efectivoImagenes.length).toBe(3);
    for (const u of mine.efectivoImagenes) {
      expect(String(u)).toMatch(/^https:\/\/res\.cloudinary\.com\//);
    }

    // Cleanup
    await request.post(`${BASE}/api/admin/proveedores/recibos/${c.paymentId}/anular`, { headers: { cookie: cookieHeader } });
  });

  test("B. Pago rapido PUT accepts efectivoImagenes array; history row carries all of them", async ({ page, request }) => {
    await login(page, "test_e2e", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // Upload two images via the dedicated endpoint
    const urls: string[] = [];
    for (let i = 0; i < 2; i++) {
      const file = await fetch(TINY_PNG_DATAURL).then((r) => r.blob());
      const fd = new FormData();
      fd.append("image", file, `remito-${i}.png`);
      const up = await request.post(`${BASE}/api/admin/proveedores/upload-pago-imagen`, {
        headers: { cookie: cookieHeader },
        multipart: { image: { name: `remito-${i}.png`, mimeType: "image/png", buffer: Buffer.from(await file.arrayBuffer()) } },
      });
      expect(up.status()).toBe(200);
      const uj = await up.json();
      urls.push(uj.url);
    }
    expect(urls.length).toBe(2);

    // Record payment with array
    const r = await request.put(`${BASE}/api/admin/proveedores`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { cod: "190", monto: 1.11, concepto: "Efectivo", efectivoImagenes: urls },
    });
    expect(r.status()).toBe(200);

    // Read history
    const payments = await request.get(`${BASE}/api/admin/proveedores/payments?cod=190`, { headers: { cookie: cookieHeader } });
    const pj = await payments.json();
    const mine = (pj.payments || []).find((p: { concepto: string; monto: number }) => p.concepto === "Efectivo" && Math.abs(p.monto - 1.11) < 0.001);
    expect(mine).toBeDefined();
    expect(Array.isArray(mine.efectivoImagenes)).toBe(true);
    expect(mine.efectivoImagenes.length).toBe(2);

    // Cleanup — anular this legacy payment too
    await request.post(`${BASE}/api/admin/proveedores/recibos/${mine.id}/anular`, { headers: { cookie: cookieHeader } });
  });

  test("C. Recibo form efectivo input is type=file with multiple attribute, no camera-crop overlay", async ({ page }) => {
    await login(page, "test_e2e", "test1234");
    await page.goto(`${BASE}/admin/proveedores/recibo/190`);
    await page.waitForLoadState("networkidle");
    // The label must say "Subir foto/s del remito" (multi-file UX), not "Tomar foto"
    await expect(page.locator('text=/Subir foto.+remito/i').first()).toBeVisible({ timeout: 8000 });
    // No "Tomar foto" button anywhere in the efectivo block now
    await expect(page.locator('text="Tomar foto"')).toHaveCount(0);
    // The underlying input must accept multiple
    const fileInput = page.locator('input[type="file"][multiple][accept^="image"]').first();
    await expect(fileInput).toBeAttached();
    const multiple = await fileInput.getAttribute("multiple");
    expect(multiple).not.toBeNull();
  });

  test("D. PDF for a recibo with multiple efectivo images contains the image data (more than one JPEG marker)", async ({ page, request }) => {
    await login(page, "test_e2e", "test1234");
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const create = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [],
        efectivo: { monto: 1.0, imagenesDataUrls: [TINY_PNG_DATAURL, TINY_PNG_DATAURL] },
        transferencia: null,
        concepto: "test_e2e multi pdf",
      },
    });
    const c = await create.json();
    expect(c.paymentId).toBeGreaterThan(0);
    const pdf = await request.get(`${BASE}/api/admin/proveedores/recibos/${c.paymentId}/pdf`, { headers: { cookie: cookieHeader } });
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("pdf");
    // The PDF binary should contain two JPEG image start markers (ffd8) because we re-encode each thumb
    const buf = Buffer.from(await pdf.body());
    let count = 0;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === 0xff && buf[i + 1] === 0xd8) count++;
    }
    // At minimum 2 JPEGs for the 2 thumbs (plus possibly the logo, so >= 2)
    expect(count).toBeGreaterThanOrEqual(2);
    // Cleanup
    await request.post(`${BASE}/api/admin/proveedores/recibos/${c.paymentId}/anular`, { headers: { cookie: cookieHeader } });
  });
});
