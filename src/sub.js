// The submersible: a sealed sphere for the crew inside a frame of buoyant foam. In the water it feels its
// weight, the buoyancy of the water it pushes aside, and quadratic drag: F = m g - rho V g - 1/2 rho Cd A v|v|.
//
// Seawater gets about 4 % denser by the bottom of the trench, so a rigid sub would float to a stop halfway
// down. Like real deep submersibles, this one trims with a variable ballast tank: the pilot pumps water in to
// sink and out to rise, a few kilograms a second. The hull and foam are taken to compress as much as seawater
// does, so the trim alone sets how heavy the sub is at any depth.
//
// For a constant net weight W and drag constant k = 1/2 rho Cd A, sinking from rest has an exact answer:
// v(t) = vt tanh(t vt k / M), with terminal speed vt = sqrt(W / k) and M the mass plus the water dragged along
// (added mass). The page integrates the general case step by step; the tests compare the two.

import { pressureDbar, temperature } from "./ocean.js";
import { density } from "./seawater.js";

export const SUB = {
  mass: 11700, // kg, dry, with the tank empty
  addedMass: 3200, // kg of water moved with the hull
  dragArea: 4.2, // m^2 seen from below
  dragCoeff: 0.9,
  sideArea: 6.5, // m^2 seen from the side
  sideCoeff: 1.0,
  thrust: 3200, // N from the horizontal thrusters: about 1 m/s sideways
  pumpRate: 4, // kg of water a second in or out of the trim tank
  trimDive: 130, // kg heavy: sinks at about 0.8 m/s
  trimRise: -180, // kg light
};

export const G = 9.81;
export const SALINITY = 35; // practical salinity, taken the same all the way down

// Density (kg/m^3) of the water round the sub at a depth: EOS-80 at that depth's temperature and pressure.
// It rises about 4.5 % by the bottom. Below 10,000 dbar (about 9,700 m) this is past the range the equation
// was fitted over.
export const seawaterDensity = (depth) => density(SALINITY, temperature(depth), pressureDbar(depth));

// Net downward force (N): the trim, since hull and water compress alike.
export const netWeight = (state) => state.trim * G;

// One step (semi-implicit Euler, stable with drag). state: { pos [x, y up, z] m, vel m/s, trim kg, target kg }.
// thrust: [tx, tz] from -1 to 1. rho: water density (kg/m^3); left out, it is the density at the sub's depth.
export function step(state, dt, thrust = [0, 0], rho = seawaterDensity(-state.pos[1])) {
  const want = state.target ?? state.trim;
  state.trim += Math.max(-SUB.pumpRate * dt, Math.min(SUB.pumpRate * dt, want - state.trim));
  const M = SUB.mass + SUB.addedMass;
  const kV = 0.5 * rho * SUB.dragCoeff * SUB.dragArea;
  const kH = 0.5 * rho * SUB.sideCoeff * SUB.sideArea;
  const [vx, vy, vz] = state.vel;
  const ay = (-netWeight(state) - kV * vy * Math.abs(vy)) / M;
  const ax = (thrust[0] * SUB.thrust - kH * vx * Math.abs(vx)) / M;
  const az = (thrust[1] * SUB.thrust - kH * vz * Math.abs(vz)) / M;
  state.vel = [vx + ax * dt, vy + ay * dt, vz + az * dt];
  state.pos = state.pos.map((p, k) => p + state.vel[k] * dt);
  if (state.pos[1] > -1.5) { state.pos[1] = -1.5; state.vel[1] = Math.min(0, state.vel[1]); }
  return state;
}

// Exact sinking speed after t seconds from rest under a constant net weight W (N), in water of density rho.
export function exactSinkSpeed(W, t, rho = 1025) {
  const k = 0.5 * rho * SUB.dragCoeff * SUB.dragArea;
  const vt = Math.sqrt(W / k);
  return vt * Math.tanh((t * vt * k) / (SUB.mass + SUB.addedMass));
}
export const terminalSpeed = (W, rho = 1025) => Math.sqrt(W / (0.5 * rho * SUB.dragCoeff * SUB.dragArea));
