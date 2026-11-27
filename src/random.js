// Seeded randomness and smooth noise, the same in Node and the browser.
export function seeded(seed) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

export const hashInts = (...k) => k.reduce((h, v) => Math.imul(h ^ (v | 0), 0x01000193) >>> 0, 0x811c9dc5);

function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Value noise in 2D, 0..1.
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fade(fx), v = fade(fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm2(x, y, octaves = 5, seed = 0) {
  let s = 0, amp = 0.5, norm = 0;
  for (let k = 0; k < octaves; k++) {
    s += amp * noise2(x, y, seed + k * 17);
    norm += amp;
    x = x * 2.03 + 11.3; y = y * 2.03 + 7.1; amp *= 0.5;
  }
  return s / norm;
}

// Ridged noise for rock: sharp crests.
export function ridged2(x, y, octaves = 4, seed = 0) {
  let s = 0, amp = 0.5, norm = 0;
  for (let k = 0; k < octaves; k++) {
    s += amp * (1 - Math.abs(2 * noise2(x, y, seed + k * 31) - 1));
    norm += amp;
    x = x * 2.1 + 3.7; y = y * 2.1 + 1.3; amp *= 0.5;
  }
  return s / norm;
}
