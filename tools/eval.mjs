// How faithful the physics is, against answers known in advance. Run:  node tools/eval.mjs
//   pressure    Saunders (1981) against its published check value, and against an independent hydrostatic
//               integration with compressible seawater
//   light       how deep each colour and the light plants use reach, with the clarity setting the page uses
//   sub         step-by-step sinking against the exact tanh solution for quadratic drag
//   seafloor    the trench floor at the Challenger Deep's depth
import { CHALLENGER_DEEP, depthFromPressure, hydrostaticPressure, pressureBar, pressureDbar } from "../src/ocean.js";
import { CLEAR_OCEAN, depthForLight, optics, parAt } from "../src/water.js";
import { SUB, exactSinkSpeed, seawaterDensity, step, terminalSpeed } from "../src/sub.js";
import { depthAt, profile, wallX } from "../src/seafloor.js";

const rows = [];
const report = (group, name, value, unit, note = "") => rows.push({ group, name, value, unit, note });

// Pressure.
report("pressure", "Saunders check value: depth at 7,500 dbar, 30 degrees, minus the published 7,321.444 m", depthFromPressure(7500, 30) - 7321.444, "m");
for (const d of [1000, 5000, CHALLENGER_DEEP]) {
  const a = pressureDbar(d), b = hydrostaticPressure(d);
  report("pressure", `Saunders vs hydrostatic integration at ${d.toLocaleString()} m`, 100 * (b / a - 1), "%");
}
report("pressure", "pressure at the bottom of the Challenger Deep", pressureBar(CHALLENGER_DEEP), "bar", "standard-ocean formula; the real warm upper ocean is lighter");

// Light.
for (const [label, nm] of [["red light (610 nm)", 610], ["green light (545 nm)", 545], ["blue light (465 nm)", 465]]) report("light", `${label} falls to 1 %`, Math.log(100) / optics(nm).Kd, "m");
report("light", "light plants can use falls to 1 %", depthForLight(0.01, CLEAR_OCEAN, parAt), "m", "the end of the sunlight zone");
report("light", "sunlight falls to a ten-billionth", depthForLight(1e-10), "m", "the end of the twilight zone");
report("light", "pure seawater: light plants can use falls to 1 %", depthForLight(0.01, 0, parAt), "m", "clearer than any real ocean");

// The sub.
{
  const W = SUB.trimDive * 9.81;
  let worst = 0;
  const st = { pos: [0, -100, 0], vel: [0, 0, 0], trim: SUB.trimDive };
  // Constant density for the comparison, as the exact solution assumes.
  for (let t = 0.05; t <= 120; t += 0.05) {
    step(st, 0.05);
    st.pos[1] = -100;
    worst = Math.max(worst, Math.abs(-st.vel[1] - exactSinkSpeed(W, t, seawaterDensity(100))) / terminalSpeed(W));
  }
  report("sub", "step-by-step vs exact sinking speed, worst", 100 * worst, "% of top speed", "0.05 s steps, first two minutes");
  const dive = { pos: [0, -2, 0], vel: [0, 0, 0], trim: 0, target: SUB.trimDive };
  let t = 0;
  while (-dive.pos[1] < CHALLENGER_DEEP && t < 50000) { step(dive, 0.5); t += 0.5; }
  report("sub", "time from the surface to the bottom", t / 3600, "hours", `at about ${terminalSpeed(W).toFixed(2)} m/s`);
}

// Seafloor.
{
  const floor = [11700, 12000, 12500].map((x) => depthAt(x, 137));
  report("seafloor", "trench floor depth", floor.reduce((a, b) => a + b) / floor.length, "m", `Challenger Deep ${CHALLENGER_DEEP} m`);
  const slope = Math.atan((profile(wallX(9000)) - profile(wallX(1000))) / (wallX(9000) - wallX(1000))) * 180 / Math.PI;
  report("seafloor", "average wall slope, 1,000 to 9,000 m", slope, "degrees", "real trench walls average 5 to 10; this one is squeezed");
}

const fmt = (v, unit) => (v === 0 ? (unit ? "0" : "") : Math.abs(v) < 0.01 ? v.toExponential(1) : Math.abs(v) >= 100 ? Math.round(v).toLocaleString() : v.toFixed(2));
let group = "";
for (const r of rows) {
  if (r.group !== group) { console.log(`\n${r.group}`); group = r.group; }
  console.log(`  ${r.name}: ${fmt(r.value, r.unit)} ${r.unit}${r.note ? `  (${r.note})` : ""}`.replace(/:\s+ \(/, ": ("));
}
