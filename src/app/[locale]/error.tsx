"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

/** Shown when loading data fails (e.g. the database is unreachable). */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("Error");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="space-y-4 py-12 text-center">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-muted">{t("body")}</p>
      <button
        type="button"
        onClick={reset}
        className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background"
      >
        {t("retry")}
      </button>
    </div>
  );
}
