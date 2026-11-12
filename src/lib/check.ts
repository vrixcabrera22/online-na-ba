// Uptime checks: one GET per monitor, classified as up / slow / down.
// The decision logic is separate from the network code (the injectable
// `request` function), so it can be unit tested without real servers.

import http from "node:http";
import https from "node:https";
import { isBlockedHost, safeLookup } from "./url-safety";

export type CheckStatus = "up" | "slow" | "down";

/** Responses slower than this count as "slow" (Mabagal). */
export const SLOW_THRESHOLD_MS = 5_000;
/** No response within this time (across all redirects) counts as "down". */
export const TIMEOUT_MS = 15_000;
/** Give up after this many redirects. */
export const MAX_REDIRECTS = 5;

export interface CheckResult {
  status: CheckStatus;
  statusCode: number | null;
  responseTimeMs: number | null;
  error: string | null;
}

/**
 * Status rules (see CLAUDE.md):
 * - 5xx → down
 * - 429 (rate limited) → slow
 * - anything else below 500 (including 4xx: the server is alive, just blocking
 *   bots) → up, or slow if it took more than 5 s
 */
export function classify(statusCode: number, responseTimeMs: number): CheckStatus {
  if (statusCode >= 500) return "down";
  if (statusCode === 429) return "slow";
  if (responseTimeMs > SLOW_THRESHOLD_MS) return "slow";
  return "up";
}

/** What we need from one HTTP exchange: the status and any redirect target. */
export interface HeadersOnlyResponse {
  statusCode: number;
  location: string | null;
}

export type RequestFn = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal; blockPrivate: boolean },
) => Promise<HeadersOnlyResponse>;

/**
 * Send one GET and resolve as soon as the response headers arrive, then drop
 * the connection without reading the body (we never download pages).
 *
 * Why not fetch()? Some government servers send slightly malformed headers that
 * browsers accept but Node's strict parser rejects. Virtual Pag-IBIG, for
 * example, uses obsolete header line folding, which makes fetch() throw even
 * though the site is up. `insecureHTTPParser` makes Node as lenient as a
 * browser. That's safe here: we only read the status code and Location header,
 * and never use the body.
 */
export const nodeRequest: RequestFn = (url, { headers, signal, blockPrivate }) =>
  new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === "http:" ? http : https;
    const req = client.request(
      target,
      {
        method: "GET",
        headers,
        signal,
        insecureHTTPParser: true,
        // Resolve DNS ourselves and refuse private addresses; the socket then
        // connects to the exact address we approved (see url-safety.ts).
        ...(blockPrivate ? { lookup: safeLookup } : {}),
      },
      (res) => {
        resolve({ statusCode: res.statusCode ?? 0, location: res.headers.location ?? null });
        res.destroy();
      },
    );
    req.on("error", reject);
    req.end();
  });

export interface CheckOptions {
  userAgent: string;
  timeoutMs?: number;
  request?: RequestFn;
  now?: () => number;
  /** Only for tests against local servers. Never set in production. */
  allowPrivateNetworks?: boolean;
}

export async function checkUrl(url: string, options: CheckOptions): Promise<CheckResult> {
  const {
    userAgent,
    timeoutMs = TIMEOUT_MS,
    request = nodeRequest,
    now = () => performance.now(),
    allowPrivateNetworks = false,
  } = options;
  const blockPrivate = !allowPrivateNetworks;

  const headers = { "User-Agent": userAgent, Accept: "text/html,*/*;q=0.8" };
  // One deadline for the whole check, redirects included.
  const signal = AbortSignal.timeout(timeoutMs);
  const started = now();

  try {
    let current = url;
    for (let hop = 0; ; hop++) {
      // Literal IPs skip DNS, so check every hop's host here too (a public
      // site could redirect to http://169.254.169.254/).
      if (blockPrivate && isBlockedHost(new URL(current).hostname)) {
        return { status: "down", statusCode: null, responseTimeMs: null, error: "blocked address" };
      }
      const res = await request(current, { headers, signal, blockPrivate });
      const isRedirect = res.statusCode >= 300 && res.statusCode < 400 && res.location;
      if (!isRedirect) {
        const responseTimeMs = Math.round(now() - started);
        return {
          status: classify(res.statusCode, responseTimeMs),
          statusCode: res.statusCode,
          responseTimeMs,
          error: res.statusCode >= 500 ? `HTTP ${res.statusCode}` : null,
        };
      }
      if (hop >= MAX_REDIRECTS) {
        return { status: "down", statusCode: res.statusCode, responseTimeMs: null, error: "too many redirects" };
      }
      current = new URL(res.location!, current).toString();
    }
  } catch (err) {
    return {
      status: "down",
      statusCode: null,
      responseTimeMs: null,
      error: signal.aborted ? "timeout" : describeError(err),
    };
  }
}

/** Short, human-readable reason for a failed request (stored in checks.error). */
export function describeError(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "TimeoutError" || err.name === "AbortError") return "timeout";
    // Node network errors carry a code: ENOTFOUND, ECONNREFUSED, ECONNRESET,
    // CERT_HAS_EXPIRED, ...
    const code = (err as Error & { code?: unknown }).code;
    if (code === "EBLOCKED") return "blocked address";
    if (typeof code === "string") return code;
    return err.message.slice(0, 200);
  }
  return "unknown error";
}

/** Run `fn` over `items` with at most `limit` running at once. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
