// TEMPORARY local preview with sample data. Not committed.
import { setRequestLocale } from "next-intl/server";
import { OutageList } from "@/components/outage-list";
import { ResponseTimeChart } from "@/components/response-time-chart";
import { StatusBadge } from "@/components/status-badge";

const base = Date.parse("2026-11-12T00:00:00Z");
const day = Array.from({ length: 60 }, (_, i) => {
  const down = i >= 20 && i < 24;
  return {
    bucket: new Date(base + i * 5 * 60_000).toISOString(),
    avg_response_ms: down ? null : 300 + Math.round(200 * Math.sin(i / 5)) + (i > 40 ? 4000 : 0),
    total: 1,
    down: down ? 1 : 0,
  };
});

export default async function Preview({ params }: PageProps<"/[locale]/zz-preview">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-2">
        <StatusBadge status="up" /> <StatusBadge status="slow" /> <StatusBadge status="down" />{" "}
        <StatusBadge status="unknown" />
      </div>
      <section className="rounded-xl border border-border bg-surface p-4">
        <ResponseTimeChart data={{ "24h": day, "7d": day }} />
      </section>
      <OutageList
        locale={locale}
        outages={[
          { id: 3, startedAt: "2026-11-12T03:00:00Z", endedAt: null, durationSeconds: null },
          { id: 2, startedAt: "2026-11-11T22:10:00Z", endedAt: "2026-11-11T23:15:00Z", durationSeconds: 3900 },
          { id: 1, startedAt: "2026-11-10T01:00:00Z", endedAt: "2026-11-10T01:10:00Z", durationSeconds: 600 },
        ]}
      />
    </div>
  );
}
