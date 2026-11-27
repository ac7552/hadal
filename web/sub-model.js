// The submersible's shape and material, built from code. A made-up design, drawn with the same lighting as
// everything else in the water. aEmit marks parts that give off light (the lamp faces).
import * as THREE from "three";
import { HEAD, SURFACE } from "./underwater.js";

// ---------- building blocks ----------
function part(geometry, emit = 0, partId = 0) {
  const g = geometry.index ? geometry.toNonIndexed() : geometry;
  if (!g.attributes.normal) g.computeVertexNormals();
  const n = g.attributes.position.count;
  g.setAttribute("aEmit", new THREE.BufferAttribute(new Float32Array(n).fill(emit), 1));
  g.setAttribute("aPart", new THREE.BufferAttribute(new Float32Array(n).fill(partId), 1));
  for (const k of Object.keys(g.attributes)) if (!["position", "normal", "aEmit", "aPart", "color"].includes(k)) g.deleteAttribute(k);
  return g;
}

function merge(parts) {
  const keys = ["position", "normal", "aEmit", "aPart", ...(parts.every((p) => p.attributes.color) ? ["color"] : [])];
  const out = new THREE.BufferGeometry();
  for (const k of keys) {
    const size = parts[0].attributes[k].itemSize;
    const arr = new Float32Array(parts.reduce((s, p) => s + p.attributes[k].count * size, 0));
    let o = 0;
    for (const p of parts) { arr.set(p.attributes[k].array, o); o += p.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

const moved = (g, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => {
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s)));
  return g;
};

// ---------- the sub ----------
// A made-up design: a white foam frame, a grey titanium crew sphere low at the front, viewports, thruster
// ducts, two lamp booms, and a sampling arm. About 4.6 m long and 3.4 m tall. Vertex colours, same lighting.
export function subGeometry() {
  const parts = [];
  const add = (g, rgb, emit = 0) => {
    const p = part(g, emit, 0);
    const n = p.attributes.position.count;
    const c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) c.set(rgb, i * 3);
    p.setAttribute("color", new THREE.BufferAttribute(c, 3));
    parts.push(p);
  };
  const white = [0.92, 0.92, 0.9], grey = [0.45, 0.47, 0.5], dark = [0.08, 0.09, 0.1], orange = [0.95, 0.45, 0.12];
  add(moved(new THREE.BoxGeometry(2.3, 1.7, 3.4), 0, 0.5, -0.5), white);
  add(moved(new THREE.BoxGeometry(1.7, 0.45, 3.1), 0, 1.55, -0.55), white);
  add(moved(new THREE.BoxGeometry(2.32, 0.16, 3.42), 0, 1.3, -0.5), orange);
  add(moved(new THREE.BoxGeometry(0.16, 0.5, 3.6), 0.95, -1.15, -0.2), dark);
  add(moved(new THREE.BoxGeometry(0.16, 0.5, 3.6), -0.95, -1.15, -0.2), dark);
  for (const z of [-1.6, 0.6]) add(moved(new THREE.BoxGeometry(2.0, 0.12, 0.12), 0, -1.35, z), dark);
  add(moved(new THREE.SphereGeometry(0.95, 32, 20), 0, -0.55, 1.05), grey);
  for (const [x, y] of [[0, -0.45], [0.42, -0.62], [-0.42, -0.62]]) add(moved(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 16), x, y, 1.98, Math.PI / 2), dark, 0.05);
  for (const s of [-1, 1]) {
    add(moved(new THREE.TorusGeometry(0.28, 0.06, 8, 20), s * 1.35, 0.5, -1.6, 0, Math.PI / 2), grey);
    add(moved(new THREE.CylinderGeometry(0.1, 0.1, 0.4, 10), s * 1.35, 0.5, -1.6, 0, 0, Math.PI / 2), dark);
    add(moved(new THREE.CylinderGeometry(0.05, 0.05, 1.3, 8), s * 0.9, 1.0, 1.4, Math.PI / 2 - 0.4), grey);
    add(moved(new THREE.CylinderGeometry(0.13, 0.16, 0.3, 14), s * 0.9, 0.7, 2.05, Math.PI / 2 - 0.35), dark);
    add(moved(new THREE.CircleGeometry(0.12, 14), s * 0.9, 0.65, 2.2, -0.35), [1, 0.96, 0.85], 1.0);
  }
  add(moved(new THREE.TorusGeometry(0.28, 0.06, 8, 20), 0, 1.95, -1.2, Math.PI / 2), grey);
  add(moved(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), 0.75, -1.05, 1.35, 1.25, 0, 0.25), grey);
  add(moved(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), 0.82, -1.25, 2.05, 0.2, 0, 0), grey);
  add(moved(new THREE.BoxGeometry(0.12, 0.05, 0.16), 0.82, -1.62, 2.1), dark);
  return merge(parts);
}

export function subMaterial(uniforms) {
  return new THREE.ShaderMaterial({
    vertexShader: /* glsl */ `
      attribute vec3 color; attribute float aEmit;
      varying vec3 vWorld; varying vec3 vNormal; varying vec3 vCol; varying float vEm;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vNormal = normalize(mat3(modelMatrix) * normal);
        vCol = color; vEm = aEmit;
        gl_Position = projectionMatrix * viewMatrix * w;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */ `
      ${HEAD}
      ${SURFACE}
      varying vec3 vCol; varying float vEm;
      #include <common>
      #include <logdepthbuf_pars_fragment>
      void main() {
        #include <logdepthbuf_fragment>
        vec3 N = normalize(vNormal);
        // The sub's own work lights wash its hull a little.
        vec3 own = vCol * 0.0012 * uLampPower * uLampOn * (0.4 + 0.6 * max(N.z, 0.0));
        vec3 col = shade(vCol, N, own + vec3(vEm) * 1.5 * uLampOn, 0.2);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    uniforms,
  });
}
