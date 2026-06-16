import { test, expect, Page } from "@playwright/test";

const BASE = "http://localhost:3000";

async function loginAdmin(page: Page) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="text"]', "test_e2e");
  await page.fill('input[type="password"]', "test1234");
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/admin/, { timeout: 10000 });
}

test.describe("Conectar Drive — page + OAuth start flow", () => {
  test("GET status returns configured=true (post-connect: connected=true with email)", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.get(`${BASE}/api/admin/conectar-drive`, { headers: { cookie: cookieHeader } });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.configured).toBe(true);
    // Drive is connected now — verify the state reflects that
    expect(j.connected).toBe(true);
    expect(j.email).toContain("@");
  });

  test("Page renders 'Desconectar' (post-connect) and not 'Falta configuracion'", async ({ page }) => {
    await loginAdmin(page);
    await page.goto(`${BASE}/admin/conectar-drive`);
    await expect(page.locator('text=/Desconectar/i').first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=/Falta configuracion/i')).toHaveCount(0);
  });

  test("POST {action:connect} returns a Google consent URL with correct params", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.post(`${BASE}/api/admin/conectar-drive`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { action: "connect" },
    });
    expect(r.status()).toBe(200);
    const j = await r.json();
    expect(j.url).toBeTruthy();
    const u = new URL(j.url);
    expect(u.host).toBe("accounts.google.com");
    expect(u.searchParams.get("response_type")).toBe("code");
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("prompt")).toBe("consent");
    // scope must include drive.file
    expect(u.searchParams.get("scope")).toContain("drive");
    // client_id matches what we wired
    expect(u.searchParams.get("client_id")).toMatch(/\.apps\.googleusercontent\.com$/);
    // redirect URI matches what we wired
    expect(u.searchParams.get("redirect_uri")).toBe("https://distrialma.com.ar/api/admin/conectar-drive/callback");
  });

  test("Callback with an error param redirects back to the page with status=error AND to the public host (not localhost)", async ({ request }) => {
    const r = await request.get(`${BASE}/api/admin/conectar-drive/callback?error=access_denied`, {
      maxRedirects: 0,
    });
    expect(r.status()).toBe(307);
    const location = r.headers()["location"] || "";
    expect(location).toContain("/admin/conectar-drive");
    expect(location).toContain("status=error");
    expect(location).toContain("access_denied");
    // CRITICAL: redirect must use the prod host from GOOGLE_OAUTH_REDIRECT_URI,
    // not the localhost the Next.js server saw via nginx proxy.
    expect(location).toContain("distrialma.com.ar");
    expect(location).not.toMatch(/localhost/i);
  });

  test("Consent URL requests both drive.file AND userinfo.email scopes", async ({ page, request }) => {
    await loginAdmin(page);
    const cookies = await page.context().cookies();
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    const r = await request.post(`${BASE}/api/admin/conectar-drive`, {
      headers: { "content-type": "application/json", cookie: cookieHeader },
      data: { action: "connect" },
    });
    expect(r.status()).toBe(200);
    const j = await r.json();
    const u = new URL(j.url);
    const scope = u.searchParams.get("scope") || "";
    // Both scopes must be present so we can fetch the user's email post-consent
    expect(scope).toContain("drive.file");
    expect(scope).toContain("userinfo.email");
  });

  // (Post-connect: the equivalent of this test is in changes-2026-06-11f-gdrive-live.spec.ts,
  //  which asserts driveUrl IS populated. The pre-connect assertion is no longer reachable.)
});
