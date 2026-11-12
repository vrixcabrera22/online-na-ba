import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { Link } from "@/i18n/navigation";
import { findUnsubscribeTarget } from "@/lib/alerts/unsubscribe";
import { toggleAlertsFromEmail } from "./actions";

export async function generateMetadata({ params }: PageProps<"/[locale]/unsubscribe">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Unsubscribe" });
  return { title: t("title"), robots: { index: false } };
}

/**
 * Landing page for the "stop alerts" link in alert emails. It asks for a click
 * instead of unsubscribing on load, because some mail apps open every link in
 * an email to scan it.
 */
export default async function UnsubscribePage({ params, searchParams }: PageProps<"/[locale]/unsubscribe">) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Unsubscribe" });
  return (
    <div className="mx-auto max-w-md space-y-6 py-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-unknown-bg" />}>
        <Body locale={locale} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function Body({
  locale,
  searchParams,
}: {
  locale: string;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, t] = await Promise.all([searchParams, getTranslations({ locale, namespace: "Unsubscribe" })]);
  const id = typeof params.id === "string" ? params.id : "";
  const token = typeof params.t === "string" ? params.t : "";
  const target = await findUnsubscribeTarget(id, token);

  const box = "space-y-4 rounded-xl border border-border bg-surface p-6";
  const button = "rounded-lg px-4 py-2 text-sm font-semibold";

  if (!target) {
    return (
      <div className={box}>
        <p className="text-down-fg">{t("invalid")}</p>
        <Link href="/" className="inline-block text-sm font-medium text-accent hover:underline">
          {t("home")}
        </Link>
      </div>
    );
  }

  return (
    <form action={toggleAlertsFromEmail} className={box}>
      <input type="hidden" name="id" value={target.id} />
      <input type="hidden" name="t" value={token} />
      <input type="hidden" name="enabled" value={String(!target.enabled)} />
      {target.enabled ? (
        <>
          <p>{t("question", { name: target.monitorName })}</p>
          <button type="submit" className={`${button} bg-foreground text-background`}>
            {t("turnOff")}
          </button>
        </>
      ) : (
        <>
          <p role="status" className="text-up-fg">
            {t("offDone", { name: target.monitorName })}
          </p>
          <button type="submit" className={`${button} border border-border`}>
            {t("turnOnAgain")}
          </button>
        </>
      )}
    </form>
  );
}
