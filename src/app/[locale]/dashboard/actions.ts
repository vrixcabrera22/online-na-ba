"use server";

import { refresh } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { monitorDbErrorKey, parseMonitorInput, type MonitorErrorKey } from "@/lib/monitor-input";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Dashboard actions. Every query runs as the signed-in user, so row-level
 * security decides what they can touch: an action with someone else's
 * monitor id simply matches no rows. The 3-monitor limit and URL rules are
 * enforced in the database as well as here.
 */

export type MonitorFormState =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "error"; error: MonitorErrorKey; name: string; url: string };

export async function createMonitor(_prev: MonitorFormState, formData: FormData): Promise<MonitorFormState> {
  const rawName = String(formData.get("name") ?? "");
  const rawUrl = String(formData.get("url") ?? "");
  const input = parseMonitorInput(rawName, rawUrl);
  if (!input.ok) return { status: "error", error: input.error, name: rawName, url: rawUrl };

  const user = await getCurrentUser();
  if (!user) return { status: "error", error: "generic", name: rawName, url: rawUrl };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("monitors").insert({ name: input.name, url: input.url, owner_id: user.id });
  if (error) return { status: "error", error: monitorDbErrorKey(error), name: rawName, url: rawUrl };

  refresh();
  return { status: "saved" };
}

export async function updateMonitor(_prev: MonitorFormState, formData: FormData): Promise<MonitorFormState> {
  const id = String(formData.get("id") ?? "");
  const rawName = String(formData.get("name") ?? "");
  const rawUrl = String(formData.get("url") ?? "");
  const input = parseMonitorInput(rawName, rawUrl);
  if (!input.ok) return { status: "error", error: input.error, name: rawName, url: rawUrl };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("monitors")
    .update({ name: input.name, url: input.url })
    .eq("id", id)
    .select("id");
  if (error) return { status: "error", error: monitorDbErrorKey(error), name: rawName, url: rawUrl };
  if (!data?.length) return { status: "error", error: "generic", name: rawName, url: rawUrl };

  refresh();
  return { status: "saved" };
}

export async function setMonitorActive(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  const supabase = await createSupabaseServerClient();
  await supabase.from("monitors").update({ is_active: active }).eq("id", id);
  refresh();
}

export async function deleteMonitor(formData: FormData): Promise<void> {
  const id = String(formData.get("id") ?? "");
  const supabase = await createSupabaseServerClient();
  // Checks, incidents and alert settings are removed by ON DELETE CASCADE.
  await supabase.from("monitors").delete().eq("id", id);
  refresh();
}
