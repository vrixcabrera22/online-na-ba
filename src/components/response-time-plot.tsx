"use client";

import { useLocale, useTranslations } from "next-intl";
import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatResponseTime } from "@/lib/format";
import type { ResponseTimeRange } from "@/lib/supabase/database.types";

export interface ChartRow {
  t: number;
  ms: number | null;
  /** Set (to 0, the bottom of the chart) when the bucket had down checks. */
  downMarker: number | null;
  down: number;
  total: number;
}

/**
 * The Recharts drawing only. Loaded lazily by ResponseTimeChart, because
 * Recharts is the biggest dependency on the page.
 */
export default function ResponseTimePlot({ rows, range }: { rows: ChartRow[]; range: ResponseTimeRange }) {
  const t = useTranslations("Site");
  const locale = useLocale();
  const gradientId = useId();

  // Times on the chart are Manila time, whatever the visitor's own time zone.
  const tick = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Manila",
    ...(range === "24h" ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric" }),
  });
  const full = new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Manila",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <ResponsiveContainer width="100%" height="100%">
      {/* Decorative for screen readers (the summary above says the same), so
          keep it out of the keyboard tab order. */}
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} accessibilityLayer={false}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(v: number) => tick.format(v)}
          stroke="var(--muted)"
          fontSize={12}
          minTickGap={24}
        />
        <YAxis
          stroke="var(--muted)"
          fontSize={12}
          width={64}
          tickFormatter={(v: number) => formatResponseTime(v, locale)}
        />
        <Tooltip
          labelFormatter={(v) => full.format(Number(v))}
          formatter={(value, name, item) => {
            const row = (item as { payload?: ChartRow }).payload;
            if (name === "downMarker" || (row && row.ms === null)) return [t("downPoint"), ""];
            return [formatResponseTime(Number(value), locale), t("chartTitle")];
          }}
          contentStyle={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            color: "var(--foreground)",
          }}
        />
        <Area
          type="monotone"
          dataKey="ms"
          stroke="var(--accent)"
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          connectNulls={false}
          isAnimationActive={false}
        />
        <Scatter dataKey="downMarker" fill="var(--down)" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
