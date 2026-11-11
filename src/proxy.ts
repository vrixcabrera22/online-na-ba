import createMiddleware from "next-intl/middleware";
import { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const handleI18nRouting = createMiddleware(routing);

export default function proxy(request: NextRequest) {
  // next-intl picks a locale from: the URL, then the NEXT_LOCALE cookie, then
  // the browser's Accept-Language header. Most phones in the Philippines send
  // English, which would override our Filipino default. So we drop that header:
  // visitors get Filipino unless they've chosen English with the toggle (cookie).
  const headers = new Headers(request.headers);
  headers.delete("accept-language");

  return handleI18nRouting(new NextRequest(request, { headers }));
}

export const config = {
  // Run on every page, but skip API routes, Next.js internals and files with an
  // extension (favicon.ico, images, etc.).
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
