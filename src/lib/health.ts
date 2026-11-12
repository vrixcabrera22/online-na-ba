// Interpreting the daily health report (pure: unit tested).

export interface HealthReport {
  job_active: boolean;
  last_check_at: string | null;
  runs_24h: number;
  max_gap_minutes: number;
  gaps_over_15m: number;
}

/** A healthy day has the job present, ~288 runs and no gap over 15 minutes. */
export function healthProblems(h: HealthReport): string[] {
  const problems: string[] = [];
  if (!h.job_active) problems.push("The 'check-monitors' cron job is missing or inactive.");
  if (h.gaps_over_15m > 0) problems.push(`${h.gaps_over_15m} gap(s) over 15 minutes in the last 24 h (longest: ${h.max_gap_minutes} min).`);
  if (h.runs_24h < 270) problems.push(`Only ${h.runs_24h} check runs in the last 24 h (expected ~288).`);
  return problems;
}
