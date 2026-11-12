import "server-only";
import { Resend } from "resend";
import { siteUrl } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { AlertKind } from "@/lib/supabase/database.types";
import { buildAlertEmail } from "./email";
import { signUnsubscribe } from "./token";

/** Resend's free plan allows 2 requests per second. */
const SEND_INTERVAL_MS = 600;
/** Keep each checker run well within its time limit. */
const MAX_PER_RUN = 20;

export interface AlertRunResult {
  pending: number;
  sent: number;
  failed: number;
  gaveUp: number;
  skipped?: string;
}

/**
 * Errors where retrying can't help (e.g. Resend refusing a recipient while the
 * account has no verified domain). Those alerts are marked done so they don't
 * retry every 5 minutes for a day. Key/config problems and rate limits are NOT
 * permanent: they retry once fixed.
 */
function isPermanent(error: { name?: string; statusCode?: number | null }): boolean {
  if (["validation_error", "invalid_parameter", "missing_required_field"].includes(error.name ?? "")) return true;
  const code = error.statusCode ?? 0;
  return code === 403 || code === 422;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Send every pending "down"/"back up" alert (see pending_alerts() in the
 * migrations) and record what was delivered. Safe to call every run: unsent
 * alerts are retried, and Resend's idempotency key guarantees that an alert
 * sent but not yet marked (crash in between) isn't delivered twice.
 */
export async function sendPendingAlerts(supabase: ReturnType<typeof createAdminClient>): Promise<AlertRunResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const secret = process.env.CRON_SECRET;
  if (!apiKey || !secret) return { pending: 0, sent: 0, failed: 0, gaveUp: 0, skipped: "RESEND_API_KEY not set" };

  const { data: pending, error } = await supabase.rpc("pending_alerts", {});
  if (error) throw new Error(`pending_alerts failed: ${error.message}`);
  if (!pending?.length) return { pending: 0, sent: 0, failed: 0, gaveUp: 0 };

  const resend = new Resend(apiKey);
  // Until a domain is verified in Resend, only its test sender works (and only
  // to the Resend account's own email). With a domain, set ALERTS_FROM.
  const from = process.env.ALERTS_FROM?.trim() || "Online Na Ba? <onboarding@resend.dev>";
  const site = siteUrl();

  const done: { incident_id: number; kind: AlertKind }[] = [];
  let sent = 0;
  let failed = 0;
  let gaveUp = 0;

  for (const [i, alert] of pending.slice(0, MAX_PER_RUN).entries()) {
    if (i > 0) await sleep(SEND_INTERVAL_MS);
    const token = signUnsubscribe(alert.alert_setting_id, secret);
    const query = `id=${alert.alert_setting_id}&t=${token}`;
    const email = buildAlertEmail(alert, {
      dashboardUrl: `${site}/${alert.locale}/dashboard/${alert.monitor_id}`,
      unsubscribeUrl: `${site}/${alert.locale}/unsubscribe?${query}`,
    });

    const { error: sendError } = await resend.emails.send(
      {
        from,
        to: alert.recipient,
        subject: email.subject,
        html: email.html,
        text: email.text,
        headers: {
          // One-click unsubscribe (RFC 8058), shown as a button by Gmail/Outlook.
          "List-Unsubscribe": `<${site}/api/alerts/unsubscribe?${query}>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
        tags: [{ name: "type", value: `alert_${alert.kind}` }],
      },
      { idempotencyKey: `alert-${alert.incident_id}-${alert.kind}` },
    );

    if (!sendError) {
      sent++;
      done.push({ incident_id: alert.incident_id, kind: alert.kind });
    } else if (isPermanent(sendError)) {
      gaveUp++;
      done.push({ incident_id: alert.incident_id, kind: alert.kind });
      console.warn("[alerts] giving up on alert", alert.incident_id, alert.kind, sendError.name, sendError.message);
    } else {
      failed++;
      console.error("[alerts] send failed, will retry", alert.incident_id, alert.kind, sendError.name, sendError.message);
    }
  }

  if (done.length) {
    const { error: markError } = await supabase.rpc("mark_alerts_sent", { p_sent: done });
    if (markError) console.error("[alerts] mark_alerts_sent failed (idempotency keys prevent duplicates)", markError);
  }

  return { pending: pending.length, sent, failed, gaveUp };
}
