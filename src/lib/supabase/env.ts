import { normalizeSupabaseUrl } from "./url";

/**
 * Public Supabase settings (safe for the browser). Written as literal
 * process.env.NEXT_PUBLIC_* references so Next.js inlines them at build time;
 * Vercel "Config" variables aren't available to functions at runtime.
 */
export function publicSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. See .env.example.",
    );
  }
  return { url: normalizeSupabaseUrl(url), key: key.trim() };
}
