import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { publicSupabaseEnv } from "./env";

/** Supabase client for client components. Reads the session from cookies. */
export function createSupabaseBrowserClient() {
  const { url, key } = publicSupabaseEnv();
  // createBrowserClient returns one shared instance per page.
  return createBrowserClient<Database>(url, key);
}
