"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { deleteMonitor, setAlertsEnabled, setMonitorActive } from "@/app/[locale]/dashboard/actions";
import { Link } from "@/i18n/navigation";
import { formatResponseTime, formatUptime } from "@/lib/format";
import type { MyMonitor } from "@/lib/monitors";
import { MonitorForm } from "./monitor-form";
import { RelativeTime } from "./relative-time";
import { StatusBadge } from "./status-badge";

const ACCENT: Record<MyMonitor["status"], string> = {
  up: "border-l-up",
  slow: "border-l-slow",
  down: "border-l-down",
  unknown: "border-l-unknown",
  paused: "border-l-unknown",
};

/** One personal monitor on the dashboard, with edit / pause / delete. */
export function MonitorCard({ monitor, alertEmail }: { monitor: MyMonitor; alertEmail: string }) {
  const t = useTranslations("Dashboard");
  const tSite = useTranslations("Site");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const closeEdit = useCallback(() => setEditing(false), []);

  const button = "rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-unknown-bg";

  return (
    <li className={`rounded-xl border border-border border-l-4 ${ACCENT[monitor.status]} bg-surface p-4 shadow-sm`}>
      {editing ? (
        <MonitorForm monitor={monitor} onDone={closeEdit} />
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">{monitor.name}</h3>
              <p className="truncate text-sm text-muted">{monitor.url}</p>
            </div>
            <StatusBadge status={monitor.status} />
          </div>

          <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <Stat label={tSite("responseNow")} value={formatResponseTime(monitor.last_response_ms, locale)} />
            <Stat label={tSite("uptime24h")} value={formatUptime(monitor.uptime_24h, locale)} />
            <Stat label={tSite("uptime7d")} value={formatUptime(monitor.uptime_7d, locale)} />
          </dl>

          <p className="mt-2 text-xs text-muted">
            {monitor.last_checked_at ? (
              <>
                {tSite("lastChecked")}: <RelativeTime date={monitor.last_checked_at} />
              </>
            ) : monitor.is_active ? (
              t("waiting")
            ) : null}
          </p>

          <form
            action={setAlertsEnabled}
            className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2"
          >
            <input type="hidden" name="id" value={monitor.id} />
            <input type="hidden" name="enabled" value={String(!monitor.alertsEnabled)} />
            <div className="min-w-0 text-sm">
              <p className="font-medium">{monitor.alertsEnabled ? t("alertsOn") : t("alertsOff")}</p>
              {monitor.alertsEnabled && <p className="truncate text-xs text-muted">{t("alertsTo", { email: alertEmail })}</p>}
            </div>
            <button
              type="submit"
              role="switch"
              aria-checked={monitor.alertsEnabled}
              aria-label={monitor.alertsEnabled ? t("turnOff") : t("turnOn")}
              className={`relative h-6 w-11 shrink-0 rounded-full transition ${monitor.alertsEnabled ? "bg-up" : "bg-unknown"}`}
            >
              <span
                className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${monitor.alertsEnabled ? "left-[1.375rem]" : "left-0.5"}`}
              />
            </button>
          </form>

          {confirming ? (
            <form action={deleteMonitor} className="mt-4 space-y-2 rounded-lg bg-down-bg p-3">
              <input type="hidden" name="id" value={monitor.id} />
              <p className="text-sm text-down-fg">{t("confirmDelete", { name: monitor.name })}</p>
              <div className="flex gap-2">
                <button type="submit" className="rounded-lg bg-down px-3 py-1.5 text-sm font-semibold text-white">
                  {t("confirmDeleteYes")}
                </button>
                <button type="button" onClick={() => setConfirming(false)} className={`${button} bg-surface`}>
                  {t("cancel")}
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`/dashboard/${monitor.id}`} className={button}>
                {t("details")}
              </Link>
              <button type="button" onClick={() => setEditing(true)} className={button}>
                {t("edit")}
              </button>
              <form action={setMonitorActive}>
                <input type="hidden" name="id" value={monitor.id} />
                <input type="hidden" name="active" value={String(!monitor.is_active)} />
                <button type="submit" className={button}>
                  {monitor.is_active ? t("pause") : t("resume")}
                </button>
              </form>
              <button type="button" onClick={() => setConfirming(true)} className={`${button} text-down-fg`}>
                {t("delete")}
              </button>
            </div>
          )}
        </>
      )}
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
