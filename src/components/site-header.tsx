import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { HeaderAuth } from "./header-auth";
import { LanguageToggle } from "./language-toggle";

export function SiteHeader() {
  const t = useTranslations("Header");

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          {t("siteName")}
        </Link>
        <div className="flex items-center gap-2">
          <LanguageToggle />
          <HeaderAuth />
        </div>
      </div>
    </header>
  );
}
