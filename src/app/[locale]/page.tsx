import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { StatusBoard, StatusBoardSkeleton } from "@/components/status-board";

export default async function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Home" });

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
        <p className="text-muted">{t("tagline")}</p>
      </header>

      <Suspense fallback={<StatusBoardSkeleton />}>
        <StatusBoard locale={locale} />
      </Suspense>
    </div>
  );
}
