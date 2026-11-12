import { describe, expect, it } from "vitest";
import { isBlockedHost, isBlockedIp, safeLookup, validateMonitorUrl } from "./url-safety";

describe("isBlockedIp", () => {
  it.each([
    "0.0.0.0",
    "10.1.2.3",
    "100.64.0.1",
    "127.0.0.1",
    "127.255.255.254",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "ff02::1",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "64:ff9b::192.168.1.1",
    "not-an-ip",
  ])("blocks %s", (ip) => {
    expect(isBlockedIp(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "203.177.1.1", "2606:4700::1111", "::ffff:8.8.8.8"])(
    "allows %s",
    (ip) => {
      expect(isBlockedIp(ip)).toBe(false);
    },
  );
});

describe("isBlockedHost", () => {
  it.each(["localhost", "LOCALHOST", "app.localhost", "printer.local", "metadata.google.internal", "intranet", "127.0.0.1", "[::1]", "example.com."])(
    "%s",
    (host) => {
      // "example.com." (trailing dot) is a normal public name; everything else is internal.
      expect(isBlockedHost(host)).toBe(host !== "example.com.");
    },
  );
});

describe("validateMonitorUrl", () => {
  it.each([
    ["https://example.com", null],
    ["http://my-shop.ph/path?q=1", null],
    ["https://local.example.com", null],
    ["not a url", "invalid"],
    ["ftp://example.com", "protocol"],
    ["javascript:alert(1)", "protocol"],
    ["https://user:pass@example.com", "credentials"],
    ["http://localhost:3000", "internal"],
    ["http://169.254.169.254/latest/meta-data", "internal"],
    ["http://[::1]/", "internal"],
    ["http://10.0.0.1", "internal"],
    ["http://0x7f000001/", "internal"], // WHATWG URL normalizes this to 127.0.0.1
    ["http://2130706433/", "internal"], // ...and this
  ])("%s → %s", (url, problem) => {
    expect(validateMonitorUrl(url)).toBe(problem);
  });
});

describe("safeLookup", () => {
  const lookup = (host: string, all = false) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown }>((resolve) =>
      safeLookup(host, { all }, (err, address) => resolve({ err, address })),
    );

  it("refuses a hostname that resolves to loopback", async () => {
    const { err } = await lookup("localhost");
    expect(err?.code).toBe("EBLOCKED");
  });

  it("refuses with all: true as well", async () => {
    const { err } = await lookup("localhost", true);
    expect(err?.code).toBe("EBLOCKED");
  });
});
