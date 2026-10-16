import * as THREE from "three";

export type BuildingKit = {
  box: (w: number, h: number, d: number, color: string, radius?: number) => THREE.Mesh;
  buildingBox?: (w: number, h: number, d: number, color: string) => THREE.Mesh;
  put: (g: THREE.Group, o: THREE.Object3D, x: number, y: number, z: number) => THREE.Object3D;
  shadow: (g: THREE.Group, w: number, d: number, x?: number, z?: number) => THREE.Object3D;
  merge: (g: THREE.Group) => THREE.Group;
};

// A–E reference sheet palette. Only scenery architecture uses these finishes.
export const NEIGHBORHOOD_FINISH = {
  walls: ["#F7B998", "#BDE6C2", "#FFEDCA", "#D5BBEB", "#FFE298"],
  accents: ["#FFF1D0", "#90BE99", "#FFF1D0", "#B995D3", "#8DCEAC"],
  cream: "#FFF3D9", stone: "#D8D1C4", metal: "#526061",
  glass: "#59C8F3", recess: "#426D78",
} as const;

/** Low-poly facade pieces, pooled by the world's existing art factory. */
export function facadeDetails(art: BuildingKit) {
  const c = NEIGHBORHOOD_FINISH;
  const box = art.buildingBox ?? art.box;
  const piece = (g: THREE.Group, w: number, h: number, d: number, color: string, x: number, y: number, z: number) => art.put(g, box(w, h, d, color), x, y, z);
  const pane = (g: THREE.Group, x: number, y: number, z: number, w: number, h: number, divisions = 2, darkFrame = false) => {
    const frame = darkFrame ? c.metal : c.cream;
    piece(g, w + .16, h + .16, .08, c.recess, x, y, z);
    piece(g, w, h, .025, c.glass, x, y, z + .055);
    piece(g, w * .16, h - .08, .009, "#86D3F0", x - w * .36, y, z + .072);
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
  return { piece, pane, rail, balcony, planter, awning, aircon };
}
