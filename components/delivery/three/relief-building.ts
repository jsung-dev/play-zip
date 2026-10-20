import * as THREE from "three";

// Street buildings baked from Meshy GLB models: each view (front/right/left/top)
// was rendered orthographically with a depth map, then merged into a few hundred
// depth-levelled quads that sample the colour render. One mesh, one atlas.
export type ReliefSpec = {
  id: string; atlas: string; atlasSize: readonly [number, number];
  width: number; depth: number; height: number;
  /** Quads of 4 vertices: int16 x,y,z (1/1000 unit) + uint16 u,v (1/65535), base64. */
  quads: number; data: string;
};

/** Largest extents (pre BUILDING_SCALE) the lot planner allows for this building. */
export type PhotoFit = { width: number; height: number; front: number; back: number };

/** Baked light: lit tops, shaded sides, soft footing at the ground. */
function shade(n: THREE.Vector3, y: number, height: number) {
  const face = n.y > .5 ? 1.12 : n.y < -.5 ? .5 : Math.abs(n.x) > .5 ? .8 : 1;
  return face * (.74 + .26 * THREE.MathUtils.smoothstep(y, 0, 1.6)) * (.92 + .08 * Math.min(1, y / height));
}

export function createReliefBuilding(spec: ReliefSpec, material: THREE.Material, fit: PhotoFit, stretch = 1.18) {
  const raw = atob(spec.data), bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const dv = new DataView(bytes.buffer), vertices = spec.quads * 4;
  const pos = new Float32Array(vertices * 3), uv = new Float32Array(vertices * 2), index = new Uint32Array(spec.quads * 6);
  for (let i = 0; i < vertices; i++) {
    const o = i * 10;
    pos[i * 3] = dv.getInt16(o, true) / 1000; pos[i * 3 + 1] = dv.getInt16(o + 2, true) / 1000; pos[i * 3 + 2] = dv.getInt16(o + 4, true) / 1000;
    uv[i * 2] = dv.getUint16(o + 6, true) / 65535; uv[i * 2 + 1] = dv.getUint16(o + 8, true) / 65535;
  }
  for (let q = 0; q < spec.quads; q++) index.set([q * 4, q * 4 + 1, q * 4 + 2, q * 4, q * 4 + 2, q * 4 + 3], q * 6);

  // Fit into the planner's lot (same footprint as the model it replaces); stretch height a little for tall lots.
  const bw = spec.width, bh = spec.height, bd = spec.depth;
  const s = Math.min(fit.width / bw, fit.height / bh), sy = s * Math.min(stretch, Math.max(1, fit.height / (bh * s)));
  const sz = Math.min(s, (fit.front + fit.back) / bd), zc = (fit.front - fit.back) / 2;
  for (let i = 0; i < vertices; i++) { pos[i * 3] = (pos[i * 3] - bw / 2) * s; pos[i * 3 + 1] *= sy; pos[i * 3 + 2] = (pos[i * 3 + 2] + bd / 2) * sz + zc; }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal"), color = new Float32Array(vertices * 3), n = new THREE.Vector3();
  for (let i = 0; i < vertices; i++) {
    const c = shade(n.fromBufferAttribute(normal, i), pos[i * 3 + 1], bh * sy);
    color[i * 3] = color[i * 3 + 1] = color[i * 3 + 2] = c;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3));
  const group = new THREE.Group(); group.add(new THREE.Mesh(geometry, material));
  group.userData.photo = { id: spec.id, scale: s, width: bw * s, height: bh * sy, depth: bd * sz };
  return group;
}
