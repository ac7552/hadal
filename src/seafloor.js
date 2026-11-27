// The seafloor: a made-up slice of ocean from a shallow reef, over a drop-off, down a trench wall to a floor
// at the depth of the Challenger Deep. x runs east, away from the reef; z runs along the trench; depth is
// metres below the surface. The wall is far steeper than real trench walls (about 45 degrees on average
// instead of 5 to 10), squeezed so the whole dive happens beside it.
import { CHALLENGER_DEEP } from "./ocean.js";
import { fbm2, ridged2 } from "./random.js";

export const REEF_EDGE = 0; // x where the reef drops off
export const WALL_LENGTH = 11500; // m of x from the drop-off to the trench floor
const SEED = 41;

// The wall's profile without detail: depth (m) at x.
export function profile(x) {
  if (x <= REEF_EDGE) return 6 + 4 * Math.max(0, Math.min(1, (x + 300) / -300));
  const t = Math.min(1, (x - REEF_EDGE) / WALL_LENGTH);
  // Steep near the top (a drop-off), terraced in the middle, easing onto a flat floor at the bottom.
  const shape = 1 - (1 - t) ** 1.25;
  const terraces = 0.012 * Math.sin(t * Math.PI * 22) * t * (1 - t);
  return 10 + (CHALLENGER_DEEP - 10) * Math.min(1, shape + terraces);
}

// x on the wall where the profile reaches a depth, by bisection.
export function wallX(depth) {
  if (depth <= 10) return REEF_EDGE;
  let lo = REEF_EDGE, hi = REEF_EDGE + WALL_LENGTH;
  for (let k = 0; k < 60; k++) {
    const mid = (lo + hi) / 2;
    if (profile(mid) < depth) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// Full depth (m) at a point: the profile plus rock, ridges and gullies, smoothing into sediment on the flats.
export function depthAt(x, z) {
  const base = profile(x);
  if (x <= REEF_EDGE + 8) {
    const bommies = Math.max(0, fbm2(x / 9, z / 9, 4, SEED) - 0.55) * 14; // coral heads
    const sand = (fbm2(x / 30, z / 30, 3, SEED + 3) - 0.5) * 2.5;
    return Math.max(1.5, base - bommies + sand);
  }
  const deep = base / CHALLENGER_DEEP;
  const flat = Math.max(0, Math.min(1, (x - REEF_EDGE - WALL_LENGTH * 0.93) / (WALL_LENGTH * 0.07)));
  const rock = (1 - flat) * (1 - 0.5 * deep);
  const gullies = (ridged2(x / 140, z / 90, 4, SEED + 7) - 0.5) * 70 * rock;
  const blocks = (fbm2(x / 18, z / 18, 4, SEED + 11) - 0.5) * 12 * rock;
  const ripples = (fbm2(x / 6, z / 6, 2, SEED + 13) - 0.5) * 0.8;
  const mounds = (fbm2(x / 60, z / 60, 3, SEED + 17) - 0.5) * 6 * flat;
  return Math.max(1.5, Math.min(CHALLENGER_DEEP + 25, base + gullies + blocks + ripples + mounds));
}

// Unit normal (y up) by central differences.
export function normalAt(x, z, h = 0.75) {
  const dx = depthAt(x + h, z) - depthAt(x - h, z);
  const dz = depthAt(x, z + h) - depthAt(x, z - h);
  const n = [dx / (2 * h), 1, dz / (2 * h)]; // y = -depth, so the gradient flips sign
  const l = Math.hypot(...n);
  return n.map((v) => v / l);
}

// Where the sub should be to hang beside the wall at a depth: out from the wall by a stand-off (m).
export const besideWall = (depth, standoff = 22) => wallX(depth + standoff * 0.9) + standoff;
