import "server-only";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Service-role client. Bypasses row-level security, so it must only ever run
 * on the server (the `server-only` import makes a client-side import fail the
 * build). Used by the checker to write checks, stats and incidents.
 */
export function createAdminClient() {
  return createClient<Database>(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
