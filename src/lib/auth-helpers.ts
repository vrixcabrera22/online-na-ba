// Pure helpers for the auth forms (no Next.js or Supabase imports: unit tested).

export const MIN_PASSWORD_LENGTH = 8;

/** Keys under "Auth.errors" in the messages files. */
export type AuthErrorKey =
  | "invalidEmail"
  | "passwordTooShort"
  | "invalidCredentials"
  | "emailNotConfirmed"
  | "rateLimited"
  | "weakPassword"
  | "generic";

export function validateCredentials(email: string, password: string): AuthErrorKey | null {
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return "invalidEmail";
  if (password.length < MIN_PASSWORD_LENGTH) return "passwordTooShort";
  return null;
}

/** Map a Supabase Auth error code to a translated message key. */
export function authErrorKey(code: string | undefined): AuthErrorKey {
  switch (code) {
    case "invalid_credentials":
      return "invalidCredentials";
    case "email_not_confirmed":
      return "emailNotConfirmed";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "rateLimited";
    case "weak_password":
      return "weakPassword";
    case "email_address_invalid":
      return "invalidEmail";
    default:
      return "generic";
  }
}

/**
 * Only allow redirects to paths on this site ("/fil/dashboard"), never to
 * another site ("//evil.com", "https://evil.com", "/\\evil.com").
 */
export function safeNextPath(next: string | null | undefined, fallback: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
