import { describe, expect, it } from "vitest";
import type { PendingAlert } from "@/lib/supabase/database.types";
import { buildAlertEmail, reasonKey } from "./email";
import { signUnsubscribe, verifyUnsubscribe } from "./token";

const base: PendingAlert = {
  kind: "down",
  incident_id: 7,
  monitor_id: "m1",
  monitor_name: "Online shop ko",
  monitor_url: "https://shop.example.com/",
  started_at: "2026-11-12T02:00:00Z", // 10:00 AM Manila
  ended_at: null,
  duration_seconds: null,
  last_error: "timeout",
  alert_setting_id: "s1",
  recipient: "juan@example.com",
  locale: "fil",
};
const links = { dashboardUrl: "https://x.test/fil/dashboard/m1", unsubscribeUrl: "https://x.test/fil/unsubscribe?id=s1&t=abc" };

describe("buildAlertEmail", () => {
  it("builds a Filipino 'down' email in Manila time", () => {
    const e = buildAlertEmail(base, links);
    expect(e.subject).toBe("Hindi ma-access ang Online shop ko");
    expect(e.text).toContain("10:00");
    expect(e.text).toContain("walang sagot sa loob ng 15 segundo");
    expect(e.text).toContain(links.unsubscribeUrl);
    expect(e.html).toContain('lang="fil"');
    expect(e.html).toContain(links.dashboardUrl);
  });

  it("builds an English 'back up' email with the duration", () => {
    const e = buildAlertEmail(
      { ...base, kind: "up", locale: "en", ended_at: "2026-11-12T03:05:00Z", duration_seconds: 3900 },
      links,
    );
    expect(e.subject).toBe("Online shop ko is back up");
    expect(e.text).toContain("Outage lasted: 1 hr 5 min");
    expect(e.text).toContain("11:05");
  });

  it("escapes HTML in monitor names", () => {
    const e = buildAlertEmail({ ...base, monitor_name: '<img src=x onerror="alert(1)">' }, links);
    expect(e.html).not.toContain("<img src=x");
    expect(e.html).toContain("&lt;img");
  });

  it("shows unknown errors verbatim", () => {
    expect(buildAlertEmail({ ...base, last_error: "HTTP 503" }, links).text).toContain("Dahilan: HTTP 503");
  });
});

describe("reasonKey", () => {
  it.each([
    ["timeout", "timeout"],
    ["blocked address", "blocked"],
    ["ENOTFOUND", "dns"],
    ["ECONNREFUSED", "refused"],
    ["CERT_HAS_EXPIRED", "tls"],
    ["HTTP 502", "other"],
    [null, "other"],
  ] as const)("%s → %s", (err, key) => {
    expect(reasonKey(err)).toBe(key);
  });
});

describe("unsubscribe tokens", () => {
  const secret = "test-secret";
  it("verifies its own token", () => {
    expect(verifyUnsubscribe("s1", signUnsubscribe("s1", secret), secret)).toBe(true);
  });
  it.each([
    ["other id", "s2", signUnsubscribe("s1", "test-secret")],
    ["tampered", "s1", "AAAA"],
    ["empty", "s1", ""],
  ])("rejects %s", (_l, id, token) => {
    expect(verifyUnsubscribe(id, token, secret)).toBe(false);
  });
  it("fails closed without a secret", () => {
    expect(verifyUnsubscribe("s1", signUnsubscribe("s1", "x"), undefined)).toBe(false);
  });
});
