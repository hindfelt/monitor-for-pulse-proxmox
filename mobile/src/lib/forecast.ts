import type { HistoryPoint } from './types';

/** Days until 100% from a least-squares line through the points, or undefined if not growing. */
export function daysUntilFull(points: HistoryPoint[]): number | undefined {
  if (points.length < 10) return undefined;
  const t0 = points[0].timestamp;
  const xs = points.map((p) => (p.timestamp - t0) / 86_400_000);
  const ys = points.map((p) => p.value);
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (!den) return undefined;
  const slope = num / den;
  if (slope < 0.05) return undefined;
  const last = ys[n - 1];
  return last >= 100 ? 0 : (100 - last) / slope;
}

export function forecastText(days?: number): string | undefined {
  if (days === undefined || days > 365) return undefined;
  if (days < 1) return 'At this rate, full within a day';
  if (days < 14) return `At this rate, full in about ${Math.round(days)} days`;
  if (days < 60) return `At this rate, full in about ${Math.round(days / 7)} weeks`;
  return `At this rate, full in about ${Math.round(days / 30)} months`;
}
