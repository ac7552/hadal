// Hadal page: the sub hangs beside the trench wall; the seafloor is built round it as it moves.
// World: x east (away from the reef), y up (y = -depth), z along the trench, metres.
import * as THREE from "three";
import { OrbitControls } from "./vendor/OrbitControls.js";
import { shared, lutTexture, floorVertex, floorFragment, backdropVertex, backdropFragment, snowVertex, snowFragment } from "./underwater.js";
import { subGeometry, subMaterial } from "./sub-model.js";
import { CHALLENGER_DEEP, ZONES, pressureBar, temperature, zoneAt } from "../src/ocean.js";
import { beamAttenuation, scatterAlbedo, sunlightAt } from "../src/water.js";
import { SUB, step as subStep } from "../src/sub.js";
import { besideWall, depthAt } from "../src/seafloor.js";
import { seeded } from "../src/random.js";

const $ = (id) => document.getElementById(id);

// ---------- renderer ----------
const canvas = $("view");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
// Without a graphics card the browser draws in software, which is slow. Keep the frame rate up by drawing
// fewer pixels when frames come slowly, and more again when there is time to spare.
const MAX_SCALE = Math.min(2, devicePixelRatio);
const gl = renderer.getContext();
const info = gl.getExtension("WEBGL_debug_renderer_info");
const gpuName = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "";
const software = /swiftshader|llvmpipe|software|softpipe/i.test(gpuName);
let renderScale = software ? Math.min(MAX_SCALE, 0.6) : MAX_SCALE;
renderer.setPixelRatio(renderScale);
const pace = { frames: 0, since: performance.now() };
function keepPace(now) {
  pace.frames++;
  if (now - pace.since < 1000) return;
  const fps = (pace.frames * 1000) / (now - pace.since);
  pace.frames = 0; pace.since = now;
  const before = renderScale;
  if (fps < 24 && renderScale > 0.35) renderScale = Math.max(0.35, renderScale * 0.8);
  else if (fps > 48 && renderScale < MAX_SCALE) renderScale = Math.min(MAX_SCALE, renderScale * 1.15);
  if (renderScale !== before) { renderer.setPixelRatio(renderScale); resize(); }
}
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 2000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.minDistance = 0.2;
controls.maxDistance = 40;

// ---------- water ----------
const LUT_N = 256;
const lutRows = [];
for (let i = 0; i < LUT_N; i++) lutRows.push(sunlightAt(((i / (LUT_N - 1)) ** 2) * shared.uLutDepth.value).rgb);
shared.uSunLut.value = lutTexture(lutRows);
shared.uExtinction.value.set(...beamAttenuation());
shared.uAlbedo.value.set(...scatterAlbedo());
const LAMP_POWER = 0.75;

const backdrop = new THREE.Mesh(new THREE.SphereGeometry(1000, 48, 24), new THREE.ShaderMaterial({
  vertexShader: backdropVertex, fragmentShader: backdropFragment, uniforms: shared, side: THREE.BackSide, depthWrite: false,
}));
backdrop.frustumCulled = false;
backdrop.renderOrder = -1;
scene.add(backdrop);

// Marine snow.
{
  const N = 9000, box = 36;
  const rand = seeded(3);
  const pos = new Float32Array(N * 3), size = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos.set([(rand() - 0.5) * box, (rand() - 0.5) * box, (rand() - 0.5) * box], i * 3); size[i] = 0.4 + rand() * rand() * 2.5; }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  var snowUniforms = { ...shared, uCentre: { value: new THREE.Vector3() }, uBox: { value: box }, uScale: { value: 2.4 } };
  const snow = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: snowVertex, fragmentShader: snowFragment, uniforms: snowUniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  snow.frustumCulled = false;
  scene.add(snow);
}

