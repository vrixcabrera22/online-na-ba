import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";
import { publicSupabaseEnv } from "./env";

/**
 * Supabase client acting as the signed-in user (session from cookies), for
 * server components, server actions and route handlers. Row-level security
 * applies, so it can only see and change that user's own data.
 */
export async function createSupabaseServerClient() {
  const { url, key } = publicSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components can't set cookies. That's fine: the proxy
          // refreshes the session on every request, so it stays valid.
        }
      },
    },
  });
}
