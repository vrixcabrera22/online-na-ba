import { NextResponse } from "next/server";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { healthProblems } from "@/lib/health";
import { checkHealth, emailHealthProblems, resetDemo } from "@/lib/maintenance";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

/**
 * Daily maintenance, run by Vercel Cron (vercel.json; the free plan allows one
 * run a day). Vercel sends `Authorization: Bearer <CRON_SECRET>` itself.
 *  1. Reset the public demo account.
 *  2. Check that the 5-minute checks really ran, and email the owner if not.
 * Each part runs even if the other fails.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  const result: Record<string, unknown> = {};

  try {
    result.demo = await resetDemo(admin);
  } catch (err) {
    console.error("[cron/daily] demo reset failed", err);
    result.demo = { error: err instanceof Error ? err.message : String(err) };
  }

  try {
    const health = await checkHealth(admin);
    const problems = healthProblems(health);
    result.health = { ...health, problems, email: await emailHealthProblems(problems, health) };
  } catch (err) {
    console.error("[cron/daily] health check failed", err);
    result.health = { error: err instanceof Error ? err.message : String(err) };
  }

  console.log("[cron/daily]", JSON.stringify(result));
  return NextResponse.json(result);
}
