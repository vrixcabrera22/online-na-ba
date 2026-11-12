import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { OutageList } from "@/components/outage-list";
import { RelativeTime } from "@/components/relative-time";
import { ResponseTimeChart } from "@/components/response-time-chart";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { formatResponseTime, formatUptime } from "@/lib/format";
import { getRecentOutages, getResponseTimes, getSite, getStatusBoard } from "@/lib/status";

// Prerender every known site in both languages. Sites added later still work:
// they render on first visit and are cached after that.
export async function generateStaticParams() {
  const sites = await getStatusBoard();
  return sites.map((s) => ({ site: s.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/status/[site]">): Promise<Metadata> {
  const { locale, site: slug } = await params;
  const [site, t] = await Promise.all([getSite(slug), getTranslations({ locale, namespace: "Site" })]);
  if (!site) return {};
  return {
    title: t("metaTitle", { name: site.name }),
    description: t("metaDescription", { name: site.name }),
  };
}

export default async function SitePage({ params }: PageProps<"/[locale]/status/[site]">) {
  const { locale, site: slug } = await params;
  setRequestLocale(locale);

  const site = await getSite(slug);
  if (!site) notFound();

  const [t, day, week, outages] = await Promise.all([
    getTranslations({ locale, namespace: "Site" }),
    getResponseTimes(site.id, "24h"),
    getResponseTimes(site.id, "7d"),
    getRecentOutages(site.id),
  ]);

  return (
    <div className="space-y-8">
      <Link href="/" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        <span aria-hidden="true">←</span> {t("back")}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{site.name}</h1>
          <StatusBadge status={site.status} size="lg" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {site.last_checked_at && (
            <span>
              {t("lastChecked")}: <RelativeTime date={site.last_checked_at} />
            </span>
          )}
          <a
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-accent hover:underline"
          >
            {t("visit", { name: site.name })} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={t("responseNow")} value={formatResponseTime(site.last_response_ms, locale)} />
        <Stat label={t("uptime24h")} value={formatUptime(site.uptime_24h, locale)} />
        <Stat label={t("uptime7d")} value={formatUptime(site.uptime_7d, locale)} />
        <Stat label={t("uptime30d")} value={formatUptime(site.uptime_30d, locale)} />
      </dl>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <ResponseTimeChart data={{ "24h": day, "7d": week }} />
      </section>

      <section>
        <Suspense>
          <OutageList outages={outages} locale={locale} />
        </Suspense>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
