import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { signOut } from "@/app/[locale]/(auth)/actions";
import { MonitorCard } from "@/components/monitor-card";
import { MonitorForm } from "@/components/monitor-form";
import { requireUser } from "@/lib/auth";
import { getMyLimit, getMyMonitors } from "@/lib/monitors";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  // Private page: keep it out of search results.
  return { title: t("title"), robots: { index: false } };
}

export default async function DashboardPage({ params }: PageProps<"/[locale]/dashboard">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard locale={locale} />
    </Suspense>
  );
}

async function Dashboard({ locale }: { locale: string }) {
  const user = await requireUser(locale);
  const [monitors, limit, t, tAuth] = await Promise.all([
    getMyMonitors(),
    getMyLimit(user.id),
    getTranslations({ locale, namespace: "Dashboard" }),
    getTranslations({ locale, namespace: "Auth" }),
  ]);
  const atLimit = monitors.length >= limit.max;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold sm:text-3xl">{t("title")}</h1>
          <p className="text-sm text-muted">{t("signedInAs", { email: user.email })}</p>
        </div>
        <form action={signOut}>
          <input type="hidden" name="locale" value={locale} />
          <button type="submit" className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-unknown-bg">
            {tAuth("logout")}
          </button>
        </form>
      </header>

      <section aria-labelledby="my-monitors" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="my-monitors" className="sr-only">
            {t("title")}
          </h2>
          <p className="text-sm font-medium text-muted">{t("usage", { used: monitors.length, max: limit.max })}</p>
        </div>

        {monitors.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-6 text-center">
            <p className="font-semibold">{t("emptyTitle")}</p>
            <p className="mt-1 text-sm text-muted">{t("emptyBody")}</p>
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {monitors.map((m) => (
              <MonitorCard key={m.id} monitor={m} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="add-monitor" className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <h2 id="add-monitor" className="mb-4 text-lg font-bold">
          {t("addTitle")}
        </h2>
        {atLimit ? (
          <p className="rounded-lg bg-slow-bg p-3 text-sm text-slow-fg">{t("limitReached", { max: limit.max })}</p>
        ) : (
          <MonitorForm />
        )}
      </section>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-hidden="true">
      <div className="h-16 w-64 animate-pulse rounded-lg bg-unknown-bg" />
      <div className="grid gap-3 md:grid-cols-2">
        <div className="h-48 animate-pulse rounded-xl bg-unknown-bg" />
        <div className="h-48 animate-pulse rounded-xl bg-unknown-bg" />
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-unknown-bg" />
    </div>
  );
}
