"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

/**
 * "Log in" or "Dashboard" in the header. Rendered in the browser so the public
 * status pages stay fully cached (no per-visitor server rendering).
 * Re-checks on every navigation, because logging in/out happens in server
 * actions that set cookies without a browser auth event.
 */
export function HeaderAuth() {
  const t = useTranslations("Auth");
  const pathname = usePathname();
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setSignedIn(Boolean(session)));
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [pathname]);

  const base = "rounded-full px-3 py-1.5 text-sm font-medium";

  // Same width while loading, so the header doesn't shift.
  if (signedIn === null) return <span className={`${base} invisible`} aria-hidden="true">{t("dashboard")}</span>;

  return signedIn ? (
    <Link href="/dashboard" className={`${base} bg-foreground text-background`}>
      {t("dashboard")}
    </Link>
  ) : (
    <Link href="/login" className={`${base} bg-foreground text-background`}>
      {t("loginLink")}
    </Link>
  );
}
