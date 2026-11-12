"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * Switches between /fil and /en on the same page. next-intl's proxy saves the
 * choice in the NEXT_LOCALE cookie; for signed-in users it's also saved to
 * their profile, so alert emails go out in that language.
 */
export function LanguageToggle() {
  const t = useTranslations("Header");
  const locale = useLocale();
  const pathname = usePathname();
  const other = routing.locales.find((l) => l !== locale) ?? routing.defaultLocale;

  async function saveToProfile() {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    // RLS + column grants allow a user to change only their own language.
    await supabase.from("profiles").update({ preferred_locale: other }).eq("id", userId);
  }

  return (
    <Link
      href={pathname}
      locale={other}
      onClick={() => void saveToProfile()}
      aria-label={`${t("languageLabel")}: ${t("switchTo")}`}
      className="rounded-full border border-border px-3 py-1.5 text-sm font-medium hover:bg-unknown-bg"
    >
      {t("switchTo")}
    </Link>
  );
}
