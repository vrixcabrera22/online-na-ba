// Builds the "down" and "back up" alert emails (pure: unit tested).
// All text comes from the messages files, in the recipient's language.

import { createTranslator } from "next-intl";
import en from "../../../messages/en.json";
import fil from "../../../messages/fil.json";
import { durationParts } from "@/lib/format";
import type { Locale, PendingAlert } from "@/lib/supabase/database.types";

const MESSAGES = { fil, en } as const;

export interface AlertEmail {
  subject: string;
  html: string;
  text: string;
}

/** Map a checks.error value to a friendly reason key. */
export function reasonKey(error: string | null): "timeout" | "blocked" | "dns" | "refused" | "tls" | "other" {
  if (!error) return "other";
  if (error === "timeout") return "timeout";
  if (error === "blocked address") return "blocked";
  if (/ENOTFOUND|EAI_AGAIN/.test(error)) return "dns";
  if (/ECONNREFUSED|ECONNRESET/.test(error)) return "refused";
  if (/CERT|SSL|TLS/i.test(error)) return "tls";
  return "other";
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export function buildAlertEmail(
  alert: PendingAlert,
  links: { dashboardUrl: string; unsubscribeUrl: string },
): AlertEmail {
  const locale: Locale = alert.locale === "en" ? "en" : "fil";
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "Email" });
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: "Asia/Manila",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

  const name = alert.monitor_name;
  const url = alert.monitor_url;
  const isDown = alert.kind === "down";

  const subject = isDown ? t("downSubject", { name }) : t("upSubject", { name });
  const heading = isDown ? t("downHeading", { name }) : t("upHeading", { name });
  const body = isDown
    ? t("downBody", { url, time: when(alert.started_at) })
    : t("upBody", { url, time: when(alert.ended_at ?? alert.started_at) });

  const detail = isDown
    ? t("reason", {
        reason:
          reasonKey(alert.last_error) === "other"
            ? t("reasons.other", { error: alert.last_error ?? "—" })
            : t(`reasons.${reasonKey(alert.last_error)}`),
      })
    : t("downFor", { duration: t("duration", durationParts(alert.duration_seconds ?? 0)).trim() });

  const footer = t("footer", { name });
  const unsubscribe = t("unsubscribe");
  const cta = t("viewDashboard");
  const color = isDown ? "#b91c1c" : "#15803d";
  const bg = isDown ? "#fee2e2" : "#dcfce7";

  const text = [heading, "", body, detail, "", `${cta}: ${links.dashboardUrl}`, "", "—", footer, `${unsubscribe}: ${links.unsubscribeUrl}`].join(
    "\n",
  );

  // Table layout + inline styles: what email clients render reliably.
  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:16px">Online Na Ba?</td></tr>
<tr><td style="padding:24px">
<p style="margin:0 0 16px;display:inline-block;padding:6px 12px;border-radius:999px;background:${bg};color:${color};font-weight:700;font-size:14px">${escapeHtml(isDown ? "● " : "✓ ")}${escapeHtml(heading)}</p>
<p style="margin:0 0 8px;font-size:15px;line-height:1.5">${escapeHtml(body)}</p>
<p style="margin:0 0 24px;font-size:15px;line-height:1.5;color:#475569">${escapeHtml(detail)}</p>
<a href="${escapeHtml(links.dashboardUrl)}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;font-size:14px">${escapeHtml(cta)}</a>
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:12px;line-height:1.5;color:#64748b">
${escapeHtml(footer)}<br><a href="${escapeHtml(links.unsubscribeUrl)}" style="color:#64748b">${escapeHtml(unsubscribe)}</a>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
