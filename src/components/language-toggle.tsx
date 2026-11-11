"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

// Switches between /fil and /en on the same page. next-intl's proxy saves the
// choice in the NEXT_LOCALE cookie, so it sticks on the next visit.
// (Saving it to the user's profile comes with accounts in Week 3.)
export function LanguageToggle() {
  const t = useTranslations("Header");
  const locale = useLocale();
  const pathname = usePathname();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  return (
    <Link
      href={pathname}
      locale={other}
      aria-label={`${t("languageLabel")}: ${t("switchTo")}`}
      className="rounded-full border border-current/20 px-3 py-1.5 text-sm font-medium hover:bg-current/5"
    >
      {t("switchTo")}
    </Link>
  );
}
