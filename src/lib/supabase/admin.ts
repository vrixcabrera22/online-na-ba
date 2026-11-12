import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Database } from "./database.types";
import { normalizeSupabaseUrl } from "./url";

/** The Supabase project URL, cleaned up (see normalizeSupabaseUrl). */
export function supabaseUrl(): string {
  return normalizeSupabaseUrl(requireEnv("NEXT_PUBLIC_SUPABASE_URL"));
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
