import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { normalizeSupabaseUrl } from "./url";

/** The Supabase project URL, cleaned up (see normalizeSupabaseUrl). */
export function supabaseUrl(): string {
  // Written out literally (not process.env[name]) so Next.js inlines the value
  // at build time. Public "Config" variables on Vercel are available during the
  // build but not necessarily to functions at runtime.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error("Missing environment variable NEXT_PUBLIC_SUPABASE_URL. See .env.example.");
  }
  return normalizeSupabaseUrl(url);
}

/**
 * Secret-key (service role) client. Bypasses row-level security, so it must only ever run
 * on the server (the `server-only` import makes a client-side import fail the
 * build). Used by the checker to write checks, stats and incidents.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), requireEnv("SUPABASE_SECRET_KEY").trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
