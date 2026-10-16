import * as THREE from "three";
import type { SceneryItem } from "@/data/delivery-game";
import { buildingProfile } from "./street-layout";

export type StreetBuildingKind = "wide-shop" | "corner-shop" | "gable-house" | "balcony-villa" | "slim-villa" | "terrace-house";

// These are architecture inside the EXISTING lots, not new placement rules.
// Heights, setbacks, balconies and roofs all fit the old clearance envelope.
export function streetArchitecture(item: Pick<SceneryItem, "type" | "variant">) {
  const lot = buildingProfile(item, true), v = item.variant % 5;
  const shop = item.type === "shop";
  const kinds: StreetBuildingKind[] = ["gable-house", "balcony-villa", "slim-villa", "terrace-house", "corner-shop"];
  const kind = shop ? v % 2 ? "corner-shop" : "wide-shop" : kinds[v];
  const floors = shop ? v % 2 ? 3 : 2 : [3, 4, 5, 3, 4][v];
  const pitch = shop ? floors === 2 ? 3.15 : 2.45 : 2.9;
  return { kind, floors, pitch, width: lot.width * (shop ? v % 2 ? .94 : 1 : [.94, .86, .76, .98, .91][v]),
    height: floors * pitch, depth: lot.depth, variant: v };
}

type ArchitectureKit = {
  box: (w: number, h: number, d: number, color: string, radius?: number) => THREE.Mesh;
  put: (g: THREE.Group, o: THREE.Object3D, x: number, y: number, z: number) => THREE.Object3D;
  windowOn: (g: THREE.Group, x: number, y: number, z: number, w?: number, h?: number) => void;
  shadow: (g: THREE.Group, w: number, d: number) => THREE.Object3D;
  merge: (g: THREE.Group) => THREE.Group;
};

