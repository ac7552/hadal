// Underwater lighting shared by every surface: sunlight from above, dimmed and coloured by the depth it has
// come down through (a table made spectrally by src/water.js), the sub's two floodlights, and
// the water itself, which dims everything along the path to the eye channel by channel and adds its own glow
// (light scattered toward the eye, including the visible beams of the lamps).
import * as THREE from "three";

export const shared = {
  uSunLut: { value: null },
  uLutDepth: { value: 1400 },
  uExtinction: { value: new THREE.Vector3(0.2, 0.07, 0.05) }, // beam attenuation c per channel, 1/m
  uAlbedo: { value: new THREE.Vector3(0.1, 0.36, 0.67) }, // single-scattering albedo b/c per channel
  uLampPos: { value: [new THREE.Vector3(), new THREE.Vector3()] },
  uLampDir: { value: [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, -1)] },
  uLampOn: { value: 1 },
  uLampPower: { value: 60 },
  uFill: { value: 0.12 }, // a soft light on the viewer's camera, like a second vehicle filming the dive
  uTime: { value: 0 },
};

export const HEAD = /* glsl */ `
uniform sampler2D uSunLut; uniform float uLutDepth;
uniform vec3 uExtinction; uniform vec3 uAlbedo;
uniform vec3 uLampPos[2]; uniform vec3 uLampDir[2]; uniform float uLampOn; uniform float uLampPower; uniform float uFill;
uniform float uTime;
const vec3 LAMP_COLOUR = vec3(1.0, 0.93, 0.82); // 5000 K LEDs
vec3 sunlight(float depth) {
  float t = sqrt(clamp(depth / uLutDepth, 0.0, 1.0));
  return depth >= uLutDepth ? vec3(0.0) : texture2D(uSunLut, vec2(t, 0.5)).rgb;
}
float cone(int k, vec3 p, out vec3 L, out float d) {
  vec3 v = p - uLampPos[k]; d = max(length(v), 0.05); L = -v / d;
  float c = dot(-L, uLampDir[k]);
  return smoothstep(0.5, 0.86, c) * uLampOn;
}
// Lamp light arriving at p, before the trip to the eye.
vec3 lampAt(vec3 p, vec3 N, float wrap) {
  vec3 sum = vec3(0.0);
  for (int k = 0; k < 2; k++) {
    vec3 L; float d;
    float s = cone(k, p, L, d);
    if (s <= 0.0) continue;
    float nl = N == vec3(0.0) ? 1.0 : clamp((dot(N, L) + wrap) / (1.0 + wrap), 0.0, 1.0);
    sum += LAMP_COLOUR * uLampPower * s * nl * exp(-uExtinction * d) / (d * d);
  }
  // The filming light, at the eye.
  vec3 v = p - cameraPosition; float dc = max(length(v), 0.3);
  float nc = N == vec3(0.0) ? 1.0 : clamp((dot(N, -v / dc) + wrap) / (1.0 + wrap), 0.0, 1.0);
  sum += LAMP_COLOUR * uFill * uLampOn * nc * exp(-uExtinction * dc) / (dc * dc + 1.0);
  return sum;
}
// The water's own light along a path from the eye: ambient sunlight scattered toward the eye, plus the lamp
// beams, marched in a few steps. Returns the light added; *trans gets what survives of the far end.
vec3 waterGlowN(vec3 eye, vec3 dir, float dist, out vec3 trans, int steps) {
  trans = exp(-uExtinction * dist);
  float depthMid = -(eye.y + dir.y * dist * 0.5);
  float up = smoothstep(-0.4, 1.0, dir.y);
  vec3 ambient = sunlight(max(depthMid, 0.0)) * uAlbedo * mix(0.18, 0.75, up);
  vec3 glow = ambient * (1.0 - trans);
  if (uLampOn > 0.0) {
    float reach = min(dist, 45.0);
    float h = reach / float(steps);
    vec3 beams = vec3(0.0);
    for (int i = 0; i < 10; i++) {
      if (i >= steps) break;
      float s = (float(i) + 0.5) * h;
      vec3 p = eye + dir * s;
      for (int k = 0; k < 2; k++) {
        vec3 L; float d;
        float c = cone(k, p, L, d);
        if (c <= 0.0) continue;
        float phase = 0.25 + 0.75 * pow(max(dot(dir, -L), 0.0), 2.0); // scattering leans forward
        beams += c * phase * exp(-uExtinction * (d + s)) / (d * d + 0.5);
      }
    }
    glow += beams * h * uLampPower * LAMP_COLOUR * uAlbedo * uExtinction * 0.045;
  }
  return glow;
}
vec3 waterGlow(vec3 eye, vec3 dir, float dist, out vec3 trans) { return waterGlowN(eye, dir, dist, trans, 5); }
`;

