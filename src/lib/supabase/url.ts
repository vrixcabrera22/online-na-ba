/**
 * Clean up the Supabase project URL from the environment.
 *
 * The Supabase client adds /rest/v1 itself, so a URL copied from the API docs
 * page (https://<ref>.supabase.co/rest/v1/) makes every request go to
 * /rest/v1/rest/v1/... and fail with "Invalid path specified in request URL".
 * Stray whitespace from copy-pasting into a dashboard does the same.
 */
export function normalizeSupabaseUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/rest\/v1$/, "")
    .replace(/\/+$/, "");
}
