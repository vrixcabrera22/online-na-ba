import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { safeNextPath } from "@/lib/auth-helpers";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Where the sign-up confirmation email's link lands.
 *
 * Supports both link styles Supabase can send:
 * - ?code=...                  (default PKCE flow: works in the same browser
 *                               that signed up)
 * - ?token_hash=...&type=...   (works in any browser; needs a custom email
 *                               template, set up with Resend in Week 4)
 *
 * On success the user is signed in and sent on to `next` (the dashboard). If
 * the link can't sign them in (for example, opened in a different browser),
 * the email is usually confirmed anyway, so we send them to log in.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNextPath(searchParams.get("next"), "/fil/dashboard");
  const locale = next.split("/")[1] === "en" ? "en" : "fil";

  const supabase = await createSupabaseServerClient();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  let ok = false;
  if (code) {
    ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  } else if (tokenHash && type) {
    ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;
  }

  if (ok) return NextResponse.redirect(new URL(next, origin));

  // Supabase reports some failures (expired link, etc.) as ?error=... here.
  const failed = searchParams.get("error") || !(code || tokenHash);
  return NextResponse.redirect(
    new URL(`/${locale}/login?${failed ? "confirm=failed" : "confirmed=1"}`, origin),
  );
}
