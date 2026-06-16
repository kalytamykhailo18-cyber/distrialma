import { NextRequest, NextResponse } from "next/server";
import { exchangeCodeForRefreshToken, saveRefreshToken } from "@/lib/gdrive";

export const dynamic = "force-dynamic";

// Build the public-facing redirect URL.  When nginx proxies to localhost,
// req.url shows localhost — we have to use the redirect URI we configured
// in OAuth (which is the real prod host) as the base.
function publicRedirect(path: string): string {
  const conf = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (conf) {
    try {
      const u = new URL(conf);
      return `${u.protocol}//${u.host}${path}`;
    } catch { /* fall through */ }
  }
  return path; // relative — browser keeps current host
}

// GET — Google redirects here after the user authorizes.
// We don't require staff session here because the user just came back from
// Google's consent screen and may have lost their cookies.  We protect by
// requiring an auth code + a valid token exchange.  No write happens
// without Google validating the code.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  const base = "/admin/conectar-drive";
  if (error) {
    return NextResponse.redirect(publicRedirect(`${base}?status=error&msg=${encodeURIComponent(error)}`));
  }
  if (!code) {
    return NextResponse.redirect(publicRedirect(`${base}?status=error&msg=falta_codigo`));
  }

  try {
    const result = await exchangeCodeForRefreshToken(code);
    if (!result) {
      return NextResponse.redirect(publicRedirect(`${base}?status=error&msg=sin_refresh_token`));
    }
    await saveRefreshToken(result.refreshToken, result.email);
    return NextResponse.redirect(publicRedirect(`${base}?status=ok&email=${encodeURIComponent(result.email)}`));
  } catch (e) {
    const msg = (e as Error).message || "error";
    return NextResponse.redirect(publicRedirect(`${base}?status=error&msg=${encodeURIComponent(msg)}`));
  }
}
