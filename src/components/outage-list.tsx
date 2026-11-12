import { getFormatter, getTranslations } from "next-intl/server";
import { durationParts } from "@/lib/format";
import { OUTAGES_TRACKED_SINCE, type Outage } from "@/lib/status";
import { StatusIcon } from "./status-badge";

/** Recorded outages (incidents), newest first. */
export async function OutageList({
  outages,
  locale,
  since,
}: {
  outages: Outage[];
  locale: string;
  /** When recording started for this monitor (defaults to when tracking began). */
  since?: string;
}) {
  // Outages exist only from the later of the two dates.
  const from = since && since > OUTAGES_TRACKED_SINCE ? since : OUTAGES_TRACKED_SINCE;
  const [t, format] = await Promise.all([
    getTranslations({ locale, namespace: "Site" }),
    getFormatter({ locale }),
  ]);
  const when = (iso: string) =>
    format.dateTime(new Date(iso), {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <div>
      <h2 className="text-lg font-bold">{t("outagesTitle")}</h2>
      <p className="mt-1 text-sm text-muted">{t("outagesNote")}</p>

      {outages.length === 0 ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg bg-up-bg p-4 text-sm text-up-fg">
          <StatusIcon status="up" className="size-4 shrink-0" />
          {t("outagesEmpty", {
            date: format.dateTime(new Date(from), { month: "long", day: "numeric", year: "numeric" }),
          })}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-surface">
          {outages.map((o) => (
            <li key={o.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 p-4 text-sm">
              <div className="flex items-start gap-2">
                <StatusIcon status="down" className="mt-0.5 size-4 shrink-0 text-down-fg" />
                <div>
                  <p>
                    <span className="text-muted">{t("started")}:</span>{" "}
                    <time dateTime={o.startedAt}>{when(o.startedAt)}</time>
                  </p>
                  <p>
                    <span className="text-muted">{t("ended")}:</span>{" "}
                    {o.endedAt ? (
                      <time dateTime={o.endedAt}>{when(o.endedAt)}</time>
                    ) : (
                      <span className="font-semibold text-down-fg">{t("ongoing")}</span>
                    )}
                  </p>
                </div>
              </div>
              {o.durationSeconds !== null && (
                <p className="font-semibold tabular-nums">
                  <span className="sr-only">{t("lasted")}: </span>
                  {t("duration", durationParts(o.durationSeconds))}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
