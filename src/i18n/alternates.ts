import type { Metadata } from "next";
import { routing } from "./routing";

/**
 * Canonical URL + hreflang links for a page, so Google knows /fil/x and /en/x
 * are the same page in two languages. `path` is the part after the locale,
 * e.g. "" for the homepage or "/status/sss".
 */
export function localeAlternates(locale: string, path: string): Metadata["alternates"] {
  const languages: Record<string, string> = {};
  for (const l of routing.locales) languages[l] = `/${l}${path}`;
  languages["x-default"] = `/${routing.defaultLocale}${path}`;
  return { canonical: `/${locale}${path}`, languages };
}