// ---------- the seafloor round the sub ----------
const TERRAIN_N = 200, TERRAIN_STEP = 1.6;
const floorGeo = new THREE.PlaneGeometry(1, 1, TERRAIN_N - 1, TERRAIN_N - 1);
floorGeo.rotateX(-Math.PI / 2);
const floor = new THREE.Mesh(floorGeo, new THREE.ShaderMaterial({ vertexShader: floorVertex, fragmentShader: floorFragment, uniforms: shared }));
floor.frustumCulled = false;
scene.add(floor);
let floorCentre = null;
function buildFloor(cx, cz) {
  cx = Math.round(cx / TERRAIN_STEP) * TERRAIN_STEP;
  cz = Math.round(cz / TERRAIN_STEP) * TERRAIN_STEP;
  floorCentre = [cx, cz];
  const pos = floorGeo.attributes.position, nor = floorGeo.attributes.normal;
  const h = new Float32Array(TERRAIN_N * TERRAIN_N);
  const half = ((TERRAIN_N - 1) * TERRAIN_STEP) / 2;
  for (let j = 0; j < TERRAIN_N; j++) for (let i = 0; i < TERRAIN_N; i++) {
    const x = cx - half + i * TERRAIN_STEP, z = cz - half + j * TERRAIN_STEP;
    h[j * TERRAIN_N + i] = -depthAt(x, z);
    pos.setXYZ(j * TERRAIN_N + i, x, h[j * TERRAIN_N + i], z);
  }
  for (let j = 0; j < TERRAIN_N; j++) for (let i = 0; i < TERRAIN_N; i++) {
    const at = (a, b) => h[Math.min(TERRAIN_N - 1, Math.max(0, b)) * TERRAIN_N + Math.min(TERRAIN_N - 1, Math.max(0, a))];
    const nx = at(i - 1, j) - at(i + 1, j), nz = at(i, j - 1) - at(i, j + 1), ny = 2 * TERRAIN_STEP;
    const l = Math.hypot(nx, ny, nz);
    nor.setXYZ(j * TERRAIN_N + i, nx / l, ny / l, nz / l);
  }
  pos.needsUpdate = nor.needsUpdate = true;
  floorGeo.computeBoundingSphere();
}

// ---------- the sub ----------
const sub = new THREE.Mesh(subGeometry(), subMaterial(shared));
scene.add(sub);
const state = { pos: [-25, -4, 0], vel: [0, 0, 0], trim: 0, target: 0 };
let followWall = true, warp = 1, diveTime = 0;
const FORWARD = new THREE.Vector3(-1, 0, 0); // the sub faces the wall

const v3 = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
function normalFor(x, z) {
  const h = 0.6, dx = depthAt(x + h, z) - depthAt(x - h, z), dz = depthAt(x, z + h) - depthAt(x, z - h);
  const l = Math.hypot(dx, 2 * h, dz);
  return [dx / l, (2 * h) / l, dz / l];
}

// ---------- controls ----------
const keys = new Set();
addEventListener("keydown", (ev) => { if (!ev.target.closest("input, select")) keys.add(ev.key.toLowerCase()); });
addEventListener("keyup", (ev) => keys.delete(ev.key.toLowerCase()));

function setTrim(which) {
  state.target = which === "dive" ? SUB.trimDive : which === "rise" ? SUB.trimRise : 0;
  document.querySelectorAll("#ballast button").forEach((b) => b.classList.toggle("on", b.dataset.t === which));
}
document.querySelectorAll("#ballast button").forEach((b) => (b.onclick = () => setTrim(b.dataset.t)));
document.querySelectorAll("#warp button").forEach((b) => (b.onclick = () => {
  warp = Number(b.dataset.w);
  document.querySelectorAll("#warp button").forEach((c) => c.classList.toggle("on", c === b));
}));
$("lamps").onclick = () => { shared.uLampOn.value = 1 - shared.uLampOn.value; $("lamps").classList.toggle("on", shared.uLampOn.value > 0); };
$("wall").onclick = () => { followWall = !followWall; $("wall").classList.toggle("on", followWall); };
let pilot = false, freeCam = false;
const lastSub = new THREE.Vector3();
$("pilot").onclick = () => { pilot = !pilot; $("pilot").classList.toggle("on", pilot); placeCamera(true); };

