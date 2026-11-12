import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyUnsubscribe } from "./token";

/**
 * Unsubscribe links work without logging in, so these use the server-only
 * admin client. They act on exactly one alert setting, and only when the
 * link's signature matches that setting's id.
 */

const UUID = /^[0-9a-f-]{36}$/i;

export interface UnsubscribeTarget {
  id: string;
  enabled: boolean;
  monitorName: string;
}

export async function findUnsubscribeTarget(id: string, token: string): Promise<UnsubscribeTarget | null> {
  if (!UUID.test(id) || !verifyUnsubscribe(id, token, process.env.CRON_SECRET)) return null;
  const { data } = await createAdminClient()
    .from("alert_settings")
    .select("id, enabled, monitors(name)")
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  // Embedded relation from the foreign key (one monitor per setting).
  const monitor = data.monitors as unknown as { name: string } | null;
  return { id: data.id, enabled: data.enabled, monitorName: monitor?.name ?? "" };
}

export async function setAlertSettingEnabled(id: string, token: string, enabled: boolean): Promise<boolean> {
  if (!UUID.test(id) || !verifyUnsubscribe(id, token, process.env.CRON_SECRET)) return false;
  const { error } = await createAdminClient().from("alert_settings").update({ enabled }).eq("id", id);
  return !error;
}
