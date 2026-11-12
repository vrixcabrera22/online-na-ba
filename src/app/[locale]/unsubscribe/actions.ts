"use server";

import { refresh } from "next/cache";
import { setAlertSettingEnabled } from "@/lib/alerts/unsubscribe";

/** Turn alerts off (or back on) from the link in an alert email. */
export async function toggleAlertsFromEmail(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const token = String(formData.get("t") ?? "");
  const enabled = formData.get("enabled") === "true";
  await setAlertSettingEnabled(id, token, enabled);
  refresh();
}
