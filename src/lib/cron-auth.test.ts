import { describe, expect, it } from "vitest";
import { isAuthorizedCronRequest } from "./cron-auth";

describe("isAuthorizedCronRequest", () => {
  const secret = "s3cret-value";

  it("accepts the right bearer token", () => {
    expect(isAuthorizedCronRequest(`Bearer ${secret}`, secret)).toBe(true);
  });

  it.each([
    ["missing header", null],
    ["wrong token", "Bearer nope"],
    ["no Bearer prefix", secret],
    ["empty", ""],
  ])("rejects %s", (_label, header) => {
    expect(isAuthorizedCronRequest(header, secret)).toBe(false);
  });

  it("fails closed when CRON_SECRET is not set", () => {
    expect(isAuthorizedCronRequest("Bearer ", undefined)).toBe(false);
    expect(isAuthorizedCronRequest("Bearer ", "")).toBe(false);
  });
});
