import { google, drive_v3 } from "googleapis";
import { Readable } from "stream";
import { prisma } from "@/lib/prisma";

const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/userinfo.email",
];

const SETTING_REFRESH = "gdrive_oauth_refresh_token";
const SETTING_EMAIL = "gdrive_oauth_user_email";

function clientCreds() {
  const id = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!id || !secret || !redirect) return null;
  return { id, secret, redirect };
}

export function getOAuthClient() {
  const c = clientCreds();
  if (!c) return null;
  return new google.auth.OAuth2(c.id, c.secret, c.redirect);
}

export function buildConsentUrl(state: string): string | null {
  const oauth = getOAuthClient();
  if (!oauth) return null;
  return oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: SCOPES,
    state,
  });
}

export async function exchangeCodeForRefreshToken(code: string): Promise<{ refreshToken: string; email: string } | null> {
  const oauth = getOAuthClient();
  if (!oauth) throw new Error("OAuth client no configurado");
  const { tokens } = await oauth.getToken(code);
  if (!tokens.refresh_token) {
    // Google only returns refresh_token on first consent or with prompt=consent.
    // We force prompt=consent above, but be defensive.
    throw new Error("Google no devolvio refresh_token. Volve a conectar.");
  }
  oauth.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: "v2", auth: oauth });
  const me = await oauth2.userinfo.get();
  return { refreshToken: tokens.refresh_token, email: me.data.email || "" };
}

export async function saveRefreshToken(refreshToken: string, email: string): Promise<void> {
  await prisma.setting.upsert({
    where: { key: SETTING_REFRESH },
    update: { value: refreshToken },
    create: { key: SETTING_REFRESH, value: refreshToken },
  });
  await prisma.setting.upsert({
    where: { key: SETTING_EMAIL },
    update: { value: email },
    create: { key: SETTING_EMAIL, value: email },
  });
}

export async function clearRefreshToken(): Promise<void> {
  await prisma.setting.deleteMany({ where: { key: { in: [SETTING_REFRESH, SETTING_EMAIL] } } });
}

export async function getDriveStatus(): Promise<{ connected: boolean; email: string | null; configured: boolean }> {
  const c = clientCreds();
  if (!c) return { connected: false, email: null, configured: false };
  const refresh = await prisma.setting.findUnique({ where: { key: SETTING_REFRESH } });
  const email = await prisma.setting.findUnique({ where: { key: SETTING_EMAIL } });
  return {
    connected: !!refresh?.value,
    email: email?.value || null,
    configured: true,
  };
}

async function getAuthedDrive(): Promise<drive_v3.Drive | null> {
  const oauth = getOAuthClient();
  if (!oauth) {
    console.log("[GDRIVE] OAuth client env vars not configured");
    return null;
  }
  const setting = await prisma.setting.findUnique({ where: { key: SETTING_REFRESH } });
  if (!setting?.value) {
    console.log("[GDRIVE] no refresh token stored — user has not connected yet");
    return null;
  }
  oauth.setCredentials({ refresh_token: setting.value });
  return google.drive({ version: "v3", auth: oauth });
}

async function findOrCreateFolder(drive: drive_v3.Drive, name: string, parentId: string): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");
  const list = await drive.files.list({
    q: `name='${safeName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id,name)",
    pageSize: 1,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existing = list.data.files?.[0];
  if (existing?.id) return existing.id;
  const created = await drive.files.create({
    requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId] },
    fields: "id",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error("Drive: no se pudo crear la carpeta " + name);
  return created.data.id;
}

/**
 * Sube un PDF al Drive del usuario conectado con la estructura:
 *   {GDRIVE_PAGOS_FOLDER_ID}/{proveedorName}/{YYYY-MM}/{filename}
 * Retorna { webViewLink } o null si Drive no esta configurado / conectado.
 * Errores no bloquean el flujo — solo se loguean.
 */
export async function uploadRecibo(
  buffer: Buffer,
  filename: string,
  proveedorName: string,
  yearMonth: string
): Promise<{ webViewLink: string | null } | null> {
  const drive = await getAuthedDrive();
  const rootId = process.env.GDRIVE_PAGOS_FOLDER_ID;
  if (!drive || !rootId) {
    console.log("[GDRIVE] not configured/connected, skipping upload");
    return null;
  }
  try {
    const safeProv = proveedorName.replace(/[/\\]/g, "-").substring(0, 80);
    const provFolderId = await findOrCreateFolder(drive, safeProv, rootId);
    const monthFolderId = await findOrCreateFolder(drive, yearMonth, provFolderId);
    const stream = Readable.from(buffer);
    const created = await drive.files.create({
      requestBody: { name: filename, mimeType: "application/pdf", parents: [monthFolderId] },
      media: { mimeType: "application/pdf", body: stream },
      fields: "id,webViewLink",
      supportsAllDrives: true,
    });
    return { webViewLink: created.data.webViewLink || null };
  } catch (e) {
    console.error("[GDRIVE] upload failed:", (e as Error).message);
    return null;
  }
}
