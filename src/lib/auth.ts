import "server-only";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  email: string;
}

/**
 * The signed-in user, or null. getClaims() verifies the session's JWT
 * signature (locally with the project's signing keys), so this can't be faked
 * by editing a cookie.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: String(data.claims.email ?? "") };
}

/** The signed-in user; sends visitors who aren't signed in to the login page. */
export async function requireUser(locale: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) {
    redirect({ href: "/login", locale });
  }
  return user!;
}
