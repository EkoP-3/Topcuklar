/** Small 2D geometry helpers used by the simulation. */

export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Wraps an angle difference into (-PI, PI]. */
export function wrapAngle(a: number): number {
  let r = a % TAU;
  if (r > Math.PI) r -= TAU;
  else if (r <= -Math.PI) r += TAU;
  return r;
}

/** Closest point on segment AB to point P, plus the squared distance to it. */
export function closestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; d2: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const t = len2 === 0 ? 0 : clamp(((px - ax) * abx + (py - ay) * aby) / len2, 0, 1);
  const x = ax + abx * t;
  const y = ay + aby * t;
  const dx = px - x;
  const dy = py - y;
  return { x, y, d2: dx * dx + dy * dy };
}

function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}

function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = cross(dx - cx, dy - cy, ax - cx, ay - cy);
  const d2 = cross(dx - cx, dy - cy, bx - cx, by - cy);
  const d3 = cross(bx - ax, by - ay, cx - ax, cy - ay);
  const d4 = cross(bx - ax, by - ay, dx - ax, dy - ay);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** Squared minimum distance between segments AB and CD (0 when they cross). */
export function segmentDistanceSq(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;
  return Math.min(
    closestOnSegment(ax, ay, cx, cy, dx, dy).d2,
    closestOnSegment(bx, by, cx, cy, dx, dy).d2,
    closestOnSegment(cx, cy, ax, ay, bx, by).d2,
    closestOnSegment(dx, dy, ax, ay, bx, by).d2,
  );
}
