import * as THREE from "three";
import { BUILDING_MODELS } from "./building-models";

const bytes = (base64: string) => Uint8Array.from(atob(base64), c => c.charCodeAt(0));
const cache = new Map<string, THREE.BufferGeometry>();

// Street building geometry: flat colours per triangle, no normals/uv (the material
// derives flat normals), so a merged block stays small on phones. Mirrored copies
// flip the winding so they are not drawn inside out.
export function glbBuildingGeometry(variant: number, mirror: boolean) {
  const key = `${variant % 5}:${mirror}`, cached = cache.get(key);
  if (cached) return cached;
  const model = BUILDING_MODELS[variant % 5];
  const pos = new Int16Array(bytes(model.positions).buffer), idx = new Uint16Array(bytes(model.indices).buffer), tri = bytes(model.colors);
  const palette = model.palette.map(hex => new THREE.Color(hex)), triangles = tri.length;
  const position = new Float32Array(triangles * 9), color = new Uint8Array(triangles * 9), flip = mirror ? -1 : 1;
  for (let t = 0; t < triangles; t++) for (let k = 0; k < 3; k++) {
    const vertex = idx[t * 3 + (mirror ? [0, 2, 1][k] : k)], out = t * 9 + k * 3, c = palette[tri[t]];
    position[out] = flip * pos[vertex * 3] / 2048; position[out + 1] = pos[vertex * 3 + 1] / 2048; position[out + 2] = pos[vertex * 3 + 2] / 2048;
    color[out] = Math.round(c.r * 255); color[out + 1] = Math.round(c.g * 255); color[out + 2] = Math.round(c.b * 255);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(position, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(color, 3, true));
  cache.set(key, geometry);
  return geometry;
}

// Lot size for a street building of the given height (m) and frontage stretch.
export function glbBuildingSize(variant: number, height: number, stretch: number) {
  const model = BUILDING_MODELS[variant % 5], scale = height / model.h;
  return { scale, width: model.w * scale * stretch, depth: model.d * scale };
}
