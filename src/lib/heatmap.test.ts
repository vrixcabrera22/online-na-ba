import { describe, expect, it } from "vitest";
import { speedLevels, summarize, uptimeLevel, type Cell } from "./heatmap";

const cell = (dow: number, hour: number, avgMs: number | null, uptime = 100, checks = 12): Cell => ({
  dow,
  hour,
  checks,
  uptime,
  avgMs,
});

describe("uptimeLevel", () => {
  it.each([
    [100, 4],
    [99.9, 4],
    [99.5, 3],
    [98, 2],
    [95, 1],
    [50, 0],
  ])("%d%% → level %d", (u, level) => {
    expect(uptimeLevel(u)).toBe(level);
  });
});

describe("speedLevels", () => {
  it("fastest gets the darkest level, slowest the lightest", () => {
    const level = speedLevels([cell(1, 1, 100), cell(1, 2, 300), cell(1, 3, 500)]);
    expect(level(100)).toBe(4);
    expect(level(500)).toBe(0);
    expect(level(300)).toBe(2);
  });
  it("ignores cells without enough checks", () => {
    const level = speedLevels([cell(1, 1, 100), cell(1, 2, 9000, 100, 2)]);
    expect(level(100)).toBe(4); // the 9 s outlier with 2 checks doesn't stretch the scale
  });
  it("all equal → all top level", () => {
    expect(speedLevels([cell(1, 1, 200), cell(1, 2, 200)])(200)).toBe(4);
  });
});

describe("summarize", () => {
  it("finds the fastest and slowest 2-hour windows", () => {
    const s = summarize([
      cell(2, 6, 100),
      cell(2, 7, 120), // Tue 6–8 AM: fastest
      cell(1, 9, 900),
      cell(1, 10, 800), // Mon 9–11 AM: slowest
      cell(3, 14, 400),
      cell(3, 15, 400),
    ]);
    expect(s.fastest).toMatchObject({ dow: 2, fromHour: 6, toHour: 8 });
    expect(s.slowest).toMatchObject({ dow: 1, fromHour: 9, toHour: 11 });
    expect(s.alwaysOnline).toBe(true);
    expect(s.leastReliable).toBeNull();
  });

  it("falls back to single hours when no 2 consecutive hours have data", () => {
    const s = summarize([cell(4, 9, 300), cell(4, 11, 100)]);
    expect(s.fastest).toMatchObject({ dow: 4, fromHour: 11, toHour: 12 });
  });

  it("reports the least reliable window when uptime dips", () => {
    const s = summarize([cell(5, 8, 200, 100), cell(5, 9, 200, 100), cell(1, 20, 200, 60), cell(1, 21, 200, 70)]);
    expect(s.alwaysOnline).toBe(false);
    expect(s.leastReliable).toMatchObject({ dow: 1, fromHour: 20, toHour: 22 });
  });

  it("never reports a slowest window that overlaps the fastest", () => {
    // Only 3 consecutive hours of data: 10 AM slow, 11 AM and 12 PM fast.
    const s = summarize([cell(4, 10, 610), cell(4, 11, 380), cell(4, 12, 360)]);
    expect(s.fastest).toMatchObject({ dow: 4, fromHour: 11, toHour: 13 });
    expect(s.slowest).toBeNull(); // 10–12 overlaps 11–13
  });

  it("skips 'slowest' when it's barely slower than the fastest", () => {
    const s = summarize([cell(1, 1, 100), cell(1, 2, 100), cell(1, 3, 110)]);
    expect(s.slowest).toBeNull();
  });

  it("says when there isn't enough data", () => {
    expect(summarize([cell(1, 1, 100, 100, 3)]).enoughData).toBe(false);
    expect(summarize([]).enoughData).toBe(false);
  });
});
