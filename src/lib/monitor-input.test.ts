import { describe, expect, it } from "vitest";
import { monitorDbErrorKey, parseMonitorInput } from "./monitor-input";

describe("parseMonitorInput", () => {
  it("accepts a normal monitor and normalizes the URL", () => {
    expect(parseMonitorInput("  My   shop ", "https://Shop.Example.com")).toEqual({
      ok: true,
      name: "My shop",
      url: "https://shop.example.com/",
    });
  });

  it("adds https:// when the scheme is missing", () => {
    expect(parseMonitorInput("Shop", "shop.example.com/path")).toMatchObject({
      ok: true,
      url: "https://shop.example.com/path",
    });
  });

  it.each([
    ["", "https://example.com", "nameRequired"],
    ["x".repeat(101), "https://example.com", "nameRequired"],
    ["Shop", "", "invalid"],
    ["Shop", "ftp://example.com", "protocol"],
    ["Shop", "https://a:b@example.com", "credentials"],
    ["Shop", "localhost:3000", "internal"],
    ["Shop", "http://192.168.1.1", "internal"],
  ])("%j / %j → %s", (name, url, error) => {
    expect(parseMonitorInput(name, url)).toEqual({ ok: false, error });
  });
});

describe("monitorDbErrorKey", () => {
  it.each([
    [{ code: "P0001", message: "monitor_limit_reached" }, "limitReached"],
    [{ code: "23514", message: 'violates check constraint "monitors_url_not_internal"' }, "internal"],
    [{ code: "23514", message: 'violates check constraint "monitors_url_no_credentials"' }, "credentials"],
    [{ code: "23514", message: 'violates check constraint "monitors_url_check"' }, "invalid"],
    [{ code: "42501", message: "permission denied" }, "generic"],
    [null, "generic"],
  ])("%j → %s", (err, key) => {
    expect(monitorDbErrorKey(err)).toBe(key);
  });
});
