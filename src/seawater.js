// Seawater density, the number the submersible's buoyancy and drag depend on.
//
// density(S, T, p): the UNESCO 1980 International Equation of State of Seawater (EOS-80; Millero and Poisson
// 1981 for one atmosphere, Millero et al. 1980 for the secant bulk modulus), as set out in Fofonoff and
// Millard, "Algorithms for computation of fundamental properties of seawater", UNESCO Technical Papers in
// Marine Science 44 (1983). S: practical salinity; T: temperature in degrees C (IPTS-68); p: sea pressure in
// decibars (0 at the surface). Valid for S 0 to 42, T -2 to 40 C, p 0 to 10,000 dbar.
//
// depthFromPressureUnesco(p, lat): depth in metres from pressure in decibars for a standard ocean, by the
// formula in the same report. ocean.js uses Saunders' shorter formula; the tests hold the two together.

// Density of pure water at one atmosphere, kg/m^3.
const pureWater = (T) => 999.842594 + T * (6.793952e-2 + T * (-9.09529e-3 + T * (1.001685e-4 + T * (-1.120083e-6 + T * 6.536332e-9))));

// Density at one atmosphere (p = 0), kg/m^3.
export function densityAtSurface(S, T) {
  const b = 8.24493e-1 + T * (-4.0899e-3 + T * (7.6438e-5 + T * (-8.2467e-7 + T * 5.3875e-9)));
  const c = -5.72466e-3 + T * (1.0227e-4 + T * -1.6546e-6);
  return pureWater(T) + b * S + c * S ** 1.5 + 4.8314e-4 * S * S;
}

// Secant bulk modulus K (bar) at pressure P (bar).
export function secantBulkModulus(S, T, P) {
  const s15 = S ** 1.5;
  const Kw = 19652.21 + T * (148.4206 + T * (-2.327105 + T * (1.360477e-2 + T * -5.155288e-5)));
  const K0 = Kw + S * (54.6746 + T * (-0.603459 + T * (1.09987e-2 + T * -6.167e-5))) + s15 * (7.944e-2 + T * (1.6483e-2 + T * -5.3009e-4));
  const Aw = 3.239908 + T * (1.43713e-3 + T * (1.16092e-4 + T * -5.77905e-7));
  const A = Aw + S * (2.2838e-3 + T * (-1.0981e-5 + T * -1.6078e-6)) + 1.91075e-4 * s15;
  const Bw = 8.50935e-5 + T * (-6.12293e-6 + T * 5.2787e-8);
  const B = Bw + S * (-9.9348e-7 + T * (2.0816e-8 + T * 9.1697e-10));
  return K0 + P * (A + P * B);
}

// Density in place, kg/m^3. p in decibars.
export function density(S, T, p = 0) {
  const P = p / 10;
  return densityAtSurface(S, T) / (1 - P / secantBulkModulus(S, T, P));
}

// Depth (m) from sea pressure (dbar) at a latitude (degrees), standard ocean (S = 35, T = 0 C).
export function depthFromPressureUnesco(p, lat) {
  const x = Math.sin((lat * Math.PI) / 180) ** 2;
  const g = 9.780318 * (1 + (5.2788e-3 + 2.36e-5 * x) * x) + 1.092e-6 * p;
  return ((((-1.82e-15 * p + 2.279e-10) * p - 2.2512e-5) * p + 9.72659) * p) / g;
}
