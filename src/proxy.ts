import { createServerClient } from "@supabase/ssr";
import createMiddleware from "next-intl/middleware";
import { NextRequest, type NextResponse } from "next/server";
import { routing } from "./i18n/routing";
import { publicSupabaseEnv } from "./lib/supabase/env";

const handleI18nRouting = createMiddleware(routing);

export default async function proxy(request: NextRequest) {
  // 1. Language routing.
  // next-intl picks a locale from: the URL, then the NEXT_LOCALE cookie, then
  // the browser's Accept-Language header. Most phones in the Philippines send
  // English, which would override our Filipino default. So we drop that header:
  // visitors get Filipino unless they've chosen English with the toggle (cookie).
  const headers = new Headers(request.headers);
  headers.delete("accept-language");
  const response = handleI18nRouting(new NextRequest(request, { headers }));

  // 2. Keep the login session fresh. Only for visitors who have a Supabase
  // auth cookie, so anonymous visitors (most traffic) skip this entirely.
  if (request.cookies.getAll().some((c) => c.name.startsWith("sb-"))) {
    await refreshSession(request, response);
  }

  return response;
}

/**
 * Refreshes an expiring access token and writes the new cookies to both the
 * request (so the page being rendered sees them) and the response.
 */
async function refreshSession(request: NextRequest, response: NextResponse) {
  const { url, key } = publicSupabaseEnv();
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (toSet, cacheHeaders) => {
        toSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          response.cookies.set(name, value, options);
        });
        // Responses that set auth cookies must never be cached by a CDN.
        Object.entries(cacheHeaders).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });
  // Don't put code between client creation and this call: it's what triggers
  // the refresh. getClaims() validates the token and refreshes it if needed.
  await supabase.auth.getClaims();
}

export const config = {
  // Run on every page, but skip API routes, Next.js internals and files with an
  // extension (favicon.ico, images, etc.).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
