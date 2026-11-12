import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { HeaderAuth } from "./header-auth";
import { LanguageToggle } from "./language-toggle";

const pill = "rounded-full px-3 py-1.5 text-sm font-medium";

export function SiteHeader() {
  const t = useTranslations("Header");
  const tAuth = useTranslations("Auth");

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          {t("siteName")}
        </Link>
        <div className="flex items-center gap-2">
          {/* Both read the current URL. On pages whose URL isn't known at build
              time (e.g. /dashboard/[id]) that needs a Suspense boundary; the
              fallbacks are the same size, so nothing shifts. */}
          <Suspense fallback={<span className={`${pill} border border-border`}>{t("switchTo")}</span>}>
            <LanguageToggle />
          </Suspense>
          <Suspense fallback={<span className={`${pill} invisible`}>{tAuth("dashboard")}</span>}>
            <HeaderAuth />
          </Suspense>
        </div>
      </div>
    </header>
  );
}
