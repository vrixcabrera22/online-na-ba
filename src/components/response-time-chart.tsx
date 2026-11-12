"use client";

import dynamic from "next/dynamic";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { formatResponseTime } from "@/lib/format";
import type { ResponseTimePoint, ResponseTimeRange } from "@/lib/supabase/database.types";
import type { ChartRow } from "./response-time-plot";

// Only the drawing is lazy: the title, range switch and summary render with
// the page (they're often its largest text), and Recharts loads after.
const ResponseTimePlot = dynamic(() => import("./response-time-plot"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-lg bg-unknown-bg" />,
});

function toRows(points: ResponseTimePoint[]): ChartRow[] {
  return points.map((p) => ({
    t: new Date(p.bucket).getTime(),
    ms: p.avg_response_ms,
    downMarker: p.down > 0 ? 0 : null,
    down: p.down,
    total: p.total,
  }));
}

/**
 * Response-time chart with a 24 h / 7 d switch. Both ranges are passed in
 * (≤ 288 + 168 points), so switching is instant and needs no request.
 * Gaps in the line are failed checks; red dots on the axis mark them.
 */
export function ResponseTimeChart({
  data,
}: {
  data: Record<ResponseTimeRange, ResponseTimePoint[]>;
}) {
  const t = useTranslations("Site");
  const locale = useLocale();
  const [range, setRange] = useState<ResponseTimeRange>("24h");

  const rows = toRows(data[range]);
  const total = rows.reduce((a, r) => a + r.total, 0);
  const down = rows.reduce((a, r) => a + r.down, 0);
  const timed = rows.filter((r) => r.ms !== null);
  const avg = timed.length ? timed.reduce((a, r) => a + (r.ms ?? 0), 0) / timed.length : null;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold">{t("chartTitle")}</h2>
        <div role="group" aria-label={t("rangeLabel")} className="inline-flex rounded-lg border border-border p-0.5">
          {(["24h", "7d"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              aria-pressed={range === r}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                range === r ? "bg-foreground text-background" : "text-muted hover:text-foreground"
              }`}
            >
              {r === "24h" ? t("range24h") : t("range7d")}
            </button>
          ))}
        </div>
      </div>

      {rows.length < 2 ? (
        <p className="mt-4 rounded-lg bg-unknown-bg p-4 text-sm text-muted">{t("chartEmpty")}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">
            {t("chartAverage", { avg: formatResponseTime(avg, locale) })}
            {down > 0 && <> {t("chartDown", { down, total })}</>}
          </p>
          {/* Fixed height so the page doesn't jump when the drawing loads. */}
          <div className="mt-4 h-64 w-full" aria-hidden="true">
            <ResponseTimePlot rows={rows} range={range} />
          </div>
        </>
      )}
    </div>
  );
}
