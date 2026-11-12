import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { LanguageToggle } from "./language-toggle";

export function SiteHeader() {
  const t = useTranslations("Header");

  return (
    <header className="border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold">
          {t("siteName")}
        </Link>
        <LanguageToggle />
      </div>
    </header>
  );
}
