// Pressure, temperature and the ocean's zones.
//
// Pressure from depth follows Saunders (1981), "Practical conversion of pressure to depth", J. Phys. Oceanogr.
// 11: 573-574, the formula used in the UNESCO seawater routines. It assumes a standard ocean (0 C, salinity 35)
// and is quoted good to about 0.1 % of depth. A second, independent route (hydrostaticPressure) integrates
// dp/dz = rho g with compressible seawater, so the two can be compared.

export const CHALLENGER_DEEP = 10935; // m, measured on crewed dives in 2020, +-6 m (95 %)
export const TRENCH_LATITUDE = 11.37; // degrees north, Challenger Deep

const c1Of = (lat) => { const s = Math.sin((Math.abs(lat) * Math.PI) / 180); return 5.92e-3 + 5.25e-3 * s * s; };
const C2 = 2.21e-6;

// Sea pressure (dbar, excluding the atmosphere) at a depth (m) and latitude (degrees).
export function pressureDbar(depth, lat = TRENCH_LATITUDE) {
  const c1 = c1Of(lat);
  return (1 - c1 - Math.sqrt((1 - c1) ** 2 - 4 * C2 * depth)) / (2 * C2);
}

// The inverse: depth (m) from sea pressure (dbar).
export function depthFromPressure(p, lat = TRENCH_LATITUDE) {
  return (1 - c1Of(lat)) * p - C2 * p * p;
}

// Absolute pressure in bar (sea pressure plus one atmosphere).
export const pressureBar = (depth, lat) => pressureDbar(depth, lat) / 10 + 1.01325;

// Independent route: integrate dp/dz = rho(p) g(z) for seawater at 0 C and salinity 35. Density follows
// EOS-80: rho = rho0 / (1 - p / K(p)), with rho0 = 1028.106 kg/m^3 and the secant bulk modulus
// K = 21582.27 + 3.3594 p + 5.03e-5 p^2 bar at that temperature and salinity. Gravity follows the
// international gravity formula, rising slightly with depth (2.226e-6 m/s^2 per m, as in Saunders).
export function hydrostaticPressure(depth, lat = TRENCH_LATITUDE, step = 1) {
  const s = Math.sin((lat * Math.PI) / 180) ** 2;
  const g0 = 9.780318 * (1 + 5.2788e-3 * s + 2.36e-5 * s * s);
  const rho0 = 1028.106;
  const rho = (pBar) => rho0 / (1 - pBar / (21582.27 + 3.3594 * pBar + 5.03e-5 * pBar * pBar));
  let p = 0, z = 0; // bar (sea pressure), m
  const dpdz = (zz, pp) => (rho(pp) * (g0 + 2.226e-6 * zz)) / 1e5;
  while (z < depth) {
    const h = Math.min(step, depth - z);
    const k1 = dpdz(z, p), k2 = dpdz(z + h / 2, p + (h / 2) * k1), k3 = dpdz(z + h / 2, p + (h / 2) * k2), k4 = dpdz(z + h, p + h * k3);
    p += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    z += h;
  }
  return p * 10; // dbar
}

// A typical tropical western Pacific profile, smoothed: a warm mixed layer, the thermocline, cold deep water,
// and the slight warming from compression near the bottom of the trench (1 to 4 C there).
export function temperature(depth) {
  if (depth < 60) return 28.5 - depth * 0.01;
  if (depth < 1000) return 4.2 + (27.9 - 4.2) * Math.exp(-(depth - 60) / 210);
  if (depth < 4000) return 1.5 + (4.2 - 1.5) * Math.exp(-(depth - 1000) / 900);
  return 1.5 + 0.00013 * (depth - 4000);
}

export const ZONES = [
  { name: "Sunlight zone", top: 0, bottom: 200, note: "enough light for plants to grow" },
  { name: "Twilight zone", top: 200, bottom: 1000, note: "a faint blue glow, too dim for plants" },
  { name: "Midnight zone", top: 1000, bottom: 4000, note: "no sunlight at all; only the sub's lamps" },
  { name: "Abyssal zone", top: 4000, bottom: 6000, note: "the great plains of the ocean floor" },
  { name: "Hadal zone", top: 6000, bottom: 11000, note: "the trenches, named after Hades" },
];

export const zoneAt = (depth) => ZONES.find((z) => depth < z.bottom) || ZONES[ZONES.length - 1];
