import * as THREE from "three";

export type BuildingKit = {
  box: (w: number, h: number, d: number, color: string, radius?: number) => THREE.Mesh;
  buildingBox?: (w: number, h: number, d: number, color: string, top?: string) => THREE.Mesh;
  buildingBlob?: (radius: number, color: string) => THREE.Mesh;
  put: (g: THREE.Group, o: THREE.Object3D, x: number, y: number, z: number) => THREE.Object3D;
  shadow: (g: THREE.Group, w: number, d: number, x?: number, z?: number) => THREE.Object3D;
  merge: (g: THREE.Group) => THREE.Group;
  glbBuilding?: (variant: number, height: number, stretch: number, mirror: boolean, maxDepth?: number) => THREE.Group;
};

// A–E reference sheet palette. Only scenery architecture uses these finishes.
export const NEIGHBORHOOD_FINISH = {
  walls: ["#F7B998", "#BDE6C2", "#FFEDCA", "#D5BBEB", "#FFE298"],
  accents: ["#FFF1D0", "#90BE99", "#FFF1D0", "#B995D3", "#8DCEAC"],
  cream: "#FFF3D9", stone: "#D8D1C4", metal: "#526061",
  glass: "#59C8F3", recess: "#426D78",
  // Glass reads as sky reflection fading down; shop panes as a lit interior.
  skyGlass: ["#3E9CCB", "#BDEBFA"], shopGlass: ["#F2BD7C", "#FFF1CF"],
  curtains: ["#FFF6E6", "#FBE3D9", "#E9F3E4"], leaves: ["#7DB86F", "#98CB7E", "#6AA772"], blossom: "#F6A9B8",
} as const;

export type PaneStyle = { glass?: readonly [string, string]; curtain?: -1 | 0 | 1; curtainColor?: string };

/** Low-poly facade pieces, pooled by the world's existing art factory. */
export function facadeDetails(art: BuildingKit) {
  const c = NEIGHBORHOOD_FINISH;
  const box = (w: number, h: number, d: number, color: string, top?: string) => art.buildingBox ? art.buildingBox(w, h, d, color, top) : art.box(w, h, d, color);
  const piece = (g: THREE.Group, w: number, h: number, d: number, color: string, x: number, y: number, z: number, top?: string) => art.put(g, box(w, h, d, color, top), x, y, z);
  const pane = (g: THREE.Group, x: number, y: number, z: number, w: number, h: number, divisions = 2, darkFrame = false, style: PaneStyle = {}) => {
    const frame = darkFrame ? c.metal : c.cream, [low, high] = style.glass ?? c.skyGlass;
    piece(g, w + .16, h + .16, .02, c.recess, x, y, z + .03);
    piece(g, w, h, .025, low, x, y, z + .055, high);
    piece(g, w * .16, h - .08, .009, "#D4F3FC", x - w * .36, y + h * .04, z + .072);
    // A half-drawn curtain behind the frame makes each home read as lived in.
    if (style.curtain) piece(g, w * .3, h * .9, .02, style.curtainColor ?? c.curtains[0], x + style.curtain * w * .33, y + h * .02, z + .078);
    for (const side of [-1, 1]) {
      piece(g, .12, h + .24, .16, frame, x + side * (w + .12) / 2, y, z + .1);
      piece(g, w + .24, .12, .16, frame, x, y + side * (h + .12) / 2, z + .1);
    }
    for (let n = 1; n < divisions; n++) piece(g, .055, h, .07, frame, x - w / 2 + w * n / divisions, y, z + .1);
    piece(g, w + .3, .12, .28, frame, x, y - h / 2 - .15, z + .08);
  };
  const rail = (g: THREE.Group, w: number, x: number, base: number, z: number) => {
    piece(g, w, .07, .07, c.metal, x, base + .65, z);
    piece(g, w, .045, .045, c.metal, x, base + .2, z);
    const count = Math.max(2, Math.ceil(w / .65));
    for (let n = 0; n <= count; n++) piece(g, .045, .65, .045, c.metal, x + w * (n / count - .5), base + .325, z);
  };
  const balcony = (g: THREE.Group, w: number, x: number, base: number, z: number, depth = .6) => {
    piece(g, w + .14, .19, depth, c.cream, x, base, z + depth / 2);
    piece(g, w, .07, depth - .06, c.stone, x, base + .13, z + depth / 2);
    rail(g, w, x, base + .16, z + depth - .05);
    for (const side of [-1, 1]) piece(g, .055, .07, depth, c.metal, x + side * w / 2, base + .81, z + depth / 2);
  };
  const planter = (g: THREE.Group, w: number, x: number, y: number, z: number) => {
    piece(g, w, .26, .36, c.stone, x, y + .13, z);
    piece(g, w + .04, .07, .4, c.cream, x, y + .27, z);
    piece(g, w * .91, .28, .31, "#83BA79", x, y + .42, z);
  };
  const awning = (g: THREE.Group, w: number, x: number, y: number, z: number, color: string, depth = .85) => {
    // Slope down toward the street; the old negative angle faced away and
    // collapsed to a thin strip from the riding camera.
    const hood = box(w, .14, depth, color); hood.rotation.x = .48;
    art.put(g, hood, x, y, z + depth * .41);
    piece(g, w, .18, .09, color, x, y - .19, z + depth * .89);
  };
  const aircon = (g: THREE.Group, x: number, y: number, z: number) => {
    piece(g, .55, .38, .22, c.cream, x, y, z + .13);
    for (let n = 0; n < 3; n++) piece(g, .34, .025, .025, "#A4B2A9", x, y + (n - 1) * .08, z + .255);
  };
  // Small potted tree for roofs and balconies; falls back to a planter box.
  const shrub = (g: THREE.Group, x: number, y: number, z: number, size = 1, tone = 0) => {
    piece(g, .5 * size, .34 * size, .5 * size, c.stone, x, y + .17 * size, z);
    if (!art.buildingBlob) return;
    piece(g, .08 * size, .5 * size, .08 * size, "#8A6B55", x, y + .55 * size, z);
    art.put(g, art.buildingBlob(.42 * size, c.leaves[tone % 3]), x, y + 1.0 * size, z);
    art.put(g, art.buildingBlob(.28 * size, c.leaves[(tone + 1) % 3]), x + .22 * size, y + .82 * size, z + .12 * size);
  };
  const flowerBox = (g: THREE.Group, w: number, x: number, y: number, z: number) => {
    piece(g, w, .2, .26, c.cream, x, y, z + .13);
    piece(g, w * .92, .12, .2, c.leaves[0], x, y + .14, z + .13);
    for (let n = 0; n < 3; n++) piece(g, .1, .08, .1, c.blossom, x + (n - 1) * w * .3, y + .23, z + .15);
  };
  return { piece, pane, rail, balcony, planter, awning, aircon, shrub, flowerBox };
}