// Six silhouettes, ten cached combinations. No labels, logos or new shop signs.
// Plain low-poly solids and a small shared palette keep the street batchable.
export function createStreetArchitecture(item: SceneryItem, art: ArchitectureKit) {
  const spec = streetArchitecture(item);
  const { kind, width: w, depth: d, height: h, floors, pitch, variant: v } = spec;
  const group = new THREE.Group();
  group.userData.architecture = spec;
  const walls = ["#fae8bc", "#c8e7d4", "#d8c3e9", "#f2c9af", "#edf0cf"];
  const trims = ["#d88b6b", "#479e80", "#9b7abd", "#d8a16c", "#579f9a"];
  const wall = walls[v], trim = trims[v], cream = "#fff7e6", metal = "#3d635e";
  const { box, put, windowOn } = art;
  const front = d / 2;
  const piece = (width: number, height: number, depth: number, color: string, x: number, y: number, z: number) => put(group, box(width, height, depth, color), x, y, z);
  art.shadow(group, w + 1.2, d + 1.2);
  piece(w + .3, .22, d + .4, "#ecdfc9", 0, .11, 0);

  const stepped = kind === "corner-shop" || kind === "terrace-house";
  const topWidth = stepped ? w * (kind === "terrace-house" ? .66 : .8) : w;
  const topX = stepped ? (w - topWidth) / 2 : 0;
  const topDepth = stepped ? d - .65 : d;
  if (stepped) {
    piece(w, h - pitch, d, wall, 0, (h - pitch) / 2 + .2, 0);
    piece(topWidth, pitch, topDepth, wall, topX, h - pitch / 2 + .2, -.325);
  } else piece(w, h, d, wall, 0, h / 2 + .2, 0);
  piece(w + .12, .38, d + .1, "#d7ccb7", 0, .4, 0);

  const rail = (width: number, x: number, y: number, z: number) => {
    piece(width, .075, .075, metal, x, y + .62, z);
    for (let n = 0; n <= 4; n++) piece(.045, .62, .045, metal, x + width * (n / 4 - .5), y + .31, z);
  };
  const balcony = (width: number, x: number, y: number, z: number) => {
    piece(width + .16, .16, .64, cream, x, y, z + .25);
    rail(width, x, y + .06, z + .54);
    for (const side of [-1, 1]) piece(.05, .06, .55, metal, x + side * width / 2, y + .68, z + .27);
  };
  const parapet = (width: number, depth: number, x: number, y: number, z: number) => {
    piece(width + .28, .18, depth + .26, cream, x, y, z);
    for (const side of [-1, 1]) {
      piece(width + .1, .42, .13, wall, x, y + .25, z + side * depth / 2);
      piece(.13, .42, depth, wall, x + side * width / 2, y + .25, z);
    }
  };

  // Floor lines and windows follow actual storeys, not vertically scaled art.
  for (let floor = 0; floor < floors; floor++) {
    const upper = floor === floors - 1 && stepped;
    const fw = upper ? topWidth : w, fx = upper ? topX : 0, fz = front - (upper ? .65 : 0);
    const base = floor * pitch + .2;
    if (floor > 0) piece(fw + .14, .15, upper ? topDepth + .15 : d + .15, cream, fx, base, upper ? -.325 : 0);
    const retail = floor === 0 && (kind === "wide-shop" || kind === "corner-shop");
    const columns = kind === "wide-shop" ? 3 : 2;
    const ww = retail ? Math.min(1.8, fw * .22) : kind === "slim-villa" ? .95 : kind === "terrace-house" ? 1.25 : 1.05;
    const wh = retail ? 1.9 : kind === "balcony-villa" ? 1.65 : 1.38;
    for (let col = 0; col < columns; col++) {
      const x = fx + (col - (columns - 1) / 2) * fw * (columns === 3 ? .3 : .48);
      windowOn(group, x, base + (retail ? 1.24 : 1.45), fz + .025, ww, wh);
    }
    if (floor > 0 && kind === "balcony-villa") balcony(w * .43, (floor % 2 ? -1 : 1) * w * .24, base + .37, front);
    if (kind === "slim-villa") {
      // Narrow stairwell glazing makes this a vertical villa, not a tall shop.
      windowOn(group, 0, base + 1.5, front + .03, .38, 1.95);
    }
    for (const side of [-1, 1]) {
      const face = new THREE.Group();
      const depth = upper ? topDepth : d;
      const count = kind === "slim-villa" ? 1 : 2;
      for (let n = 0; n < count; n++) windowOn(face, (n - (count - 1) / 2) * 2.05, base + 1.45, 0, kind === "corner-shop" ? 1.25 : .86, 1.38);
      face.rotation.y = side * Math.PI / 2;
      face.position.set(fx + side * (fw / 2 + .015), 0, upper ? -.325 : 0);
      // depth is intentionally not scaled with the window geometry.
      if (depth > 3) group.add(face);
    }
  }
  if (kind !== "wide-shop") {
    piece(.92, 2.05, .14, trim, 0, 1.23, front + .09);
    piece(.64, 1.25, .03, "#3da9ba", 0, 1.48, front + .18);
    piece(1.35, .13, .65, cream, 0, 2.47, front + .24);
  }
  if (kind === "wide-shop" || kind === "corner-shop") {
    const count = kind === "wide-shop" ? 3 : 2, aw = w * .85 / count;
    for (let n = 0; n < count; n++) {
      const x = (n - (count - 1) / 2) * (aw + .08);
      const awning = box(aw, .13, .9, trim);
      awning.rotation.x = -.15; put(group, awning, x, 2.53, front + .36);
      piece(aw, .18, .1, cream, x, 2.37, front + .8);
    }
  }

  if (kind === "gable-house") {
    // Two actual sloping roof planes; geometry remains within the former roof.
    const rise = 1.1, half = (w + .26) / 2;
    const gable = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(0, rise), new THREE.Vector2(w / 2, 0)]);
    const roofBody = new THREE.Mesh(new THREE.ExtrudeGeometry(gable, { depth: d, bevelEnabled: false, steps: 1 }), box(1, 1, 1, wall).material);
    put(group, roofBody, 0, h + .2, -d / 2);
    for (const side of [-1, 1]) {
      const roof = box(Math.hypot(half, rise), .16, d + .25, trim);
      roof.rotation.z = -side * Math.atan2(rise, half);
      put(group, roof, side * half / 2, h + .75, 0);
    }
    piece(.55, .75, .55, wall, w * .24, h + .8, -.7);
  } else {
    parapet(topWidth, topDepth, topX, h + .24, stepped ? -.325 : 0);
    if (kind === "slim-villa" || kind === "balcony-villa") {
      piece(w * .36, .85, 1.5, wall, -w * .2, h + .7, -.8);
      piece(w * .36 + .2, .13, 1.7, cream, -w * .2, h + 1.18, -.8);
    }
    if (stepped) {
      piece(w + .15, .16, d + .16, cream, 0, h - pitch + .23, 0);
      rail(w * .9, 0, h - pitch + .28, front + .03);
      // The shorter wing and usable roof terrace are visible from the approach.
      rail(w - topWidth - .12, -w / 2 + (w - topWidth) / 2, h - pitch + .28, -front + .15);
    }
  }
  art.merge(group);
  return group;
}
