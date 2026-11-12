import "server-only";
import { Resend } from "resend";
import { DEMO_EMAIL, DEMO_MONITORS, DEMO_PASSWORD } from "@/lib/demo";
import { siteUrl } from "@/lib/env";
import type { createAdminClient } from "@/lib/supabase/admin";
import type { HealthReport } from "@/lib/health";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Put the public demo account back to its known state. Anyone can log in as
 * the demo user, so anyone can change its password or monitors; this undoes
 * that once a day. Sample monitors keep their ids (and so their history).
 */
export async function resetDemo(admin: Admin): Promise<{ userId: string; removed: number }> {
  // Find or create the demo user.
  let userId: string | undefined;
  for (let page = 1; page <= 10 && !userId; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    userId = data.users.find((u) => u.email === DEMO_EMAIL)?.id;
    if (data.users.length < 200) break;
  }
  if (userId) {
    const { error } = await admin.auth.admin.updateUserById(userId, {
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { locale: "fil" },
    });
    if (error) throw new Error(`reset demo user: ${error.message}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: DEMO_EMAIL,
      password: DEMO_PASSWORD,
      email_confirm: true,
      user_metadata: { locale: "fil" },
    });
    if (error || !data.user) throw new Error(`create demo user: ${error?.message}`);
    userId = data.user.id;
  }

  await admin.from("profiles").update({ preferred_locale: "fil" }).eq("id", userId);

  // Remove anything visitors added; restore the sample monitors.
  const keep = DEMO_MONITORS.map((m) => m.id);
  const { data: removedRows } = await admin
    .from("monitors")
    .delete()
    .eq("owner_id", userId)
    .not("id", "in", `(${keep.join(",")})`)
    .select("id");

  const site = siteUrl();
  for (const m of DEMO_MONITORS) {
    const url = m.target.startsWith("/") ? `${site}${m.target}` : m.target;
    const { error } = await admin
      .from("monitors")
      .upsert({ id: m.id, name: m.name, url, owner_id: userId, is_active: true, is_public: false }, { onConflict: "id" });
    if (error) throw new Error(`restore demo monitor ${m.id}: ${error.message}`);
  }

  // Alerts off: demo@example.com can't receive mail anyway.
  await admin.from("alert_settings").update({ enabled: false }).eq("user_id", userId);

  return { userId, removed: removedRows?.length ?? 0 };
}

export async function checkHealth(admin: Admin): Promise<HealthReport> {
  const { data, error } = await admin.rpc("health_report", {});
  if (error || !data?.[0]) throw new Error(`health_report: ${error?.message ?? "no data"}`);
  return data[0];
}

/** Email the owner when something's wrong (only if HEALTH_EMAIL is set). */
export async function emailHealthProblems(problems: string[], h: HealthReport): Promise<"sent" | "skipped" | "failed"> {
  const to = process.env.HEALTH_EMAIL?.trim();
  const key = process.env.RESEND_API_KEY?.trim();
  if (!to || !key || problems.length === 0) return "skipped";
  const from = process.env.ALERTS_FROM?.trim() || "Online Na Ba? <onboarding@resend.dev>";
  const text = [
    "The daily health check found a problem:",
    "",
    ...problems.map((p) => `- ${p}`),
    "",
    `Last check: ${h.last_check_at ?? "never"}`,
    `Runs in the last 24 h: ${h.runs_24h}`,
    "",
    `Status page: ${siteUrl()}/fil`,
    "If the cron job is missing, re-run the schedule migration (supabase/migrations/*_schedule_checks.sql).",
  ].join("\n");
  const { error } = await new Resend(key).emails.send({ from, to, subject: "Online Na Ba? health check: problem found", text });
  return error ? "failed" : "sent";
}