function jumpTo(depth) {
  freeCam = false;
  state.pos[1] = -depth;
  state.pos = [wallTarget(), -depth, state.pos[2]];
  state.vel = [0, 0, 0];
  placeCamera(true);
  setTrim("hold");
  state.trim = 0;
  floorCentre = null;
}
const skips = $("skips");
for (const z of ZONES) {
  const b = document.createElement("button");
  b.innerHTML = `<span>${z.name}</span><small>${z.top.toLocaleString()} to ${Math.min(z.bottom, CHALLENGER_DEEP).toLocaleString()} m</small>`;
  const target = z.name.startsWith("Hadal") ? 7600 : z.name.startsWith("Sunlight") ? 18 : z.top + 120;
  b.onclick = () => jumpTo(target);
  skips.append(b);
}
{
  const b = document.createElement("button");
  b.innerHTML = `<span>Bottom of the Challenger Deep</span><small>${CHALLENGER_DEEP.toLocaleString()} m</small>`;
  b.onclick = () => jumpTo(CHALLENGER_DEEP - 6);
  skips.append(b);
}

// Where to hang: a few metres out from the actual rock at the sub's depth, found by walking in along x.
let wallCache = { at: -1, x: 0 };
function wallTarget() {
  const depth = -state.pos[1] + Math.max(0, -state.vel[1]) * 25; // look ahead to where the sub will be
  if (Math.abs(wallCache.at - depth) < 0.5 && Math.abs(wallCache.z - state.pos[2]) < 0.5) return wallCache.x;
  let x = besideWall(depth, 0) + 80;
  const z = state.pos[2];
  while (x > -400 && depthAt(x, z) > depth + 1.5) x -= 1;
  // The rock's face at this depth is at x; hang 5 m out, further if rock bulges out just below or beside.
  let clear = x + 5;
  for (let dz = -3; dz <= 3; dz += 3) for (let dy = 0; dy <= 4; dy += 2) {
    let xx = clear;
    while (depthAt(xx, z + dz) < depth + dy && xx < clear + 30) xx += 1;
    if (xx > clear) clear = xx + 3;
  }
  wallCache = { at: depth, z, x: clear };
  return clear;
}

// ---------- each frame ----------
function physics(dt) {
  let tx = 0, tz = 0;
  const fwd = new THREE.Vector3(), right = new THREE.Vector3();
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize(); right.crossVectors(fwd, UP);
  if (keys.has("w") || keys.has("arrowup")) { tx += fwd.x; tz += fwd.z; }
  if (keys.has("s") || keys.has("arrowdown")) { tx -= fwd.x; tz -= fwd.z; }
  if (keys.has("d") || keys.has("arrowright")) { tx += right.x; tz += right.z; }
  if (keys.has("a") || keys.has("arrowleft")) { tx -= right.x; tz -= right.z; }
  const manual = tx || tz;
  const steps = Math.ceil((dt * warp) / 0.25);
  const h = (dt * warp) / steps;
  for (let k = 0; k < steps; k++) {
    let thrust = [tx, tz];
    if (!manual && followWall) {
      const want = wallTarget();
      const err = want - state.pos[0];
      thrust = [Math.max(-1, Math.min(1, err * 0.08 - state.vel[0] * 1.5)), Math.max(-1, Math.min(1, -state.vel[2] * 1.5))];
    }
    const before = state.pos.slice();
    subStep(state, h, thrust);
    // Don't go into the rock.
    const floorY = -depthAt(state.pos[0], state.pos[2]) + 2.4;
    if (state.pos[1] < floorY) {
      // Touching rock: slide off it, downhill and away from the wall, rather than stick.
      const n = normalFor(state.pos[0], state.pos[2]);
      const push = floorY - state.pos[1];
      state.pos[1] = floorY;
      state.pos[0] += n[0] * push * 0.8; state.pos[2] += n[2] * push * 0.8;
      state.vel[1] = Math.max(0, state.vel[1]);
    }
    if (!freeCam) camera.position.add(v3.set(state.pos[0] - before[0], state.pos[1] - before[1], state.pos[2] - before[2]));
  }
  diveTime += dt * warp;
}

function placeCamera(reset = false) {
  if (freeCam && !reset) return;
  const sp = new THREE.Vector3(...state.pos);
  if (pilot) {
    const eye = sp.clone().add(new THREE.Vector3(-2.15, -0.35, 0));
    if (reset) { camera.position.copy(eye); controls.target.copy(eye).add(FORWARD.clone().multiplyScalar(2).add(new THREE.Vector3(0, -0.4, 0))); }
    else { const off = controls.target.clone().sub(camera.position); camera.position.copy(eye); controls.target.copy(eye).add(off); }
    controls.minDistance = 0.5; controls.maxDistance = 3;
  } else {
    if (reset) { camera.position.copy(sp).add(new THREE.Vector3(2.2, 1.7, 7.8)); controls.target.copy(sp).add(new THREE.Vector3(-3.2, -1.2, 0)); lastSub.copy(sp); }
    else { controls.target.add(sp.clone().sub(lastSub)); lastSub.copy(sp); }
    controls.minDistance = 3; controls.maxDistance = 40;
  }
}

