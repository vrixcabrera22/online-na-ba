import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True only if the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Fails closed: if the secret isn't configured, nothing is authorized.
 */
export function isAuthorizedCronRequest(
  authorizationHeader: string | null,
  secret: string | undefined,
): boolean {
  if (!secret || !authorizationHeader) return false;
  const expected = `Bearer ${secret}`;
  // Hash both sides so the comparison is constant-time even when lengths differ.
  const a = createHash("sha256").update(authorizationHeader).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
