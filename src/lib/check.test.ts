import net from "node:net";
import { afterAll, describe, expect, it, vi } from "vitest";
import {
  checkUrl,
  classify,
  describeError,
  mapWithConcurrency,
  nodeRequest,
  type HeadersOnlyResponse,
  type RequestFn,
} from "./check";

const userAgent = "shey/1.0 (uptime monitor; +https://example.com/en/about)";

describe("classify", () => {
  it.each([
    [200, 300, "up"],
    [200, 5000, "up"], // exactly 5 s is still up
    [200, 5001, "slow"],
    [403, 100, "up"], // alive but blocking bots
    [404, 100, "up"],
    [429, 100, "slow"], // rate limited
    [500, 100, "down"],
    [503, 100, "down"],
    [503, 9000, "down"], // 5xx wins over slowness
  ] as const)("HTTP %i in %i ms → %s", (code, ms, expected) => {
    expect(classify(code, ms)).toBe(expected);
  });
});

// A fake request function: replays `responses` in order, advancing a fake
// clock by `ms` per hop.
function fakeRequest(responses: HeadersOnlyResponse[], msPerHop: number, clock: { t: number }) {
  const fn = vi.fn<RequestFn>(async () => {
    clock.t += msPerHop;
    const next = responses.shift();
    if (!next) throw new Error("unexpected extra request");
    return next;
  });
  return fn;
}

describe("checkUrl (logic)", () => {
  it("reports up with response time and sends the bot User-Agent", async () => {
    const clock = { t: 0 };
    const request = fakeRequest([{ statusCode: 200, location: null }], 420, clock);
    const r = await checkUrl("https://sss.gov.ph/", { userAgent, request, now: () => clock.t });

    expect(r).toEqual({ status: "up", statusCode: 200, responseTimeMs: 420, error: null });
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1].headers["User-Agent"]).toBe(userAgent);
  });

  it("follows redirects and times the whole chain", async () => {
    const clock = { t: 0 };
    const request = fakeRequest(
      [
        { statusCode: 301, location: "https://www.x.gov.ph/" },
        { statusCode: 302, location: "/home" },
        { statusCode: 200, location: null },
      ],
      2000,
      clock,
    );
    const r = await checkUrl("http://x.gov.ph/", { userAgent, request, now: () => clock.t });

    expect(request.mock.calls.map((c) => c[0])).toEqual([
      "http://x.gov.ph/",
      "https://www.x.gov.ph/",
      "https://www.x.gov.ph/home",
    ]);
    // 3 hops × 2 s = 6 s → slow
    expect(r).toMatchObject({ status: "slow", statusCode: 200, responseTimeMs: 6000 });
  });

  it("gives up after too many redirects", async () => {
    const clock = { t: 0 };
    const loop = Array.from({ length: 10 }, () => ({ statusCode: 302, location: "/again" }));
    const r = await checkUrl("https://x.gov.ph/", { userAgent, request: fakeRequest(loop, 1, clock), now: () => clock.t });
    expect(r).toMatchObject({ status: "down", error: "too many redirects" });
  });

  it("treats a 3xx without Location as a final response", async () => {
    const clock = { t: 0 };
    const request = fakeRequest([{ statusCode: 304, location: null }], 100, clock);
    const r = await checkUrl("https://x.gov.ph/", { userAgent, request, now: () => clock.t });
    expect(r.status).toBe("up");
  });

  it("reports down on 5xx", async () => {
    const clock = { t: 0 };
    const request = fakeRequest([{ statusCode: 502, location: null }], 100, clock);
    const r = await checkUrl("https://x.gov.ph/", { userAgent, request, now: () => clock.t });
    expect(r).toMatchObject({ status: "down", statusCode: 502, error: "HTTP 502" });
  });
});

describe("describeError", () => {
  it("uses the Node error code when present", () => {
    expect(describeError(Object.assign(new Error("x"), { code: "ENOTFOUND" }))).toBe("ENOTFOUND");
  });
  it("handles non-Error values", () => {
    expect(describeError("boom")).toBe("unknown error");
  });
});

// ---------------------------------------------------------------------------
// Real network tests against tiny local TCP servers that send raw HTTP, so we
// can reproduce the misbehaving servers we see in the wild.
// ---------------------------------------------------------------------------

const servers: net.Server[] = [];
afterAll(() => servers.forEach((s) => s.close()));

