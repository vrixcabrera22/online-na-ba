"use server";

import { hasLocale } from "next-intl";
import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { authErrorKey, validateCredentials, type AuthErrorKey } from "@/lib/auth-helpers";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo";
import { siteUrl } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type AuthFormState =
  | { status: "idle" }
  | { status: "error"; error: AuthErrorKey; email: string }
  | { status: "check-email"; email: string };

function readForm(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const rawLocale = String(formData.get("locale") ?? "");
  const locale = hasLocale(routing.locales, rawLocale) ? rawLocale : routing.defaultLocale;
  return { email, password, locale };
}

export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, locale } = readForm(formData);
  const invalid = validateCredentials(email, password);
  if (invalid) return { status: "error", error: invalid, email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Where the confirmation link lands (must be in Supabase's allowed
      // redirect URLs).
      emailRedirectTo: `${siteUrl()}/api/auth/confirm?next=/${locale}/dashboard`,
      // Read by the sign-up trigger to set profiles.preferred_locale, so
      // emails can go out in the user's language.
      data: { locale },
    },
  });
  if (error) return { status: "error", error: authErrorKey(error.code), email };

  // Supabase answers the same way for new and existing emails (so nobody can
  // check which emails have accounts); the message is worded for both.
  return { status: "check-email", email };
}

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const { email, password, locale } = readForm(formData);
  if (!email || !password) return { status: "error", error: "invalidCredentials", email };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { status: "error", error: authErrorKey(error.code), email };

  redirect({ href: "/dashboard", locale });
  return { status: "idle" };
}

export async function signOut(formData: FormData): Promise<void> {
  const { locale } = readForm(formData);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect({ href: "/", locale });
}

/** One-click login to the public demo account (credentials are public). */
export async function signInDemo(formData: FormData): Promise<void> {
  const { locale } = readForm(formData);
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
  redirect({ href: error ? "/login" : "/dashboard", locale });
}
