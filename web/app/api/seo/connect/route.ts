import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildConsentUrl, oauthConfigured } from "@/lib/seo/gsc";

export const runtime = "nodejs";

// Starts the Google Search Console OAuth flow: sets a CSRF state cookie and
// redirects the user to Google's consent screen.
export async function GET() {
  if (!oauthConfigured()) {
    return NextResponse.json(
      { error: "Google OAuth is not configured. Set GOOGLE_OAUTH_* env vars (see README)." },
      { status: 500 },
    );
  }

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set("seo_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return NextResponse.redirect(buildConsentUrl(state));
}
