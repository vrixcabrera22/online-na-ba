import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { publicSupabaseEnv } from "./env";

/**
 * Anonymous Supabase client for public data (status board, charts, outages).
 * Uses the publishable key, so row-level security limits it to public rows.
 * No cookies or session: safe to use inside "use cache" functions.
 */
export function createPublicClient() {
  const { url, key } = publicSupabaseEnv();
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
