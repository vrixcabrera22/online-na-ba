// Geometry for the hand-built response-time chart (pure: unit tested).
// Replaces Recharts, which cost ~0.9 s of main-thread time on phones.

export interface Point {
  t: number; // ms since epoch
  ms: number | null; // null = no response (down)
}

/** "Nice" round axis ticks from 0 up to at least `max`: 0, 250, 500, 750… */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.001; v += step) ticks.push(Math.round(v * 1000) / 1000);
  if (ticks[ticks.length - 1] < max) ticks.push(ticks[ticks.length - 1] + step);
  return ticks;
}

/** `count` evenly spaced timestamps across [min, max] for x-axis labels. */
export function timeTicks(min: number, max: number, count: number): number[] {
  if (max <= min) return [min];
  return Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));
}

/**
 * SVG paths for the line and the filled area, in a 0–1000 × 0–1000 box
 * (stretched to fit with preserveAspectRatio="none"). Failed checks (null)
 * break the line, so outages show as gaps instead of a fake value.
 */
export function buildPaths(points: Point[], yMax: number): { line: string; area: string } {
  if (points.length === 0 || yMax <= 0) return { line: "", area: "" };
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const x = (t: number) => (t1 === t0 ? 500 : ((t - t0) / (t1 - t0)) * 1000);
  const y = (ms: number) => 1000 - Math.min(1, ms / yMax) * 1000;
  const r = (n: number) => Math.round(n * 10) / 10;

  const segments: Point[][] = [];
  let current: Point[] = [];
  for (const p of points) {
    if (p.ms === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push(p);
  }
  if (current.length) segments.push(current);

  let line = "";
  let area = "";
  for (const seg of segments) {
    const pts = seg.map((p) => `${r(x(p.t))},${r(y(p.ms as number))}`);
    // A lone point between gaps gets a tiny horizontal tick so it's visible.
    const drawn = pts.length === 1 ? [pts[0], `${r(x(seg[0].t) + 4)},${pts[0].split(",")[1]}`] : pts;
    line += `M${drawn.join("L")}`;
    area += `M${r(x(seg[0].t))},1000L${drawn.join("L")}L${r(x(seg[seg.length - 1].t) + (pts.length === 1 ? 4 : 0))},1000Z`;
  }
  return { line, area };
}

/** Index of the point nearest to time `t` (points sorted by t). */
export function nearestIndex(points: Point[], t: number): number {
  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].t < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo > 0 && Math.abs(points[lo - 1].t - t) <= Math.abs(points[lo].t - t)) return lo - 1;
  return lo;
}
