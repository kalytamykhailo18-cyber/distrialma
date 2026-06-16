import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function loginAdmin(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', "test_e2e");
  await page.fill('input[type="password"]', "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Recibo PDF embeds proveedor brand logos", () => {
  test("PDF for a recibo to a known-brand proveedor (SERENISIMA, cod 188) embeds extra image data in the header", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");

    // 1) Reference baseline: a recibo to a proveedor with NO branded products.
    //    HERBAL (cod 190) has 0 branded products in the test data.
    const refCreate = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "190",
        proveedorName: "HERBAL",
        cheques: [],
        efectivo: null,
        transferencia: null,
        ajuste: { monto: 0.01, motivo: "TEST ref no-logos" },
        concepto: "test_e2e ref no-logos",
      },
    });
    const refJ = await refCreate.json();
    const refPdf = await request.get(`${BASE}/api/admin/proveedores/recibos/${refJ.paymentId}/pdf`, { headers: { cookie: cookieHeader } });
    const refBuf = Buffer.from(await refPdf.body());
    // Count image XObjects (PDF embeds images as /Subtype/Image streams)
    const countImageXObjects = (buf: Buffer) => {
      const text = buf.toString("latin1");
      const matches = text.match(/\/Subtype\s*\/Image/g);
      return matches ? matches.length : 0;
    };
    const refImageCount = countImageXObjects(refBuf);

    // 2) Now create a recibo for SERENISIMA (cod 188) — has many branded products
    const create = await request.post(`${BASE}/api/admin/proveedores/recibos`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: {
        proveedorCod: "188",
        proveedorName: "SERENISIMA",
        cheques: [],
        efectivo: null,
        transferencia: null,
        ajuste: { monto: 0.01, motivo: "TEST logos" },
        concepto: "test_e2e marca logos",
      },
    });
    const j = await create.json();
    expect(j.paymentId).toBeGreaterThan(0);

    const pdf = await request.get(`${BASE}/api/admin/proveedores/recibos/${j.paymentId}/pdf`, { headers: { cookie: cookieHeader } });
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toContain("pdf");
    const buf = Buffer.from(await pdf.body());
    const imageCount = countImageXObjects(buf);

    // The branded proveedor's PDF must contain MORE image XObjects than the no-brand
    // reference (proves the marca-logos block embedded at least one logo).
    expect(imageCount).toBeGreaterThan(refImageCount);
    // And the file size should be noticeably bigger (logo PNG adds at least ~10KB)
    expect(buf.length).toBeGreaterThan(refBuf.length + 5000);

    // Cleanup both
    await request.post(`${BASE}/api/admin/proveedores/recibos/${j.paymentId}/anular`, { headers: { cookie: cookieHeader } });
    await request.post(`${BASE}/api/admin/proveedores/recibos/${refJ.paymentId}/anular`, { headers: { cookie: cookieHeader } });
  });
});
