import { describe, expect, it } from "vitest";
import { normalizeSupabaseUrl } from "./url";

describe("normalizeSupabaseUrl", () => {
  const clean = "https://abc.supabase.co";

  it.each([
    clean,
    `${clean}/`,
    `${clean}/rest/v1`,
    `${clean}/rest/v1/`,
    `  ${clean}/rest/v1/\n`,
    `${clean}\r\n`,
  ])("normalizes %j", (input) => {
    expect(normalizeSupabaseUrl(input)).toBe(clean);
  });
});
