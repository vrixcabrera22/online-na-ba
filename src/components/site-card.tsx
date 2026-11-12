import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { formatResponseTime, formatUptime } from "@/lib/format";
import type { Site } from "@/lib/status";
import { RelativeTime } from "./relative-time";
import { StatusBadge } from "./status-badge";

const ACCENT: Record<Site["status"], string> = {
  up: "border-l-up",
  slow: "border-l-slow",
  down: "border-l-down",
  unknown: "border-l-unknown",
};

/** One site on the status board. The whole card links to its detail page. */
export function SiteCard({ site }: { site: Site }) {
  const t = useTranslations("Home");
  const locale = useLocale();

  return (
    <li>
      <Link
        href={`/status/${site.slug}`}
        className={`block h-full rounded-xl border border-border border-l-4 ${ACCENT[site.status]} bg-surface p-4 shadow-sm transition hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`}
      >
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-semibold leading-snug">{site.name}</h3>
          <StatusBadge status={site.status} />
        </div>

        <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
          <Stat label={t("responseTime")} value={formatResponseTime(site.last_response_ms, locale)} />
          <Stat label={t("uptime24h")} value={formatUptime(site.uptime_24h, locale)} />
          <Stat label={t("uptime7d")} value={formatUptime(site.uptime_7d, locale)} />
        </dl>

        {site.last_checked_at && (
          <p className="mt-3 text-xs text-muted">
            {t("lastChecked")}: <RelativeTime date={site.last_checked_at} />
          </p>
        )}
      </Link>
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
    </div>
  );
}
