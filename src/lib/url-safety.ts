// Keeps user-entered monitor URLs from reaching private networks (SSRF).
//
// The checker runs on our servers, so without this anyone could add a monitor
// like http://169.254.169.254/ (cloud metadata) or http://10.0.0.1/ and use us
// to probe internal addresses. Three layers:
//   1. validateMonitorUrl()  when a monitor is saved (form + DB constraint)
//   2. safeLookup()          DNS answers are checked, and the connection uses
//                            the approved address (defeats DNS rebinding)
//   3. isBlockedHost()       literal IPs, which skip DNS, are checked per hop

import dns from "node:dns";
import net from "node:net";

/** IPv4 ranges that must never be contacted (private, loopback, etc.). */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this network"
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local (cloud metadata lives here)
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

function v4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, part) => (acc << 8) + Number(part), 0) >>> 0;
}

function inV4Range(ip: string, [base, bits]: [string, number]): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (v4ToInt(ip) & mask) === (v4ToInt(base) & mask);
}

/** True for any address we refuse to connect to. */
export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return BLOCKED_V4.some((r) => inV4Range(ip, r));
  if (net.isIPv6(ip)) {
    const v6 = ip.toLowerCase();
    // IPv4-mapped (::ffff:10.0.0.1) and NAT64 (64:ff9b::10.0.0.1): check the IPv4 part.
    const embedded = v6.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (embedded) return isBlockedIp(embedded[1]);
    return (
      v6 === "::" ||
      v6 === "::1" ||
      /^f[cd][0-9a-f]{2}:/.test(v6) || // fc00::/7 unique local
      /^fe[89ab][0-9a-f]:/.test(v6) || // fe80::/10 link-local
      /^ff[0-9a-f]{2}:/.test(v6) || // multicast
      /^::ffff:[0-9a-f]+:[0-9a-f]+$/.test(v6) // mapped v4 in hex form: refuse
    );
  }
  return true; // not an IP at all: refuse
}

/** Hostnames that are internal by name, or literal blocked IPs. */
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (net.isIP(host)) return isBlockedIp(host);
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    !host.includes(".") // single-label names resolve on the local network
  );
}

export type UrlProblem = "invalid" | "protocol" | "credentials" | "internal";

/** Check a URL a user wants to monitor. Returns the problem, or null if OK. */
export function validateMonitorUrl(raw: string): UrlProblem | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return "invalid";
  }
  if (raw.length > 2048) return "invalid";
  if (url.protocol !== "http:" && url.protocol !== "https:") return "protocol";
  if (url.username || url.password) return "credentials";
  if (isBlockedHost(url.hostname)) return "internal";
  return null;
}

export class BlockedAddressError extends Error {
  code = "EBLOCKED";
  constructor(host: string) {
    super(`Refusing to connect to a private address for ${host}`);
  }
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

/**
 * Drop-in for dns.lookup that fails if ANY resolved address is blocked. Node's
 * http client connects to the address this returns, so a hostname can't pass
 * the check with one IP and then connect to another.
 */
export function safeLookup(hostname: string, options: dns.LookupOptions, callback: LookupCallback): void {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as dns.LookupAddress[];
    if (list.length === 0 || list.some((a) => isBlockedIp(a.address))) {
      return callback(new BlockedAddressError(hostname), []);
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}