let exposure = 1;
function frame(now) {
  keepPace(now);
  const t = now / 1000;
  const dt = Math.min(0.1, t - (frame.last ?? t));
  frame.last = t;
  physics(dt);
  sub.position.set(...state.pos);
  sub.rotation.set(Math.sin(t * 0.4) * 0.015, -Math.PI / 2 + Math.sin(t * 0.23) * 0.03, Math.sin(t * 0.31) * 0.02);
  sub.visible = !pilot;
  placeCamera(false);
  // Lamps on the booms, aimed ahead and a little down.
  for (const [k, s] of [[0, -1], [1, 1]]) {
    shared.uLampPos.value[k].copy(new THREE.Vector3(s * 0.9, 0.65, 2.25).applyMatrix4(sub.matrixWorld));
    shared.uLampDir.value[k].copy(new THREE.Vector3(s * 0.12, -0.32, 1).normalize().applyQuaternion(sub.quaternion));
  }
  shared.uTime.value = t;
  shared.uLampPower.value = LAMP_POWER;
  if (!floorCentre || Math.hypot(state.pos[0] - floorCentre[0], state.pos[2] - floorCentre[1]) > 55) buildFloor(state.pos[0], state.pos[2]);
  snowUniforms.uCentre.value.copy(camera.position);
  backdrop.position.copy(camera.position);
  // The eye adapts: brighter exposure as the sunlight fades, up to a limit.
  const camDepth = Math.max(0, -camera.position.y);
  const sunEye = sunlightAt(camDepth).photopic;
  const want = Math.min(36, 0.85 / (Math.pow(sunEye, 0.55) + 0.02));
  exposure += (want - exposure) * (1 - Math.exp(-dt * 1.5));
  renderer.toneMappingExposure = exposure;
  controls.update();
  renderer.render(scene, camera);
  if (now - (frame.hud ?? 0) > 120) { hud(); frame.hud = now; }
  requestAnimationFrame(frame);
}

// ---------- read-outs ----------
function fmtLight(f) {
  if (f > 0.01) return `${(f * 100).toFixed(f > 0.1 ? 0 : 1)} %`;
  if (f > 1e-10) return `1 in ${Number(1 / f).toPrecision(2).replace(/e\+?(\d+)/, " × 10^$1")}`.replace(/\^(\d+)/, (m, d) => d.split("").map((c) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[c]).join(""));
  return "none";
}
function hud() {
  const depth = -state.pos[1];
  const p = pressureBar(depth);
  const zone = zoneAt(depth);
  $("depth").textContent = `${Math.round(depth).toLocaleString()} m`;
  $("pressure").textContent = `${p < 10 ? p.toFixed(2) : Math.round(p).toLocaleString()} bar`;
  $("temp").textContent = `${temperature(depth).toFixed(1)} °C`;
  $("light").textContent = fmtLight(sunlightAt(depth).photopic);
  const vy = state.vel[1];
  $("rate").textContent = Math.abs(vy) < 0.02 ? "holding" : `${Math.abs(vy).toFixed(2)} m/s ${vy < 0 ? "down" : "up"}`;
  $("zone").textContent = zone.name;
  $("note").textContent = zone.note;
  const hrs = Math.floor(diveTime / 3600), mins = Math.floor((diveTime % 3600) / 60);
  $("clock").textContent = `${hrs}:${String(mins).padStart(2, "0")}`;
}

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  snowUniforms.uScale.value = 2.4 * renderScale;
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
resize();
placeCamera(true);
setTrim("hold");
$("loading").hidden = true;
requestAnimationFrame(frame);
window.hadal = { renderer, scene, get renderScale() { return renderScale; }, gpuName, state, jumpTo, setTrim, camera, controls, get warp() { return warp; }, set warp(w) { warp = w; }, shared };
