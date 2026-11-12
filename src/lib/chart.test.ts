import { describe, expect, it } from "vitest";
import { buildPaths, nearestIndex, niceTicks, timeTicks, type Point } from "./chart";

describe("niceTicks", () => {
  it.each([
    [610, [0, 200, 400, 600, 800]],
    [1400, [0, 500, 1000, 1500]],
    [95, [0, 25, 50, 75, 100]],
    [4000, [0, 1000, 2000, 3000, 4000]],
  ])("max %d → %j", (max, ticks) => {
    expect(niceTicks(max)).toEqual(ticks);
  });
  it("covers the max", () => {
    for (const m of [1, 7, 333, 6001, 14999]) expect(niceTicks(m).at(-1)!).toBeGreaterThanOrEqual(m);
  });
  it("handles zero", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

describe("timeTicks", () => {
  it("spreads evenly including both ends", () => {
    expect(timeTicks(0, 100, 5)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe("buildPaths", () => {
  const pts: Point[] = [
    { t: 0, ms: 100 },
    { t: 10, ms: 200 },
    { t: 20, ms: null },
    { t: 30, ms: 200 },
    { t: 40, ms: 100 },
  ];
  it("breaks the line at failed checks (two segments)", () => {
    const { line, area } = buildPaths(pts, 200);
    expect(line.match(/M/g)).toHaveLength(2);
    expect(area.match(/Z/g)).toHaveLength(2);
  });
  it("maps time to x and value to y (0–1000 box, y down)", () => {
    const { line } = buildPaths(pts, 200);
    expect(line.startsWith("M0,500L250,0")).toBe(true); // 100ms → half height; 200ms → top
  });
  it("draws a lone point between gaps", () => {
    const { line } = buildPaths([{ t: 0, ms: null }, { t: 10, ms: 50 }, { t: 20, ms: null }], 100);
    expect(line).toMatch(/^M500,500L504,500$/);
  });
  it("empty input → empty paths", () => {
    expect(buildPaths([], 100)).toEqual({ line: "", area: "" });
  });
});

describe("nearestIndex", () => {
  const pts: Point[] = [0, 10, 20, 30].map((t) => ({ t, ms: 1 }));
  it.each([
    [-5, 0],
    [4, 0],
    [6, 1],
    [15, 1], // tie goes to the earlier point
    [29, 3],
    [99, 3],
  ])("t=%d → %d", (t, i) => {
    expect(nearestIndex(pts, t)).toBe(i);
  });
});
