import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getStatusBoard } from "@/lib/status";

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

/** Every public page in both languages, each listing its other-language twin. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const sites = await getStatusBoard();
  const paths = ["", "/about", ...sites.map((s) => `/status/${s.slug}`)];

  return paths.flatMap((path) =>
    routing.locales.map((locale) => ({
      url: `${site}/${locale}${path}`,
      changeFrequency: path.startsWith("/status") || path === "" ? ("hourly" as const) : ("monthly" as const),
      priority: path === "" ? 1 : path === "/about" ? 0.5 : 0.8,
      alternates: {
        languages: Object.fromEntries(routing.locales.map((l) => [l, `${site}/${l}${path}`])),
      },
    })),
  );
}
