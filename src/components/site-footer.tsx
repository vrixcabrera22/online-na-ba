import { useTranslations } from "next-intl";

// The unofficial disclaimer must be visible on every page.
export function SiteFooter() {
  const t = useTranslations("Footer");

  return (
    <footer className="border-t border-border bg-surface">
      <p className="mx-auto w-full max-w-5xl px-4 py-6 text-xs text-muted">
        {t("disclaimer")}
      </p>
    </footer>
  );
}
