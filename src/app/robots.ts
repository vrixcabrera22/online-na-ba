import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

export default function robots(): MetadataRoute.Robots {
  // Private or pointless for search: the dashboard, unsubscribe links, APIs.
  const privatePaths = routing.locales.flatMap((l) => [`/${l}/dashboard`, `/${l}/unsubscribe`]);
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/api/", ...privatePaths] }],
    sitemap: `${site}/sitemap.xml`,
  };
}
