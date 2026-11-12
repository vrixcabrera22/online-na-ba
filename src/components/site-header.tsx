import { useTranslations } from "next-intl";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { HeaderAuth } from "./header-auth";
import { Logo } from "./logo";
import { LanguageToggle } from "./language-toggle";

const pill = "rounded-full px-3 py-1.5 text-sm font-medium";

export function SiteHeader() {
  const t = useTranslations("Header");
  const tAuth = useTranslations("Auth");
  const tAbout = useTranslations("About");

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        {/* The SVG's aria-label ("Online Na Ba?") names the link for screen readers. */}
        <Link href="/" className="shrink-0">
          <Logo className="h-5 w-auto sm:h-6" />
        </Link>
        <div className="flex items-center gap-2">
          {/* No room on phones: there, About lives in the footer. */}
          <Link href="/about" className={`${pill} hidden text-muted hover:text-foreground sm:inline`}>
            {tAbout("navLabel")}
          </Link>
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
