// Validation for the add/edit monitor form (pure: unit tested).

import { validateMonitorUrl, type UrlProblem } from "./url-safety";

/** Monitor limits per plan. The database trigger enforces the same numbers. */
export const MONITOR_LIMITS = { free: 3, pro: 20 } as const;

/** Keys under "Dashboard.errors" in the messages files. */
export type MonitorErrorKey = UrlProblem | "nameRequired" | "limitReached" | "generic";

export type MonitorInput = { ok: true; name: string; url: string } | { ok: false; error: MonitorErrorKey };

export function parseMonitorInput(rawName: string, rawUrl: string): MonitorInput {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 100) return { ok: false, error: "nameRequired" };

  // Accept "example.com" (or "example.com:8080") by assuming https://, the way
  // browsers do. Only a "scheme://" prefix, or a known non-web scheme like
  // "javascript:", counts as the user choosing a scheme.
  let url = rawUrl.trim();
  if (url && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !/^(javascript|data|vbscript|file|mailto):/i.test(url)) {
    url = `https://${url}`;
  }

  const problem = validateMonitorUrl(url);
  if (problem) return { ok: false, error: problem };
  return { ok: true, name, url: new URL(url).toString() };
}

/** Map a database error from saving a monitor to a message key. */
export function monitorDbErrorKey(error: { code?: string; message?: string } | null): MonitorErrorKey {
  if (!error) return "generic";
  if (error.message?.includes("monitor_limit_reached")) return "limitReached";
  if (error.code === "23514") {
    // Check constraint: which one tells us what was wrong.
    if (error.message?.includes("no_credentials")) return "credentials";
    if (error.message?.includes("not_internal")) return "internal";
    return "invalid";
  }
  return "generic";
}
