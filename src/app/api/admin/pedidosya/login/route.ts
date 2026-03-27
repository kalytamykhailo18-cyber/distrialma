import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

// Global state to hold browser between login and verify steps
declare global {
  // eslint-disable-next-line no-var
  var peyaBrowser: import("puppeteer").Browser | null;
  // eslint-disable-next-line no-var
  var peyaPage: import("puppeteer").Page | null;
}

globalThis.peyaBrowser = globalThis.peyaBrowser || null;
globalThis.peyaPage = globalThis.peyaPage || null;

async function cleanup() {
  try {
    if (globalThis.peyaBrowser) {
      await globalThis.peyaBrowser.close();
    }
  } catch {}
  globalThis.peyaBrowser = null;
  globalThis.peyaPage = null;
}

// POST: Start login flow (email + password → triggers 2FA)
export async function POST(req: NextRequest) {
  if (!(await requireStaff())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  try {
    const { action, code } = await req.json();

    if (action === "verify") {
      // Step 2: Enter 2FA code — don't cleanup, we need the browser!
      return await handleVerify(code);
    }

    // Step 1: Login with credentials — cleanup any previous session first
    await cleanup();
    return await handleLogin();
  } catch (error: unknown) {
    await cleanup();
    const msg = error instanceof Error ? error.message : "Error desconocido";
    console.error("PeYa login error:", error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function handleLogin() {
  const puppeteer = await import("puppeteer");
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
    defaultViewport: { width: 1280, height: 900 },
  });

  globalThis.peyaBrowser = browser;
  const page = await browser.newPage();
  globalThis.peyaPage = page;

  await page.goto("https://portal-app.pedidosya.com/", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });
  await new Promise((r) => setTimeout(r, 2000));

  // Type credentials
  await page.click("#login-email-field");
  await page.keyboard.type("Gdpsistemas2012@gmail.com", { delay: 15 });
  await page.click("#login-password-field");
  await page.keyboard.type("yosoyy1234", { delay: 15 });

  // Click login
  await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll("button"));
    const login = btns.find((b) => b.textContent?.trim() === "Log in");
    if (login) login.click();
  });

  await new Promise((r) => setTimeout(r, 5000));
  const url = page.url();

  if (url.includes("2fa")) {
    return NextResponse.json({ status: "need_2fa" });
  } else if (url.includes("dashboard")) {
    // No 2FA needed — extract token
    const token = await extractAndSaveToken(page);
    await cleanup();
    return NextResponse.json({ status: "logged_in", token: !!token });
  } else {
    await cleanup();
    return NextResponse.json({ error: "Login falló. Verificá las credenciales." }, { status: 400 });
  }
}

async function handleVerify(code: string) {
  const page = globalThis.peyaPage;
  if (!page) {
    return NextResponse.json({ error: "Sesión de login expirada. Intentá de nuevo." }, { status: 400 });
  }

  // Enter 2FA code
  const inputs = await page.$$("input");
  const visibleInputs: import("puppeteer").ElementHandle<HTMLInputElement>[] = [];
  for (const inp of inputs) {
    const visible = await page.evaluate(
      (el) => el.offsetParent !== null && el.type !== "hidden",
      inp
    );
    if (visible) visibleInputs.push(inp as import("puppeteer").ElementHandle<HTMLInputElement>);
  }

  if (visibleInputs.length >= 6) {
    for (let i = 0; i < 6; i++) {
      await visibleInputs[i].focus();
      await page.keyboard.type(code[i]);
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  // Wait for redirect to dashboard
  await new Promise((r) => setTimeout(r, 8000));
  const url = page.url();

  if (url.includes("dashboard")) {
    const token = await extractAndSaveToken(page);
    await cleanup();
    return NextResponse.json({ status: "logged_in", token: !!token });
  } else {
    // Code might be wrong
    await cleanup();
    return NextResponse.json({ error: "Código incorrecto o expirado. Intentá de nuevo." }, { status: 400 });
  }
}

async function extractAndSaveToken(page: import("puppeteer").Page): Promise<boolean> {
  const cookies = await page.cookies();
  const accessToken = cookies.find((c) => c.name === "accessToken")?.value;
  const refreshToken = cookies.find((c) => c.name === "refreshToken")?.value;

  if (!accessToken) return false;

  await prisma.setting.upsert({
    where: { key: "peya_access_token" },
    update: { value: accessToken },
    create: { key: "peya_access_token", value: accessToken },
  });

  if (refreshToken) {
    await prisma.setting.upsert({
      where: { key: "peya_refresh_token" },
      update: { value: refreshToken },
      create: { key: "peya_refresh_token", value: refreshToken },
    });
  }

  console.log("PeYa token saved, length:", accessToken.length);
  return true;
}
