// Minimal GLB reader shared by the convert-*.mjs scripts (triangle lists, float/uint accessors, no textures).
import fs from "node:fs";

// Codex exports baseColorFactor already in display (sRGB) values, so it is used as-is (no linear->sRGB).
export const hex = f => "#" + f.slice(0, 3).map(c => Math.round(c * 255).toString(16).padStart(2, "0")).join("");
const SIZES = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 };

export function readGlb(file) {
  const b = fs.readFileSync(file), jsonLength = b.readUInt32LE(12);
  const json = JSON.parse(b.subarray(20, 20 + jsonLength).toString());
  const bin = b.subarray(28 + jsonLength);
  const accessor = i => {
    const a = json.accessors[i], view = json.bufferViews[a.bufferView], n = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const size = SIZES[a.componentType], stride = view.byteStride || size * n, start = (view.byteOffset || 0) + (a.byteOffset || 0);
    const get = { 5121: "readUInt8", 5123: "readUInt16LE", 5125: "readUInt32LE", 5126: "readFloatLE" }[a.componentType];
    return Array.from({ length: a.count * n }, (_, k) => bin[get](start + Math.floor(k / n) * stride + (k % n) * size));
  };
  return { json, accessor };
}

// One primitive as a flat triangle list: [{ pos: [x,y,z] x3, color }]
export function primitiveTriangles(file, json, accessor, p, transform) {
  if ((p.mode ?? 4) !== 4) throw new Error(`${file}: only triangle lists are supported`);
  const pos = accessor(p.attributes.POSITION), count = pos.length / 3;
  const idx = p.indices != null ? accessor(p.indices) : Array.from({ length: count }, (_, k) => k);
  const color = hex(json.materials?.[p.material]?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1]);
  const triangles = [];
  for (let k = 0; k < idx.length; k += 3) triangles.push({ color, pos: [0, 1, 2].map(o => transform(pos.slice(idx[k + o] * 3, idx[k + o] * 3 + 3))) });
  return triangles;
}