/** Start a raw TCP server; `onRequest` gets the socket once a request arrives. */
async function rawServer(
  onRequest: (socket: net.Socket, path: string, rawRequest: string) => void,
): Promise<string> {
  const server = net.createServer((socket) => {
    socket.once("data", (buf) => {
      const raw = buf.toString();
      onRequest(socket, raw.split(" ")[1] ?? "/", raw);
    });
    socket.on("error", () => {});
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  return `http://127.0.0.1:${port}`;
}

describe("checkUrl (real network)", () => {
  it("accepts obsolete header line folding (the Virtual Pag-IBIG bug)", async () => {
    const base = await rawServer((s) =>
      s.end("HTTP/1.1 200 OK\r\nSet-Cookie: a=b;\r\n path=/\r\nContent-Length: 2\r\n\r\nok"),
    );
    const r = await checkUrl(`${base}/`, { userAgent, allowPrivateNetworks: true });
    expect(r).toMatchObject({ status: "up", statusCode: 200, error: null });
  });

  it("follows a real redirect", async () => {
    const base = await rawServer((s, path) =>
      path === "/"
        ? s.end("HTTP/1.1 302 Found\r\nLocation: /home\r\nContent-Length: 0\r\n\r\n")
        : s.end("HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n"),
    );
    expect(await checkUrl(`${base}/`, { userAgent, allowPrivateNetworks: true })).toMatchObject({ status: "up", statusCode: 200 });
  });

  it("returns as soon as headers arrive, without downloading the body", async () => {
    // Sends headers for a 100 MB body, then trickles bytes forever.
    const base = await rawServer((s) => {
      s.write("HTTP/1.1 200 OK\r\nContent-Length: 104857600\r\n\r\n");
      const t = setInterval(() => (s.destroyed ? clearInterval(t) : s.write("x")), 50);
    });
    const started = Date.now();
    const r = await checkUrl(`${base}/`, { userAgent, timeoutMs: 2000, allowPrivateNetworks: true });
    expect(r.status).toBe("up");
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("sends the User-Agent header on the wire", async () => {
    let seen = "";
    const base = await rawServer((s, _path, raw) => {
      seen = raw;
      s.end("HTTP/1.1 204 No Content\r\n\r\n");
    });
    await checkUrl(`${base}/`, { userAgent, allowPrivateNetworks: true });
    expect(seen).toMatch(/^GET \/ HTTP\/1\.1/);
    expect(seen.toLowerCase()).toContain(`user-agent: ${userAgent.toLowerCase()}`);
  });

  it("reports timeout when the server never answers", async () => {
    const base = await rawServer(() => {}); // accept, never respond
    const r = await checkUrl(`${base}/`, { userAgent, timeoutMs: 200, allowPrivateNetworks: true });
    expect(r).toEqual({ status: "down", statusCode: null, responseTimeMs: null, error: "timeout" });
  });

  it("reports the error code when the connection is refused", async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const { port } = server.address() as net.AddressInfo;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const r = await checkUrl(`http://127.0.0.1:${port}/`, { userAgent, allowPrivateNetworks: true });
    expect(r).toMatchObject({ status: "down", error: "ECONNREFUSED" });
  });
});

describe("checkUrl (private network protection)", () => {
  it("refuses a literal private IP without sending anything", async () => {
    const request = vi.fn<RequestFn>();
    const r = await checkUrl("http://169.254.169.254/latest/meta-data/", { userAgent, request });
    expect(r).toMatchObject({ status: "down", error: "blocked address" });
    expect(request).not.toHaveBeenCalled();
  });

  it("refuses a public site that redirects to a private address", async () => {
    const clock = { t: 0 };
    const request = fakeRequest([{ statusCode: 302, location: "http://10.0.0.1/admin" }], 10, clock);
    const r = await checkUrl("https://public.example.com/", { userAgent, request, now: () => clock.t });
    expect(r).toMatchObject({ status: "down", error: "blocked address" });
    expect(request).toHaveBeenCalledOnce();
  });

  it("refuses a hostname that resolves to a private address (real DNS)", async () => {
    // "localhost" resolves to 127.0.0.1 / ::1; isBlockedHost catches the name,
    // so call the real request function directly to exercise safeLookup.
    const err = await nodeRequest("http://localhost:1/", {
      headers: {},
      signal: AbortSignal.timeout(2000),
      blockPrivate: true,
    }).then(() => null, (e: NodeJS.ErrnoException) => e);
    expect(err?.code).toBe("EBLOCKED");
  });
});

describe("mapWithConcurrency", () => {
  it("keeps order and never exceeds the limit", async () => {
    let running = 0;
    let peak = 0;
    const out = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60, 70]);
    expect(peak).toBe(3);
  });

  it("handles an empty list", async () => {
    expect(await mapWithConcurrency([], 5, async (x) => x)).toEqual([]);
  });
});
