import { describe, expect, it } from "vitest";
import {
  displayStatus,
  durationParts,
  formatResponseTime,
  formatUptime,
  isStale,
  STALE_AFTER_MS,
} from "./format";

const now = Date.parse("2026-11-12T02:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("isStale / displayStatus", () => {
  it("fresh check keeps its status", () => {
    expect(isStale(ago(5 * 60_000), now)).toBe(false);
    expect(displayStatus("slow", ago(5 * 60_000), now)).toBe("slow");
  });
  it("stale after 15 minutes → unknown", () => {
    expect(isStale(ago(STALE_AFTER_MS + 1), now)).toBe(true);
    expect(displayStatus("up", ago(STALE_AFTER_MS + 1), now)).toBe("unknown");
  });
  it("no data → unknown", () => {
    expect(displayStatus(null, null, now)).toBe("unknown");
  });
});

describe("formatUptime", () => {
  it.each([
    [100, "100%"],
    [99.996, "99.99%"], // never rounds up to 100
    [99.5, "99.5%"],
    [50, "50%"],
    [0, "0%"],
  ])("%d → %s", (v, out) => {
    expect(formatUptime(v, "en")).toBe(out);
  });
  it("null → dash", () => {
    expect(formatUptime(null, "fil")).toBe("—");
  });
});

describe("formatResponseTime", () => {
  it.each([
    [320, "320 ms"],
    [999, "999 ms"],
    [1000, "1 s"],
    [1234, "1.2 s"],
    [15000, "15 s"],
  ])("%d → %s", (v, out) => {
    expect(formatResponseTime(v, "en")).toBe(out);
  });
  it("null → dash", () => {
    expect(formatResponseTime(null, "en")).toBe("—");
  });
});

describe("durationParts", () => {
  it.each([
    [30, { hours: 0, minutes: 1 }], // rounds up to at least 1 minute
    [600, { hours: 0, minutes: 10 }],
    [3900, { hours: 1, minutes: 5 }],
    [7200, { hours: 2, minutes: 0 }],
  ])("%d s", (s, out) => {
    expect(durationParts(s)).toEqual(out);
  });
});
