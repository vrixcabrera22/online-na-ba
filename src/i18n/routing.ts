import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["fil", "en"],
  // Filipino is the default for everyone who hasn't picked a language yet.
  defaultLocale: "fil",
  // Always keep the prefix (/fil/..., /en/...) so each language has its own
  // shareable, indexable URL.
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
