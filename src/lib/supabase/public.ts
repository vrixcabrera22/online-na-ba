import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { normalizeSupabaseUrl } from "./url";

/**
 * Anonymous Supabase client for public data (status board, charts, outages).
 * Uses the publishable key, so row-level security limits it to public rows.
 * No cookies or session: safe to use inside "use cache" functions.
 */
export function createPublicClient() {
  // Literal process.env references so Next.js inlines them at build time.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.example.",
    );
  }
  return createClient<Database>(normalizeSupabaseUrl(url), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
