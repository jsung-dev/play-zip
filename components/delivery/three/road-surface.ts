import * as THREE from "three";

export const ROAD_SURFACE = { color: "#929A9C", restricted: "#C7BCAB", sidewalk: "#F5F0E5", textureRepeatMeters: 4 } as const;

/** Bus-only shoulders and the closed road are visibly separate from riding.
 * Reuse the asphalt grain; no new image, lighting or per-frame work is needed. */
export function createRestrictedSurfaceMaterial(road: THREE.Material) {
  const material = new THREE.MeshBasicMaterial({ color: ROAD_SURFACE.restricted,
    map: road instanceof THREE.MeshBasicMaterial ? road.map : null,
    side: THREE.DoubleSide, toneMapped: false });
  material.name = "non-drivable-stone";
  return material;
}

/** One neutral, matte surface per world, shared by every driveable ribbon.
 * Unlit color avoids different face winding/lighting tinting adjoining pieces;
 * normal distance fog and the existing ground shadows still apply.
 */
export function createRoadSurfaceMaterial() {
  const pixels = new Uint8Array(128 * 128 * 4);
  let seed = 471;
  for (let n = 0; n < pixels.length; n += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const grain = 252 + (seed >>> 24) % 4;
    pixels[n] = pixels[n + 1] = pixels[n + 2] = grain;
    pixels[n + 3] = 255;
  }
  const texture = new THREE.DataTexture(pixels, 128, 128);
  texture.name = "shared-asphalt-grain";
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 4;
  texture.needsUpdate = true;
  const material = new THREE.MeshBasicMaterial({ color: ROAD_SURFACE.color, map: texture, side: THREE.DoubleSide, toneMapped: false });
  material.name = "shared-asphalt-929a9c";
  return material;
}

/** All these ribbons are already in world coordinates. A common X/Z mapping
 * keeps the grain phase and scale identical at overlaps; positions are untouched.
 */
export function applyRoadSurfaceUV(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let n = 0; n < position.count; n++) {
    uv[n * 2] = position.getX(n) / ROAD_SURFACE.textureRepeatMeters;
    uv[n * 2 + 1] = position.getZ(n) / ROAD_SURFACE.textureRepeatMeters;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}
