import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { REPO_URL } from "@/lib/site";

// The unofficial disclaimer must be visible on every page.
export function SiteFooter() {
  const t = useTranslations("Footer");
  const tAbout = useTranslations("About");

  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-5xl space-y-3 px-4 py-6 text-xs text-muted">
        <nav className="flex gap-4 text-sm font-medium">
          <Link href="/about" className="hover:text-foreground hover:underline">
            {tAbout("navLabel")}
          </Link>
          <a href={REPO_URL} className="hover:text-foreground hover:underline" rel="noopener noreferrer">
            GitHub
          </a>
        </nav>
        <p>{t("disclaimer")}</p>
      </div>
    </footer>
  );
}
