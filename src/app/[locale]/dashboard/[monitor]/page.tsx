import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Suspense } from "react";
import { BestTimeHeatmap } from "@/components/best-time-heatmap";
import { OutageList } from "@/components/outage-list";
import { RelativeTime } from "@/components/relative-time";
import { ResponseTimeChart } from "@/components/response-time-chart";
import { StatusBadge } from "@/components/status-badge";
import { Link } from "@/i18n/navigation";
import { requireUser } from "@/lib/auth";
import { formatResponseTime, formatUptime } from "@/lib/format";
import { getMyBestTimes, getMyMonitor, getMyOutages, getMyResponseTimes } from "@/lib/monitors";

export async function generateMetadata({ params }: PageProps<"/[locale]/dashboard/[monitor]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });
  return { title: t("title"), robots: { index: false } };
}

// Monitor ids aren't known at build time, so `params` is request data: it may
// only be read inside the Suspense boundary (in MonitorDetail), not here.
export default function MonitorPage({ params }: PageProps<"/[locale]/dashboard/[monitor]">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-xl bg-unknown-bg" aria-hidden="true" />}>
      <MonitorDetail params={params} />
    </Suspense>
  );
}

async function MonitorDetail({ params }: { params: PageProps<"/[locale]/dashboard/[monitor]">["params"] }) {
  const { locale, monitor: id } = await params;
  setRequestLocale(locale);
  await requireUser(locale);

  // Row-level security: another user's monitor id returns nothing → 404.
  const monitor = await getMyMonitor(id);
  if (!monitor) notFound();

  const [t, tSite, day, week, outages, bestTimes] = await Promise.all([
    getTranslations({ locale, namespace: "Dashboard" }),
    getTranslations({ locale, namespace: "Site" }),
    getMyResponseTimes(monitor.id, "24h"),
    getMyResponseTimes(monitor.id, "7d"),
    getMyOutages(monitor.id),
    getMyBestTimes(monitor.id),
  ]);

  return (
    <div className="space-y-8">
      <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
        <span aria-hidden="true">←</span> {t("back")}
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold sm:text-3xl">{monitor.name}</h1>
          <StatusBadge status={monitor.status} size="lg" />
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
          {monitor.last_checked_at ? (
            <span>
              {tSite("lastChecked")}: <RelativeTime date={monitor.last_checked_at} />
            </span>
          ) : (
            monitor.is_active && <span>{t("waiting")}</span>
          )}
          <a href={monitor.url} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-accent hover:underline">
            {monitor.url} <span aria-hidden="true">↗</span>
          </a>
        </div>
      </header>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={tSite("responseNow")} value={formatResponseTime(monitor.last_response_ms, locale)} />
        <Stat label={tSite("uptime24h")} value={formatUptime(monitor.uptime_24h, locale)} />
        <Stat label={tSite("uptime7d")} value={formatUptime(monitor.uptime_7d, locale)} />
        <Stat label={tSite("uptime30d")} value={formatUptime(monitor.uptime_30d, locale)} />
      </dl>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <ResponseTimeChart data={{ "24h": day, "7d": week }} />
      </section>

      <section className="rounded-xl border border-border bg-surface p-4 sm:p-6">
        <BestTimeHeatmap cells={bestTimes} since={monitor.created_at} />
      </section>

      <section>
        <OutageList outages={outages} locale={locale} since={monitor.created_at} />
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
