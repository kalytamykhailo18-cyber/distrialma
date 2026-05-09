import { test, expect } from "@playwright/test";

const BASE = "http://localhost:3000";
const STAFF_USER = "test_e2e";
const STAFF_PASS = "test1234";

// Helper: login as staff
async function loginStaff(page: any) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', STAFF_USER);
  await page.fill('input[type="password"]', STAFF_PASS);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Staff Login + Panel de Control", () => {
  test("login redirects staff to /admin dashboard", async ({ page }) => {
    await loginStaff(page);
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.locator("h1")).toContainText("Panel de Control");
  });

  test("dashboard shows 6 widget cards", async ({ page }) => {
    await loginStaff(page);
    await page.waitForSelector("text=Ventas hoy", { timeout: 10000 });
    await expect(page.locator("text=Ventas hoy")).toBeVisible();
    await expect(page.locator("text=Pedidos web")).toBeVisible();
    await expect(page.locator("text=Stock critico")).toBeVisible();
    await expect(page.locator("text=sin leer").first()).toBeVisible();
    await expect(page.locator("text=Bot Mily")).toBeVisible();
  });

  test("quick links section visible", async ({ page }) => {
    await loginStaff(page);
    await page.waitForSelector("text=Acceso rapido", { timeout: 10000 });
    await expect(page.locator("text=Acceso rapido")).toBeVisible();
  });
});

test.describe("Control Horario", () => {
  test("page loads with employee selector and month picker", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/control-horario`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Control Horario");
    await expect(page.locator('input[type="month"]')).toBeVisible();
  });

  test("config tab shows employee list", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/control-horario`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await page.locator("button:has-text('Config')").nth(1).click();
    await page.waitForSelector("text=Refrescar", { timeout: 10000 });
    await expect(page.locator("table")).toBeVisible();
  });
});

test.describe("Liquidacion", () => {
  test("page loads with employee selector", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/liquidacion`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Liquidacion de Sueldos");
  });

  test("sueldos tab shows salary config table", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/liquidacion`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await page.locator("button:has-text('Sueldos')").click();
    await page.waitForSelector("th:has-text('Basico')", { timeout: 10000 });
    await expect(page.locator("th:has-text('Basico')")).toBeVisible();
  });

  test("pagare checkbox exists next to PDF button", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/liquidacion`);
    await page.waitForSelector("text=Haberes", { timeout: 15000 });
    await expect(page.locator("text=Pagare")).toBeVisible();
    await expect(page.locator("text=PDF")).toBeVisible();
  });
});

test.describe("Alertas Stock", () => {
  test("page loads with config and product list", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/alertas-stock`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Alertas de Stock");
  });
});

test.describe("Ventas Perdidas", () => {
  test("page loads with period buttons", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/ventas-perdidas`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Ventas Perdidas");
    await expect(page.locator("text=7 dias")).toBeVisible();
    await expect(page.locator("text=14 dias")).toBeVisible();
    await expect(page.locator("text=30 dias")).toBeVisible();
  });
});

test.describe("Deuda Auto", () => {
  test("page loads with config section", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/notificaciones/deuda-auto`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Recordatorios de Deuda");
    await expect(page.locator("text=Envio automatico")).toBeVisible();
  });
});

test.describe("Resumen Productos", () => {
  test("week buttons visible", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/resumen-productos`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await expect(page.locator("text=Esta semana")).toBeVisible();
    await expect(page.locator("text=Semana anterior")).toBeVisible();
  });

  test("PDF sin precios button visible", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/resumen-productos`);
    await page.waitForSelector("text=PDF sin precios", { timeout: 10000 });
    await expect(page.locator("text=PDF sin precios")).toBeVisible();
  });
});

test.describe("Cheques", () => {
  test("defaults to Pendientes filter", async ({ page }) => {
    await loginStaff(page);
    await page.goto(`${BASE}/admin/cheques`);
    await page.waitForSelector("text=Pendientes", { timeout: 10000 });
    // Pendientes button should be active (brand color)
    const pendientesBtn = page.locator("button >> text=Pendientes").first();
    await expect(pendientesBtn).toBeVisible();
  });
});

test.describe("Mobile Zoom Fix", () => {
  test("inputs have 16px font on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`${BASE}/productos`);
    await page.waitForSelector("input", { timeout: 10000 });
    const input = page.locator("input").first();
    const fontSize = await input.evaluate((el) => window.getComputedStyle(el).fontSize);
    expect(parseInt(fontSize)).toBeGreaterThanOrEqual(16);
  });
});

test.describe("Bot Status", () => {
  test("Mily bot is connected", async ({}) => {
    const res = await fetch("http://localhost:3099/status");
    const data = await res.json();
    expect(["conectado", "autenticado"]).toContain(data.status);
  });
});

test.describe("Pedido Enviado", () => {
  test("page shows thank you message", async ({ page }) => {
    await page.goto(`${BASE}/pedido-enviado`);
    await page.waitForSelector("h1", { timeout: 10000 });
    await expect(page.locator("h1")).toContainText("Pedido enviado");
    await expect(page.locator("text=Gracias por tu compra")).toBeVisible();
  });
});

test.describe("No WhatsApp button on admin", () => {
  test("WhatsApp floating button hidden on admin pages", async ({ page }) => {
    await loginStaff(page);
    await page.waitForSelector("h1", { timeout: 10000 });
    // WhatsApp button should not be visible
    const waButton = page.locator('[class*="whatsapp"], [href*="wa.me"]');
    await expect(waButton).toHaveCount(0);
  });
});
