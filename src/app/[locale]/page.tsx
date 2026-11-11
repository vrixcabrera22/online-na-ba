import { useTranslations } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { use } from "react";

// Placeholder home page. The real status board is built in Week 2.
export default function HomePage({ params }: PageProps<"/[locale]">) {
  const { locale } = use(params);
  setRequestLocale(locale);
  const t = useTranslations("Home");

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
      <p className="text-base opacity-80">{t("tagline")}</p>
      <p className="rounded-lg border border-current/15 p-4 text-sm">
        {t("comingSoon")}
      </p>
    </section>
  );
}
