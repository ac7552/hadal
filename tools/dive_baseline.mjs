// The regression baseline for a full dive: the time the sub takes to reach each depth mark, and its speed
// there, sinking from the surface with the trim tank set to dive. test/reference/dive-baseline.json holds the
// recorded numbers; the tests fail if the engine drifts from them by more than the stated tolerance.
// After a change that is meant to move them:  node tools/dive_baseline.mjs --record
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { CHALLENGER_DEEP } from "../src/ocean.js";
import { SUB, step } from "../src/sub.js";

export const MARKS = [200, 1000, 4000, 6000, 8000, 10000, CHALLENGER_DEEP];

export function diveMarks(dt = 0.5) {
  const st = { pos: [0, -2, 0], vel: [0, 0, 0], trim: 0, target: SUB.trimDive };
  const out = [];
  let t = 0;
  for (const depth of MARKS) {
    while (-st.pos[1] < depth && t < 60000) { step(st, dt); t += dt; }
    out.push({ depth_m: depth, time_s: t, speed_m_s: +(-st.vel[1]).toFixed(6) });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const marks = diveMarks();
  if (process.argv.includes("--record")) {
    const file = new URL("../test/reference/dive-baseline.json", import.meta.url);
    fs.writeFileSync(file, JSON.stringify({ what: "Time to reach each depth and speed there, sinking from the surface with the trim tank set to dive", source: "Recorded from this engine by tools/dive_baseline.mjs --record", tolerance_fraction: 0.01, marks }, null, 1));
  }
  for (const m of marks) console.log(`${String(m.depth_m).padStart(6)} m  ${(m.time_s / 3600).toFixed(3)} h  ${m.speed_m_s.toFixed(4)} m/s`);
}
