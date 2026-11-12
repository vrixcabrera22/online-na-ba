import { describe, expect, it } from "vitest";
import { healthProblems, type HealthReport } from "./health";

const healthy: HealthReport = { job_active: true, last_check_at: "2026-11-12T06:25:00Z", runs_24h: 288, max_gap_minutes: 5, gaps_over_15m: 0 };

describe("healthProblems", () => {
  it("a normal day has no problems", () => {
    expect(healthProblems(healthy)).toEqual([]);
  });
  it("flags a missing cron job", () => {
    expect(healthProblems({ ...healthy, job_active: false })[0]).toMatch(/missing or inactive/);
  });
  it("flags gaps over 15 minutes (like the day-one job deletion)", () => {
    expect(healthProblems({ ...healthy, gaps_over_15m: 1, max_gap_minutes: 21 })).toEqual([
      "1 gap(s) over 15 minutes in the last 24 h (longest: 21 min).",
    ]);
  });
  it("flags too few runs", () => {
    expect(healthProblems({ ...healthy, runs_24h: 55 })[0]).toMatch(/Only 55 check runs/);
  });
});
