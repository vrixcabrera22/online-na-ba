import { describe, expect, it } from "vitest";
import { authErrorKey, safeNextPath, validateCredentials } from "./auth-helpers";

describe("validateCredentials", () => {
  it("accepts a normal email and 8+ char password", () => {
    expect(validateCredentials("juan@example.com", "12345678")).toBeNull();
  });
  it.each(["", "juan", "juan@", "juan@example", "ju an@example.com"])("rejects email %j", (e) => {
    expect(validateCredentials(e, "12345678")).toBe("invalidEmail");
  });
  it("rejects short passwords", () => {
    expect(validateCredentials("juan@example.com", "1234567")).toBe("passwordTooShort");
  });
});

describe("authErrorKey", () => {
  it.each([
    ["invalid_credentials", "invalidCredentials"],
    ["email_not_confirmed", "emailNotConfirmed"],
    ["over_email_send_rate_limit", "rateLimited"],
    ["weak_password", "weakPassword"],
    ["something_new", "generic"],
    [undefined, "generic"],
  ])("%s → %s", (code, key) => {
    expect(authErrorKey(code)).toBe(key);
  });
});

describe("safeNextPath", () => {
  it("allows same-site paths", () => {
    expect(safeNextPath("/en/dashboard", "/fil")).toBe("/en/dashboard");
  });
  it.each([null, "", "https://evil.com", "//evil.com", "/\\evil.com", "dashboard"])("rejects %j", (n) => {
    expect(safeNextPath(n, "/fil/dashboard")).toBe("/fil/dashboard");
  });
});
