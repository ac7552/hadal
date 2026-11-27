import assert from "node:assert/strict";
import { test } from "node:test";
import { CHALLENGER_DEEP, depthFromPressure, hydrostaticPressure, pressureDbar, temperature, zoneAt } from "../src/ocean.js";
import { CLEAR_OCEAN, depthForLight, optics, parAt, sunlightAt } from "../src/water.js";
import fs from "node:fs";
import { SUB, exactSinkSpeed, seawaterDensity, step, terminalSpeed } from "../src/sub.js";
import { density, depthFromPressureUnesco } from "../src/seawater.js";
import { diveMarks } from "../tools/dive_baseline.mjs";
import { depthAt, profile, wallX } from "../src/seafloor.js";

const close = (a, b, tol, what) => assert.ok(Math.abs(a - b) <= tol, `${what}: ${a} vs ${b}`);
const reference = (name) => JSON.parse(fs.readFileSync(new URL(`./reference/${name}.json`, import.meta.url)));

// The bar: reference tables in test/reference/, each with its own stated tolerance.
test("reference table: seawater density matches the EOS-80 check values", () => {
  const ref = reference("eos80-density");
  for (const r of ref.rows) close(density(r.S, r.T, r.p), r.density, ref.tolerance, `S ${r.S}, T ${r.T}, p ${r.p}`);
});

test("reference table: depth from pressure matches each formula's check value, and the two formulas agree", () => {
  const ref = reference("depth-pressure");
  for (const r of ref.rows) close((r.formula === "unesco" ? depthFromPressureUnesco : depthFromPressure)(r.p, r.lat), r.depth, r.tolerance, `${r.formula} at ${r.p} dbar`);
  for (let p = 500; p <= 11000; p += 500) close(depthFromPressure(p) / depthFromPressureUnesco(p, 11.37), 1, ref.agreement.tolerance_fraction, `${p} dbar`);
});

test("reference table: the engine's sinking speed matches the closed-form table", () => {
  const ref = reference("sinking-speed");
  for (const trim of new Set(ref.rows.map((r) => r.trim_kg))) {
    const st = { pos: [0, -100, 0], vel: [0, 0, 0], trim };
    let t = 0;
    for (const r of ref.rows.filter((x) => x.trim_kg === trim)) {
      while (t < r.t_s - 1e-9) { step(st, 0.01, [0, 0], ref.body.water_density); st.pos[1] = -100; t += 0.01; }
      close(-st.vel[1], r.speed_m_s, ref.tolerance_fraction_of_terminal * r.terminal_m_s, `trim ${trim} kg at ${r.t_s} s`);
    }
  }
});

test("regression: a full dive keeps to the recorded baseline", () => {
  const ref = reference("dive-baseline");
  const now = diveMarks();
  for (const m of ref.marks) {
    const got = now.find((x) => x.depth_m === m.depth_m);
    close(got.time_s / m.time_s, 1, ref.tolerance_fraction, `time to ${m.depth_m} m`);
    close(got.speed_m_s / m.speed_m_s, 1, ref.tolerance_fraction, `speed at ${m.depth_m} m`);
  }
});

test("the water round the sub gets denser with depth, by about 4.5 % at the bottom", () => {
  close(seawaterDensity(0), 1022.3, 0.5, "warm surface water");
  for (let d = 0; d < CHALLENGER_DEEP; d += 250) assert.ok(seawaterDensity(d + 250) > seawaterDensity(d), `denser below ${d} m`);
  close(seawaterDensity(CHALLENGER_DEEP) / seawaterDensity(0), 1.05, 0.01, "bottom over surface");
});

test("Saunders' formula meets its published check value and inverts exactly", () => {
  close(depthFromPressure(7500, 30), 7321.444, 0.001, "7,500 dbar at 30 degrees");
  for (const d of [10, 900, 6000, CHALLENGER_DEEP]) close(depthFromPressure(pressureDbar(d, 11), 11), d, 1e-6, `${d} m`);
});

test("an independent hydrostatic integration agrees with Saunders to 0.1 %", () => {
  for (const d of [500, 4000, CHALLENGER_DEEP]) close(hydrostaticPressure(d, 11.37, 5) / pressureDbar(d), 1, 0.001, `${d} m`);
});

test("red light goes first, blue light lasts longest", () => {
  const k = [610, 545, 465].map((nm) => optics(nm).Kd);
  assert.ok(k[0] > k[1] && k[1] > k[2]);
  const at30 = sunlightAt(30).rgb;
  assert.ok(at30[2] > at30[1] && at30[1] > 5 * at30[0], `${at30}`);
});

test("the clear-ocean setting ends the sunlight zone near 165 m and the twilight near 1,000 m", () => {
  close(depthForLight(0.01, CLEAR_OCEAN, parAt), 165, 15, "1 % of plant light");
  close(depthForLight(1e-10), 1000, 60, "last light");
  assert.ok(depthForLight(0.01, 0, parAt) > depthForLight(0.01, 1, parAt), "pure water is clearer");
});

test("the water is warm on top and just above freezing below", () => {
  assert.ok(temperature(5) > 26);
  close(temperature(1000), 4.2, 0.5, "1,000 m");
  assert.ok(temperature(CHALLENGER_DEEP) > 1 && temperature(CHALLENGER_DEEP) < 4, "1 to 4 C at the bottom");
});

test("the sub's step-by-step sinking matches the exact solution", () => {
  const W = SUB.trimDive * 9.81, rho = seawaterDensity(100);
  const st = { pos: [0, -100, 0], vel: [0, 0, 0], trim: SUB.trimDive };
  for (let t = 0.05; t <= 60.001; t += 0.05) {
    step(st, 0.05);
    st.pos[1] = -100;
    close(-st.vel[1], exactSinkSpeed(W, t, rho), 0.002 * terminalSpeed(W), `t = ${t.toFixed(2)} s`);
  }
});

test("a dive reaches the bottom in about four hours, and dropping weight brings it back up", () => {
  const st = { pos: [0, -2, 0], vel: [0, 0, 0], trim: 0, target: SUB.trimDive };
  let t = 0;
  while (-st.pos[1] < CHALLENGER_DEEP && t < 30000) { step(st, 1); t += 1; }
  close(t / 3600, 3.8, 0.5, "hours down");
  st.target = SUB.trimRise;
  for (let k = 0; k < 300; k++) step(st, 1);
  assert.ok(st.vel[1] > 0.5, `rising at ${st.vel[1]} m/s`);
});

test("the seafloor runs from a shallow reef to the Challenger Deep", () => {
  assert.ok(depthAt(-100, 0) < 15, "reef");
  close(depthAt(12000, 50), CHALLENGER_DEEP, 25, "trench floor");
  for (let x = 0; x < 11500; x += 500) assert.ok(profile(x + 500) >= profile(x) - 1, `profile goes down at ${x}`);
  close(profile(wallX(4000)), 4000, 1, "wallX inverts the profile");
  assert.equal(zoneAt(7000).name, "Hadal zone");
});