const WORLD_VARYINGS = /* glsl */ `varying vec3 vWorld; varying vec3 vNormal;`;

// A lit surface. Provides: vec3 shade(vec3 albedo, vec3 N, vec3 emit, float wrap) giving the colour at the eye.
export const SURFACE = /* glsl */ `
${WORLD_VARYINGS}
vec3 shade(vec3 albedo, vec3 N, vec3 emit, float wrap) {
  float depth = max(-vWorld.y, 0.0);
  vec3 sun = sunlight(depth);
  float sky = clamp((N.y + 0.35) / 1.35, 0.0, 1.0); // light comes mostly from above
  vec3 lit = albedo * (sun * (0.12 + 0.88 * sky) + lampAt(vWorld, N, wrap)) + emit;
  vec3 dir = vWorld - cameraPosition; float dist = length(dir); dir /= dist;
  vec3 trans;
  vec3 glow = waterGlow(cameraPosition, dir, dist, trans);
  return lit * trans + glow;
}
`;

export function lutTexture(rows) {
  const n = rows.length;
  const data = new Float32Array(n * 4);
  rows.forEach((rgb, i) => { data.set(rgb, i * 4); data[i * 4 + 3] = 1; });
  const tex = new THREE.DataTexture(data, n, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

// Seafloor: sand and coral on the reef, rock on the wall, pale ooze on the deep flats.
export const floorVertex = /* glsl */ `
${WORLD_VARYINGS}
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz; vNormal = normal;
  gl_Position = projectionMatrix * viewMatrix * w;
  #include <logdepthbuf_vertex>
}
`;

export const NOISE = /* glsl */ `
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float bump3(vec3 p) { return 0.65 * noise3(p) + 0.35 * noise3(p * 2.3 + 1.7); }
float fbm3(vec3 p) { float s = 0.0, a = 0.5; for (int k = 0; k < 4; k++) { s += a * noise3(p); p = p * 2.07 + 3.1; a *= 0.5; } return s; }
`;

export const floorFragment = /* glsl */ `
${HEAD}
${NOISE}
${SURFACE}
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec3 N = normalize(vNormal);
  float depth = -vWorld.y;
  // Small-scale relief: bend the normal by the slope of a rock-and-sediment texture.
  float rough = mix(1.0, 0.35, smoothstep(2000.0, 9000.0, depth)) * smoothstep(0.05, 0.3, 1.0 - N.y + 0.1);
  vec3 bp = vWorld * 1.7; float e = 0.12;
  float b0 = bump3(bp);
  vec3 grad = vec3(bump3(bp + vec3(e, 0, 0)) - b0, bump3(bp + vec3(0, e, 0)) - b0, bump3(bp + vec3(0, 0, e)) - b0) / e;
  N = normalize(N - (grad - dot(grad, N) * N) * 0.55 * rough);
  float slope = 1.0 - N.y;
  float n1 = fbm3(vWorld * 0.35), n2 = fbm3(vWorld * 2.1), n3 = noise3(vWorld * 9.0);
  vec3 sand = vec3(0.86, 0.8, 0.66) * (0.85 + 0.25 * n2);
  vec3 rock = mix(vec3(0.3, 0.27, 0.24), vec3(0.46, 0.42, 0.36), n1) * (0.8 + 0.3 * n3);
  vec3 ooze = vec3(0.74, 0.7, 0.62) * (0.9 + 0.12 * n2);
  vec3 hadal = mix(vec3(0.5, 0.47, 0.42), vec3(0.62, 0.58, 0.5), n1);
  vec3 soft = depth < 120.0 ? sand : depth < 6000.0 ? mix(sand * 0.85, ooze, smoothstep(120.0, 1500.0, depth)) : mix(ooze, hadal, smoothstep(6000.0, 8000.0, depth));
  vec3 albedo = mix(soft, rock, smoothstep(0.25, 0.55, slope + (n1 - 0.5) * 0.3));
  // Living reef: coral and algae patches near the surface.
  if (depth < 45.0) {
    float patchy = smoothstep(0.5, 0.62, fbm3(vWorld * 0.6 + 7.0));
    vec3 coral = mix(vec3(0.85, 0.42, 0.5), vec3(0.95, 0.72, 0.3), noise3(vWorld * 0.9));
    coral = mix(coral, vec3(0.35, 0.55, 0.42), smoothstep(0.4, 0.8, noise3(vWorld * 1.7 + 3.0)));
    albedo = mix(albedo, coral * (0.75 + 0.3 * n3), patchy * smoothstep(45.0, 15.0, depth));
  }
  // Manganese nodules and burrows on the deep plains.
  if (depth > 3500.0) albedo *= 1.0 - 0.75 * smoothstep(0.74, 0.79, noise3(vec3(vWorld.x, vWorld.y * 0.3, vWorld.z) * 7.0)) * smoothstep(0.35, 0.1, slope);
  // Sunlight caustics in the shallows.
  vec3 emit = vec3(0.0);
  if (depth < 30.0) {
    vec2 q = vWorld.xz * 0.55;
    float c = 0.0;
    for (int k = 0; k < 3; k++) {
      vec2 o = vec2(sin(uTime * 0.7 + float(k) * 2.1), cos(uTime * 0.6 + float(k) * 1.3)) * 0.6;
      c += pow(1.0 - abs(sin(q.x + o.x + sin(q.y * 1.3 + uTime * 0.5)) * sin(q.y + o.y + sin(q.x * 1.1 - uTime * 0.4))), 6.0);
      q = q * 1.7 + 0.9;
    }
    emit = albedo * sunlight(depth) * c * 0.35 * smoothstep(30.0, 2.0, depth) * max(N.y, 0.0);
  }
  gl_FragColor = vec4(shade(albedo, N, emit, 0.1), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// The open water behind everything, with the surface seen from below (Snell's window).
export const backdropVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}
`;
export const backdropFragment = /* glsl */ `
${HEAD}
${NOISE}
varying vec3 vDir;
void main() {
  vec3 dir = normalize(vDir);
  vec3 eye = cameraPosition;
  float depth = max(-eye.y, 0.0);
  vec3 trans;
  vec3 col = waterGlowN(eye, dir, 400.0, trans, 8);
  // Looking up near the surface: the sky through Snell's window, and mirror-like water outside it.
  if (dir.y > 0.0 && depth < 120.0) {
    float t = depth / dir.y;
    vec3 hit = eye + dir * t;
    float wob = fbm3(vec3(hit.xz * 0.25, uTime * 0.25));
    float window = smoothstep(0.64, 0.68, dir.y + (wob - 0.5) * 0.06); // 48.6 degrees from straight up
    vec3 skyLight = vec3(1.25, 1.35, 1.45) * (0.85 + 0.3 * wob);
    vec3 mirror = sunlight(depth) * uAlbedo * 0.5;
    col += mix(mirror, skyLight, window) * exp(-uExtinction * t);
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

// Marine snow: flecks of sinking organic matter that fill the water and light up in the beams.
export const snowVertex = /* glsl */ `
uniform vec3 uCentre; uniform float uBox; uniform float uScale;
uniform vec3 uLampPos[2]; uniform vec3 uLampDir[2]; uniform float uLampOn; uniform float uLampPower; uniform vec3 uExtinction;
uniform sampler2D uSunLut; uniform float uLutDepth; uniform vec3 uAlbedo; uniform float uTime;
attribute float aSize;
varying vec3 vCol;
const vec3 LAMP_COLOUR = vec3(1.0, 0.93, 0.82);
vec3 sunlight(float depth) { float t = sqrt(clamp(depth / uLutDepth, 0.0, 1.0)); return depth >= uLutDepth ? vec3(0.0) : texture2D(uSunLut, vec2(t, 0.5)).rgb; }
void main() {
  vec3 p = position + vec3(0.0, -uTime * 0.01, 0.0); // sinking about a centimetre a second
  p = uCentre + mod(p - uCentre + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 light = sunlight(max(-p.y, 0.0)) * 0.25;
  for (int k = 0; k < 2; k++) {
    vec3 v = p - uLampPos[k]; float d = max(length(v), 0.1);
    float c = smoothstep(0.5, 0.86, dot(v / d, uLampDir[k])) * uLampOn;
    light += LAMP_COLOUR * uLampPower * c * exp(-uExtinction * d) / (d * d);
  }
  float dist = length(p - cameraPosition);
  vCol = light * exp(-uExtinction * dist) * 0.9;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * uScale / -mv.z, 1.0, 6.0);
  gl_Position = projectionMatrix * mv;
}
`;
export const snowFragment = /* glsl */ `
varying vec3 vCol;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, r);
  gl_FragColor = vec4(vCol * a, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
