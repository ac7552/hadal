// Light in seawater, wavelength by wavelength.
//
// Absorption of pure water: Pope and Fry (1997), Appl. Opt. 36: 8710-8723. Scattering of pure seawater:
// Smith and Baker (1981). Both as tabulated every 25 nm from 400 to 700 nm. On top of that, one made-up
// "particles" knob: dissolved and particulate matter that absorbs more in the blue (an exponential with the
// usual 0.014 per nm slope) and scatters about evenly. Pure seawater alone is clearer than any real ocean.
//
// Sunlight going down is dimmed as E(z) = E(0) exp(-Kd z), with Kd = (a + bb) / mu, mu = 0.8 the average
// cosine of the light's direction underwater and bb the backscattering. Looking sideways, light from an object
// is dimmed by the beam attenuation c = a + b over the path. Colours come from the CIE 1931 colour matching
// functions, so the water turns blue for the same reason it does in the real ocean: red is absorbed in the first metres.

export const WAVELENGTHS = [400, 425, 450, 475, 500, 525, 550, 575, 600, 625, 650, 675, 700];
export const A_WATER = [0.0066, 0.0048, 0.0092, 0.0114, 0.0204, 0.0417, 0.0565, 0.0772, 0.2224, 0.2834, 0.34, 0.448, 0.624];
export const B_WATER = [0.0076, 0.0058, 0.0045, 0.0036, 0.0029, 0.0023, 0.0019, 0.0017, 0.0014, 0.0012, 0.001, 0.0008, 0.0007];
export const MU_DOWN = 0.8;

const lerpTable = (table, nm) => {
  if (nm <= 400) return table[0];
  if (nm >= 700) return table[table.length - 1];
  const k = Math.floor((nm - 400) / 25), t = (nm - 400 - 25 * k) / 25;
  return table[k] * (1 - t) + table[k + 1] * t;
};

// The particles knob's default, set (not measured) so that 1 % of photosynthetic light reaches about 165 m and
// the last trace of sunlight (a ten-billionth of the surface's) fades near 1,000 m, the usual boundaries of the
// sunlight and twilight zones in clear open ocean.
export const CLEAR_OCEAN = 0.4;

// Inherent optical properties at one wavelength. particles: 0 for pure seawater.
export function optics(nm, particles = CLEAR_OCEAN) {
  const aw = lerpTable(A_WATER, nm), bw = lerpTable(B_WATER, nm);
  const ap = 0.012 * particles * Math.exp(-0.014 * (nm - 440));
  const bp = 0.03 * particles * (550 / nm);
  const a = aw + ap, b = bw + bp;
  const bb = 0.5 * bw + 0.01 * bp; // water scatters half backwards, particles about 1 %
  return { a, b, bb, c: a + b, Kd: (a + bb) / MU_DOWN };
}

// CIE 1931 colour matching functions, the analytic fit of Wyman, Sloan and Shirley (2013).
const lobe = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
export function cmf(nm) {
  return [
    1.056 * lobe(nm, 599.8, 37.9, 31.0) + 0.362 * lobe(nm, 442.0, 16.0, 26.7) - 0.065 * lobe(nm, 501.1, 20.4, 26.2),
    0.821 * lobe(nm, 568.8, 46.9, 40.5) + 0.286 * lobe(nm, 530.9, 16.3, 31.1),
    1.217 * lobe(nm, 437.0, 11.8, 36.0) + 0.681 * lobe(nm, 459.0, 26.0, 13.8),
  ];
}
const planck = (nm, T) => { const l = nm * 1e-9; return 1 / (l ** 5 * (Math.exp(0.0143877687750393 / (l * T)) - 1)); };
export const xyzToLinearSRGB = ([X, Y, Z]) => [3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.204 * Y + 1.057 * Z];

const STEP = 5;
const GRID = [];
for (let nm = 400; nm <= 700; nm += STEP) GRID.push(nm);
const SUN = GRID.map((nm) => planck(nm, 5800)); // daylight just under the surface, as a 5800 K blackbody
const SUN_Y = GRID.reduce((s, nm, k) => s + SUN[k] * cmf(nm)[1], 0);

// Downwelling sunlight at a depth: { rgb (linear sRGB, 1 = white sunlight at the surface), photopic (fraction
// of surface brightness as the eye sees it) }.
export function sunlightAt(depth, particles = CLEAR_OCEAN) {
  let X = 0, Y = 0, Z = 0;
  GRID.forEach((nm, k) => {
    const e = SUN[k] * Math.exp(-optics(nm, particles).Kd * depth);
    const [x, y, z] = cmf(nm);
    X += e * x; Y += e * y; Z += e * z;
  });
  const rgb = xyzToLinearSRGB([X / SUN_Y, Y / SUN_Y, Z / SUN_Y]).map((v) => Math.max(0, v));
  return { rgb, photopic: Y / SUN_Y };
}

// Photosynthetically available light (photons from 400 to 700 nm) at a depth, as a fraction of the surface's.
const PHOTONS = GRID.map((nm, k) => SUN[k] * nm);
const PHOTONS_0 = PHOTONS.reduce((a, b) => a + b, 0);
export const parAt = (depth, particles = CLEAR_OCEAN) => GRID.reduce((s, nm, k) => s + PHOTONS[k] * Math.exp(-optics(nm, particles).Kd * depth), 0) / PHOTONS_0;

// Depth (m) at which a light measure falls to a fraction of its surface value, by bisection.
export function depthForLight(fraction, particles = CLEAR_OCEAN, measure = (d, p) => sunlightAt(d, p).photopic) {
  let lo = 0, hi = 5000;
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2;
    if (measure(mid, particles) > fraction) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// The RGB channels of the renderer stand for these wavelengths when light is dimmed along a path.
export const CHANNEL_NM = [610, 545, 465];
export const beamAttenuation = (particles = CLEAR_OCEAN) => CHANNEL_NM.map((nm) => optics(nm, particles).c);
export const scatterAlbedo = (particles = CLEAR_OCEAN) => CHANNEL_NM.map((nm) => { const o = optics(nm, particles); return o.b / o.c; });

// Light along a path of length d through water, wavelength by wavelength, as seen by the eye (for tests):
// the fraction of a white light's brightness that gets through.
export function pathTransmission(d, particles = CLEAR_OCEAN) {
  let Y0 = 0, Y = 0;
  GRID.forEach((nm, k) => { const w = SUN[k] * cmf(nm)[1]; Y0 += w; Y += w * Math.exp(-optics(nm, particles).c * d); });
  return Y / Y0;
}
