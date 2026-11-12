import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed tokens for one-click unsubscribe links, so turning alerts off from an
 * email doesn't need a login. The token is an HMAC of the alert setting id;
 * the key is derived from CRON_SECRET (no extra secret to manage). Rotating
 * CRON_SECRET invalidates old unsubscribe links, which is acceptable.
 */
function key(secret: string): Buffer {
  return createHmac("sha256", secret).update("online-na-ba:unsubscribe:v1").digest();
}

export function signUnsubscribe(alertSettingId: string, secret: string): string {
  return createHmac("sha256", key(secret)).update(alertSettingId).digest("base64url");
}

export function verifyUnsubscribe(alertSettingId: string, token: string, secret: string | undefined): boolean {
  if (!secret || !token) return false;
  const expected = Buffer.from(signUnsubscribe(alertSettingId, secret));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}
