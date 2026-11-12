/**
 * The public demo account. These credentials are meant to be public: they're
 * shown on the login and About pages and in the README so anyone can try the
 * dashboard. Because anyone can log in, a daily job (/api/cron/daily) puts the
 * account back the way it should be (password, sample monitors, alerts off).
 *
 * example.com is a reserved domain: no real inbox ever receives its email.
 */
export const DEMO_EMAIL = "demo@example.com";
export const DEMO_PASSWORD = "subukan-mo-ako";

export interface DemoMonitor {
  /** Fixed id, so the daily reset restores the monitor but keeps its history. */
  id: string;
  name: string;
  /** Absolute URL, or a path on this site. */
  target: string;
}

export const DEMO_MONITORS: readonly DemoMonitor[] = [
  // A healthy public site.
  { id: "de000000-0000-4000-8000-000000000001", name: "Halimbawang website", target: "https://example.com/" },
  // Always returns 503, so visitors see an outage, its history and the alerts switch in action.
  { id: "de000000-0000-4000-8000-000000000002", name: "Laging down (pagsubok)", target: "/api/test/down" },
];
