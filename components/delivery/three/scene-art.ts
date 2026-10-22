import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { DELIVERY_GAME_CONFIG, type DeliveryBrand, type SceneryItem } from "@/data/delivery-game";
import { BUILDING_SCALE } from "./scene-layout";
import { buildingProfile, type StreetLook } from "./street-layout";
import { ROAD_SURFACE } from "./road-surface";
import { decodeGlbPart, glbBuildingGeometry, glbBuildingSize } from "./glb-buildings";
import { ASSET_MODELS, type AssetName } from "./asset-models";

export const TOWN_COLORS = {
  sky: "#50bff0", haze: "#d9eceb", lawn: "#b8d998", road: ROAD_SURFACE.color,
  pavement: "#ecdfc9", curb: "#fff7e6", ink: "#365857", metal: "#3d635e",
  walls: ["#fae8bc", "#c8e7d4", "#d8c3e9", "#f2c9af", "#edf0cf"],
  roofs: ["#d88b6b", "#479e80", "#9b7abd", "#d8a16c", "#579f9a"],
};

// Geometry and matte materials are shared within a world; static facades are
// merged by material so architectural detail does not multiply draw calls.
export function createSceneArt() {
  const materials = new Map<string, THREE.MeshLambertMaterial>();
  const geometries = new Map<string, THREE.BufferGeometry>();
  const material = (color: string) => {
    if (!materials.has(color)) materials.set(color, new THREE.MeshLambertMaterial({ color }));
    return materials.get(color)!;
  };
  const geometry = (key: string, make: () => THREE.BufferGeometry) => {
    if (!geometries.has(key)) geometries.set(key, make());
    return geometries.get(key)!;
  };
  const box = (w: number, h: number, d: number, color: string, radius = 0) => new THREE.Mesh(
    geometry(`box:${w}:${h}:${d}:${radius}`, () => radius
      ? new RoundedBoxGeometry(w, h, d, 2, Math.min(radius, w / 3, h / 3, d / 3))
      : new THREE.BoxGeometry(w, h, d)), material(color),
  );
  // A small neutral fill only for architecture; road, courier, ads and global
  // lighting retain their original response. No added lights or shadow passes.
  // Bypass cinematic desaturation for the reference sheet's pastel plaster.
  // One shared material for every facade colour: colours live in vertex colours,
  // so a merged street block is one draw call instead of one per paint colour.
  // The emissive fill (42% of the paint) matches the previous per-colour materials.
  const buildingMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, toneMapped: false });
  buildingMaterial.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vColor.rgb * 0.42;");
  };
  buildingMaterial.customProgramCacheKey = () => "building-vertex-colour";
  // GLB street buildings: same lighting as above, but flat-shaded so the geometry needs no normals.
  const glbMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, toneMapped: false, flatShading: true, side: THREE.DoubleSide });
  glbMaterial.onBeforeCompile = buildingMaterial.onBeforeCompile;
  glbMaterial.customProgramCacheKey = () => "glb-building-vertex-colour";
  const paint = (geo: THREE.BufferGeometry, color: string, top = color) => {
    const position = geo.attributes.position, bottomColor = new THREE.Color(color), topColor = new THREE.Color(top);
    const colors = new Float32Array(position.count * 3);
    for (let i = 0; i < position.count; i++) (position.getY(i) > 0 ? topColor : bottomColor).toArray(colors, i * 3);
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    return geo;
  };
  // `top` tints the upper face/edges, e.g. sky-lit glass or a lit shop interior.
  // Paper-thin facade pieces (glass, curtains, slats) are only ever seen from the
  // front, so they become one quad on the front face instead of a 12-triangle box.
  const buildingBox = (w: number, h: number, d: number, color: string, top?: string) => new THREE.Mesh(
    geometry(`building-box:${w}:${h}:${d}:${color}:${top ?? ""}`, () => paint(
      d <= .03 ? new THREE.PlaneGeometry(w, h).translate(0, 0, d / 2) : new THREE.BoxGeometry(w, h, d), color, top)), buildingMaterial,
  );
  // Low-poly foliage for roofs and window boxes, in the same single batch.
  const buildingBlob = (radius: number, color: string) => new THREE.Mesh(
    geometry(`building-blob:${radius}:${color}`, () => paint(new THREE.IcosahedronGeometry(radius, radius > .45 ? 1 : 0), color)), buildingMaterial,
  );
  const sphere = (radius: number, color: string) => new THREE.Mesh(
    geometry(`sphere:${radius}`, () => new THREE.SphereGeometry(radius, 16, 12)), material(color),
  );
  const cylinder = (top: number, bottom: number, height: number, color: string) => new THREE.Mesh(
    geometry(`cylinder:${top}:${bottom}:${height}`, () => new THREE.CylinderGeometry(top, bottom, height, 12)), material(color),
  );
  const put = <T extends THREE.Object3D>(group: THREE.Group, mesh: T, x: number, y: number, z: number) => {
    mesh.position.set(x, y, z); group.add(mesh); return mesh;
  };
  const rod = (group: THREE.Group, a: number[], b: number[], radius: number, color: string) => {
    const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
    const mesh = cylinder(radius, radius, from.distanceTo(to), color);
    mesh.position.copy(from).add(to).multiplyScalar(.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.sub(from).normalize());
    group.add(mesh); return mesh;
  };

  const shadowCanvas = document.createElement("canvas");
  shadowCanvas.width = shadowCanvas.height = 64;
  const ctx = shadowCanvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(32, 32, 4, 32, 32, 31);
  gradient.addColorStop(0, "rgba(40,58,53,.48)");
  gradient.addColorStop(.5, "rgba(40,58,53,.22)");
  gradient.addColorStop(1, "rgba(40,58,53,0)");
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 64);
  const shadowMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, toneMapped: false });
  shadowMaterial.userData.mergeable = true; // flat, same height: safe to batch per street block
  const shadow = (group: THREE.Group, w: number, d: number, x = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry(`plane:${w}:${d}`, () => new THREE.PlaneGeometry(w, d)), shadowMaterial);
    mesh.rotation.x = -Math.PI / 2; put(group, mesh, x, .045, z);
    return mesh;
  };

  // Architecture-only baked sunlight. This does not alter the courier's shadow
  // or require shadow maps, extra lights, moving cameras or post-processing.
  const facadeShadowCanvas = document.createElement("canvas");
  facadeShadowCanvas.width = facadeShadowCanvas.height = 128;
  const facadeShadowContext = facadeShadowCanvas.getContext("2d")!;
  facadeShadowContext.filter = "blur(2px)";
  facadeShadowContext.fillStyle = "rgba(42,65,76,.17)";
  facadeShadowContext.beginPath();
  facadeShadowContext.moveTo(13, 15); facadeShadowContext.lineTo(92, 15);
  facadeShadowContext.lineTo(117, 111); facadeShadowContext.lineTo(29, 111);
  facadeShadowContext.closePath(); facadeShadowContext.fill();
  const facadeShadowMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(facadeShadowCanvas), transparent: true, depthWrite: false, toneMapped: false });
  const facadeShadow = (group: THREE.Group, w: number, d: number, h: number) => {
    const mesh = new THREE.Mesh(geometry("facade-shadow-plane", () => new THREE.PlaneGeometry(1, 1)), facadeShadowMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.scale.set(w + 2.5, d + Math.min(6, h * .7), 1);
    put(group, mesh, .8, .057, 1.6);
  };

  const merge = (group: THREE.Group) => {
    group.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, { geometries: THREE.BufferGeometry[]; meshes: THREE.Mesh[] }>();
    group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || child.material.transparent && !child.material.userData.mergeable) return;
      const batch = batches.get(child.material) ?? { geometries: [], meshes: [] };
      const copy = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
      batch.geometries.push(copy.applyMatrix4(child.matrixWorld)); batch.meshes.push(child);
      batches.set(child.material, batch);
    });
    for (const [mat, { geometries, meshes }] of batches) {
      // Incompatible attribute sets cannot merge; keep those meshes as they were.
      const combined = mergeGeometries(geometries, false);
      if (combined) {
        for (const mesh of meshes) mesh.removeFromParent();
        group.add(new THREE.Mesh(combined, mat));
      }
      for (const source of geometries) source.dispose();
    }
    return group;
  };
  // Like merge, but skips animated sub-groups so they keep moving on their own.
  const mergeStatic = (group: THREE.Group, animated: THREE.Object3D[] = []) => {
    group.updateMatrixWorld(true);
    const toLocal = group.matrixWorld.clone().invert();
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    const sources: THREE.Mesh[] = [];
    const visit = (node: THREE.Object3D) => {
      for (const child of node.children) {
        if (animated.includes(child)) continue;
        if (child instanceof THREE.Mesh && !Array.isArray(child.material) && !child.material.transparent) {
          const copy = child.geometry.index ? child.geometry.toNonIndexed() : child.geometry.clone();
          const list = batches.get(child.material) ?? [];
          list.push(copy.applyMatrix4(toLocal.clone().multiply(child.matrixWorld)));
          batches.set(child.material, list); sources.push(child);
        }
        visit(child);
      }
    };
    visit(group);
    for (const child of sources) child.removeFromParent();
    for (const [mat, list] of batches) {
      const combined = mergeGeometries(list, false);
      if (combined) group.add(new THREE.Mesh(combined, mat));
      for (const source of list) source.dispose();
    }
  };

  function windowOn(group: THREE.Group, x: number, y: number, z: number, width = .85, height = 1.15) {
    // Layered reveals and a contained reflection give matte glass depth without
    // transparency, reflections or per-frame effects. The opening is unchanged.
    put(group, box(width + .23, height + .23, .13, "#c8c8b6"), x, y - .035, z);
    put(group, box(width + .18, height + .18, .15, "#fff7e6"), x, y, z + .035);
    put(group, box(width, height, .045, "#287d8d"), x, y, z + .12);
    put(group, box(width - .06, height - .07, .02, "#3da9ba"), x, y - .015, z + .15);
    const reflection = geometry(`glass-reflection:${width}:${height}`, () => {
      const shape = new THREE.Shape();
      shape.moveTo(-width * .44, height * .44);
      shape.lineTo(width * .4, height * .44);
      shape.lineTo(-width * .44, -height * .3);
      shape.closePath();
      // Match the UV/normal attributes of the other facade geometry for batching.
      return new THREE.ShapeGeometry(shape);
    });
    put(group, new THREE.Mesh(reflection, material("#83d0d7")), x, y, z + .166);
    put(group, box(.055, height, .055, "#fff7e6"), x, y, z + .19);
    put(group, box(width + .3, .11, .3, "#fff7e6"), x, y - height / 2 - .1, z + .09);
    put(group, box(width + .24, .07, .17, "#c8c8b6"), x, y - height / 2 - .19, z + .025);
  }

  // One merged-friendly mesh of a GLB building: uniform scale to `height`, frontage stretched in x.
  function glbBuilding(variant: number, height: number, stretch: number, mirror: boolean) {
    const { scale } = glbBuildingSize(variant, height, 1), mesh = new THREE.Mesh(glbBuildingGeometry(variant, mirror), glbMaterial);
    mesh.scale.set(scale * stretch, scale, scale);
    return new THREE.Group().add(mesh);
  }

  // A converted v5 asset at its real size: one mesh per named part on its pivot, anchors in userData.
  function glbAsset(name: AssetName) {
    const model = ASSET_MODELS[name], group = new THREE.Group();
    for (const part of model.parts) {
      const mesh = new THREE.Mesh(geometry(`asset:${name}:${part.name}`, () => decodeGlbPart(part)), glbMaterial);
      mesh.name = part.name; mesh.position.fromArray(part.t); group.add(mesh);
    }
    group.userData.anchors = model.anchors;
    return group;
  }

  const buildingTemplates = new Map<string, THREE.Group>();
  function building(item: SceneryItem, street = false) {
    const key = `${item.type}:${item.variant % 5}:${street}`;
    const place = (model: THREE.Group) => {
      const side = item.side === "left" ? -1 : 1;
      model.position.x = side * (DELIVERY_GAME_CONFIG.roadWidth / 2 + 7.5 + item.variant % 2 * .8);
      model.rotation.y = -side * Math.PI / 2;
      model.userData.routeDistance = item.distance;
      return model;
    };
    if (street) {
      const look = item as SceneryItem & Partial<StreetLook>;
      return place(glbBuilding(look.model ?? item.variant, look.tall ?? 10, look.stretch ?? 1, look.mirror ?? false));
    }
    const template = buildingTemplates.get(key);
    if (template) return place(template.clone());
    const group = new THREE.Group();
    const v = item.variant % 5, shop = item.type === "shop";
    const { width: w, height: h, depth: d, floors } = buildingProfile(item, street);
    group.userData.roofMarkerLocal = [w * .3, h + (!shop && v % 2 === 0 ? 2.02 : 1.14), 0];
    // Keep every door/window opening at its original size. Add storeys instead.
    const floorPitch = street ? (h - .3) / floors : 2;
    const wall = TOWN_COLORS.walls[v], trim = TOWN_COLORS.roofs[v];
    facadeShadow(group, w, d, h);
    shadow(group, w + 1.5, d + 1.5);
    put(group, box(w + .45, .22, d + .5, TOWN_COLORS.pavement, .05), 0, .11, 0);
    put(group, box(w, h, d, wall, .065), 0, h / 2 + .2, 0);
    put(group, box(w + .12, .35, d + .12, "#d7ccb7"), 0, .4, 0);
    put(group, box(w + .16, .12, d + .16, "#fff7e6"), 0, .64, 0);
    put(group, box(w + .14, .14, d + .14, "#c8c8b6"), 0, h + .04, 0);
    put(group, box(w + .38, .2, d + .36, "#fcf7e9", .03), 0, h + .23, 0);
    // Slim cream corner pilasters and floor bands, inside the existing envelope.
    for (const x of [-w / 2 + .12, w / 2 - .12]) {
      for (const z of [-d / 2 + .1, d / 2 - .1]) put(group, box(.25, h - .65, .24, "#fff7e6"), x, (h + .65) / 2, z);
    }
    if (!shop || street) {
      const bands = street && shop ? [3.3, (4.7 + h - 1.1) / 2] : Array.from({ length: Math.max(0, Math.ceil((h - .65 - (street ? floorPitch + .3 : 2.85)) / floorPitch)) }, (_, n) => (street ? floorPitch + .3 : 2.85) + n * floorPitch);
      for (const y of bands) {
        put(group, box(w + .14, .09, d + .14, "#c8c8b6"), 0, y - .07, 0);
        put(group, box(w + .22, .13, d + .22, "#fff7e6"), 0, y + .025, 0);
      }
    }
    if (!shop && v % 2 === 0) {
      const roof = new THREE.Mesh(geometry(`roof:${w}:${d}:${street}`, () => {
        const roofGeometry = new THREE.ConeGeometry(w * .76, 1.6, 4);
        return street ? roofGeometry.rotateY(Math.PI / 4) : roofGeometry;
      }), material(trim));
      // Rotate before depth scaling so a wider roof does not grow onto the walk.
      roof.rotation.y = street ? 0 : Math.PI / 4; roof.scale.z = d / w;
      put(group, roof, 0, h + 1.02, 0);
      put(group, box(.58, 1.0, .6, wall), -w * .28, h + 1.3, -.5);
    } else {
      put(group, box(w + .18, .3, d + .18, trim, .04), 0, h + .42, 0);
      put(group, box(1.55, .48, 1.3, "#f7f0df", .08), -w * .24, h + .7, -.65);
    }
    const facade = new THREE.Group();
    if (shop) {
      windowOn(facade, -1.3, 1.65, d / 2 + .025, 1.75, 1.9);
      windowOn(facade, 1.25, 1.55, d / 2 + .025, 1.1, 2.1);
      put(facade, box(5.0, .64, .15, "#fff7e6", .035), 0, 3.65, d / 2 + .09);
      put(facade, box(4.82, .44, .045, trim, .025), 0, 3.65, d / 2 + .19);
      for (let n = 0; n < 8; n += 1) {
        const stripe = box(.67, .15, 1.15, n % 2 ? "#fff7e8" : trim);
        stripe.rotation.x = -.14;
        put(facade, stripe, (n - 3.5) * .67, 2.92, d / 2 + .42);
        put(facade, box(.67, .25, .13, n % 2 ? "#fff7e8" : trim), (n - 3.5) * .67, 2.72, d / 2 + .96);
      }
      if (street) for (let row = 1; row < floors; row++) {
        // Shop ground floor retains the sign and canopy; upper floors are homes.
        for (const x of [-w * .3, 0, w * .3]) windowOn(facade, x, 4.7 + (row - 1) * (h - 5.8), d / 2 + .03);
      }
    } else {
      // Semantic anchor at the actual door surface, retained by template clones.
      // Navigation reads this after the house's scale/rotation/world placement.
      group.userData.entranceLocal = [0, 1.3, d / 2 + .17];
      put(facade, box(1.15, 2.2, .16, trim, .06), 0, 1.3, d / 2 + .07);
      put(facade, box(.71, 1.07, .025, "#3da9ba"), 0, 1.64, d / 2 + .17);
      put(facade, sphere(.065, "#efd499"), .34, 1.14, d / 2 + .22);
      for (let row = 0; row < floors; row += 1) {
        for (const x of [-w * .29, w * .29]) windowOn(facade, x, 1.7 + row * floorPitch, d / 2 + .03);
        if (street && row > 0) windowOn(facade, 0, 1.7 + row * floorPitch, d / 2 + .03);
      }
      put(facade, box(1.95, .17, .85, trim, .025), 0, 2.65, d / 2 + .35);
      put(facade, box(1.98, .08, .88, "#fff7e6", .02), 0, 2.54, d / 2 + .35);
    }
    group.add(facade);
    // A second finished facade is visible along the direction of travel.
    for (const side of [-1, 1]) {
      const sideFace = new THREE.Group();
      for (let row = 0; row < (street ? floors : shop ? 1 : Math.floor((h - .8) / 2)); row += 1) {
        for (const x of [-1.1, 1.1]) windowOn(sideFace, x, 1.7 + row * floorPitch, 0, .8, 1.12);
      }
      if (!shop && v % 2 === 1) {
        // One shallow balcony per side, not a dense repeated railing grid.
        put(sideFace, box(2.95, .12, .5, "#fff7e6"), 0, 3.03, .16);
        put(sideFace, box(2.85, .055, .055, TOWN_COLORS.metal), 0, 3.49, .39);
        for (const x of [-1.38, -.69, 0, .69, 1.38]) put(sideFace, box(.045, .45, .045, TOWN_COLORS.metal), x, 3.26, .39);
      }
      sideFace.rotation.y = side * Math.PI / 2;
      sideFace.position.x = side * (w / 2 + .02); group.add(sideFace);
    }
    for (const x of [-w * .41, w * .41]) {
      put(group, box(.8, .42, .7, "#dac8a6", .065), x, .42, d / 2 + .5);
      put(group, box(.86, .09, .76, "#fff1d4", .03), x, .65, d / 2 + .5);
      const bush = sphere(.49, v % 2 ? "#64ac69" : "#8bbc60"); bush.scale.set(1, .85, .8);
      put(group, bush, x, .94, d / 2 + .5);
    }
    merge(group);
    group.scale.set(BUILDING_SCALE.width, BUILDING_SCALE.height, BUILDING_SCALE.depth);
    buildingTemplates.set(key, group);
    return place(group.clone());
  }

  function tree(item: SceneryItem) {
    const group = new THREE.Group(), v = item.variant % 3;
    const greens = ["#77b755", "#4fa875", "#94be5b"];
    shadow(group, 4.2, 3.8, .35, -.1);
    put(group, cylinder(.74, .84, .19, "#e4dbc4"), 0, .15, 0);
    put(group, cylinder(.13, .21, 2.05, "#a18968"), 0, 1.1, 0);
    rod(group, [0, 1.5, 0], [.6, 2.4, .1], .095, "#a18968");
    for (const [x, y, z, scale] of [[0, 2.8, 0, 1.18], [-.6, 2.45, .08, .83], [.6, 2.62, -.05, .92]]) {
      const crown = sphere(1, greens[v]); crown.scale.set(scale, scale * 1.12, scale * .88);
      put(group, crown, x, y + v * .15, z);
    }
    merge(group); group.position.x = (item.side === "left" ? -1 : 1) * (DELIVERY_GAME_CONFIG.roadWidth / 2 + 4.95);
    group.userData.routeDistance = item.distance; return group;
  }

  function lamp(item: SceneryItem) {
    const group = new THREE.Group(), side = item.side === "left" ? -1 : 1;
    shadow(group, 1.4, 1.6);
    put(group, cylinder(.16, .24, .35, TOWN_COLORS.metal), 0, .25, 0);
    put(group, cylinder(.055, .085, 4.8, TOWN_COLORS.metal), 0, 2.55, 0);
    rod(group, [0, 4.85, 0], [-side * .9, 4.85, 0], .055, TOWN_COLORS.metal);
    put(group, box(.72, .13, .4, TOWN_COLORS.metal, .06), -side * .86, 4.84, 0);
    put(group, box(.55, .04, .3, "#fff3d1", .025), -side * .86, 4.75, 0);
    merge(group); group.position.x = side * (DELIVERY_GAME_CONFIG.roadWidth / 2 + 3.9);
    group.userData.routeDistance = item.distance; return group;
  }

  function shelter(item: SceneryItem) {
    const group = new THREE.Group();
    shadow(group, 6, 3.5);
    put(group, box(4.6, .18, 2.1, TOWN_COLORS.curb, .04), 0, .13, 0);
    put(group, box(4.5, .24, 1.85, TOWN_COLORS.metal, .08), 0, 3.05, 0);
    put(group, box(4.12, 2.1, .07, "#a7c8c2"), 0, 1.77, -.7);
    for (const x of [-2, 0, 2]) put(group, box(.08, 2.8, .08, TOWN_COLORS.metal), x, 1.55, -.68);
    put(group, box(3, .16, .5, "#c09a76", .03), 0, .77, -.12);
    for (const x of [-1.1, 1.1]) put(group, box(.12, .6, .45, TOWN_COLORS.metal), x, .42, -.12);
    merge(group); group.position.x = (item.side === "left" ? -1 : 1) * (DELIVERY_GAME_CONFIG.roadWidth / 2 + 5.5);
    group.userData.routeDistance = item.distance; return group;
  }

  function bicycle(brand: DeliveryBrand, label: THREE.Texture, productMaterial: THREE.Material) {
    const group = new THREE.Group(), wheels: THREE.Group[] = [];
    const steel = TOWN_COLORS.ink, frame = "#e59779", cream = "#fff4db";
    shadow(group, 2.4, 3.5, .25, .15);
    const groundShadow = group.children[group.children.length - 1];
    for (const z of [-1.0, 1.0]) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(geometry("bike-tire", () => new THREE.TorusGeometry(.49, .068, 10, 32)), material("#384e4b"));
      tire.rotation.y = Math.PI / 2; wheel.add(tire);
      const rim = new THREE.Mesh(geometry("bike-rim", () => new THREE.TorusGeometry(.405, .022, 8, 28)), material("#d2d9c8"));
      rim.rotation.y = Math.PI / 2; wheel.add(rim);
      for (let n = 0; n < 8; n++) {
        const angle = n * Math.PI / 4;
        rod(wheel, [0, 0, 0], [0, Math.cos(angle) * .4, Math.sin(angle) * .4], .009, "#c1cfc4");
      }
      const hub = cylinder(.07, .07, .23, steel); hub.rotation.z = Math.PI / 2; wheel.add(hub);
      put(group, wheel, 0, .56, z); wheels.push(wheel);
      const fender = new THREE.Mesh(geometry("bike-fender", () => new THREE.TorusGeometry(.59, .035, 6, 20, Math.PI)), material(cream));
      fender.rotation.set(0, Math.PI / 2, 0); put(group, fender, 0, .56, z);
    }
    for (const [a, b] of [
      [[0, .56, 1], [0, .76, 0]], [[0, .56, 1], [0, 1.35, .4]],
      [[0, 1.35, .4], [0, .76, 0]], [[0, 1.35, .4], [0, 1.4, -.75]],
      [[0, .76, 0], [0, 1.4, -.75]], [[0, .56, -1], [0, 1.52, -.75]],
    ]) rod(group, a, b, .06, frame);
    for (const side of [-1, 1]) {
      rod(group, [side * .17, .6, 1], [side * .38, 1.1, .85], .028, steel);
      rod(group, [side * .35, 1.15, .85], [side * .35, 1.15, 1.6], .025, steel);
    }
    put(group, box(.53, .14, .39, "#775d50", .06), 0, 1.45, .4);
    rod(group, [-.58, 1.64, -.84], [.58, 1.64, -.84], .035, steel);
    for (const x of [-.52, .52]) put(group, box(.23, .09, .12, "#bd9271", .03), x, 1.64, -.84);
    const headlight = sphere(.13, cream); headlight.scale.z = .5; put(group, headlight, 0, 1.5, -1.31);
    const pedal = new THREE.Group();
    const crank = cylinder(.16, .16, .11, steel); crank.rotation.z = Math.PI / 2; pedal.add(crank);
    for (const side of [-1, 1]) {
      rod(pedal, [0, 0, 0], [side * .14, side * .25, 0], .026, steel);
      put(pedal, box(.28, .055, .13, cream, .015), side * .19, side * .25, 0);
    }
    put(group, pedal, 0, .79, .03);
    // Open basket with rails, instead of a wireframe box.
    put(group, box(1.0, .07, .71, "#ba9974", .035), 0, 1.32, -1.1);
    for (const y of [1.43, 1.64, 1.83]) {
      for (const z of [-1.47, -.75]) put(group, box(1.05, .045, .04, "#bfa27a", .018), 0, y, z);
      for (const x of [-.5, .5]) put(group, box(.04, .045, .72, "#bfa27a", .018), x, y, -1.1);
    }
    for (const x of [-.48, -.24, 0, .24, .48]) {
      for (const z of [-1.46, -.76]) put(group, box(.027, .5, .03, "#c4ad89"), x, 1.57, z);
    }
    for (const x of [-.23, .23]) {
      const carton = new THREE.Group();
      put(carton, box(.37, .63, .32, brand.secondaryColor, .025), 0, .32, 0);
      const cap = new THREE.Mesh(geometry("carton-top", () => new THREE.CylinderGeometry(.12, .25, .22, 4)), material(brand.primaryColor));
      cap.rotation.y = Math.PI / 4; put(carton, cap, 0, .73, 0);
      const labelMesh = new THREE.Mesh(geometry("carton-label", () => new THREE.PlaneGeometry(.32, .53)), productMaterial);
      put(carton, labelMesh, 0, .35, .168);
      put(group, carton, x, 1.37, -1.11);
    }
    put(group, box(1.44, .94, .9, brand.secondaryColor, .075), 0, 1.5, 1.02);
    put(group, box(1.49, .16, .96, brand.primaryColor, .055), 0, 2.0, 1.02);
    for (const x of [-.6, .6]) put(group, box(.075, .91, .025, "#c8a88a", .012), x, 1.48, 1.49);
    const backLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.23, .72), new THREE.MeshBasicMaterial({ map: label, toneMapped: false }));
    put(group, backLabel, 0, 1.49, 1.481);
    put(group, box(.21, .08, .05, "#db806c", .024), 0, .91, 1.51);

    // This original placeholder courier can be replaced independently of the bike.
    const rider = new THREE.Group(); rider.name = "replaceable-delivery-rider";
    const torso = new THREE.Mesh(geometry("courier-body", () => new THREE.CapsuleGeometry(.37, .53, 6, 16)), material("#5d9483"));
    torso.rotation.x = -.17; put(rider, torso, 0, 2.0, .06);
    const collar = cylinder(.27, .31, .15, cream); put(rider, collar, 0, 2.37, -.02);
    const head = sphere(.39, "#f2c6a3"); head.scale.set(1, 1.05, 1); put(rider, head, 0, 2.73, -.15);
    const hair = sphere(.397, "#665247"); hair.scale.set(1, .65, .82); put(rider, hair, 0, 2.82, -.04);
    const helmet = new THREE.Mesh(geometry("courier-helmet", () => new THREE.SphereGeometry(.47, 24, 14, 0, Math.PI * 2, 0, Math.PI * .59)), material("#a9c6a6"));
    helmet.scale.z = 1.1; put(rider, helmet, 0, 2.87, -.18);
    const helmetRim = new THREE.Mesh(geometry("helmet-rim", () => new THREE.TorusGeometry(.445, .03, 8, 28)), material("#64826b"));
    helmetRim.rotation.x = Math.PI / 2; helmetRim.scale.y = 1.1; put(rider, helmetRim, 0, 2.76, -.18);
    for (const x of [-.19, .19]) {
      const vent = box(.055, .04, .38, "#6b8e73", .02); vent.rotation.x = -.18; put(rider, vent, x, 3.295, -.15);
    }
    const helmetStripe = new THREE.Mesh(geometry("helmet-stripe", () => new THREE.TorusGeometry(.475, .032, 6, 24, Math.PI)), material(cream));
    helmetStripe.rotation.y = Math.PI / 2; helmetStripe.scale.x = 1.1; put(rider, helmetStripe, 0, 2.87, -.18);
    put(rider, box(.52, .045, .3, "#a9c6a6", .035), 0, 2.83, -.63);
    put(rider, box(.24, .075, .025, cream, .025), 0, 2.92, .33);
    put(rider, box(.37, .085, .035, "#eae4b8", .025), 0, 2.18, .427);
    for (const side of [-1, 1]) {
      put(rider, sphere(.09, "#edb792"), side * .39, 2.69, -.13);
      rod(rider, [side * .29, 2.18, -.08], [side * .46, 1.81, -.53], .12, "#5d9483");
      rod(rider, [side * .46, 1.81, -.53], [side * .5, 1.65, -.84], .085, "#f2c6a3");
      put(rider, sphere(.1, "#f2c6a3"), side * .5, 1.65, -.84);
    }
    const makeLeg = (side: number) => {
      const leg = new THREE.Group();
      rod(leg, [0, 0, 0], [0, -.46, -.3], .14, "#526f71");
      rod(leg, [0, -.46, -.3], [0, -.87, -.05], .095, "#edbe9d");
      put(leg, cylinder(.1, .1, .22, cream), 0, -.83, -.06);
      put(leg, box(.25, .17, .42, cream, .06), 0, -.97, -.17);
      put(rider, leg, side * .2, 1.54, .2); return leg;
    };
    const leftLeg = makeLeg(-1), rightLeg = makeLeg(1);
    group.add(rider);
    // ~110 separate parts cost one draw call each; batch the static ones.
    for (const part of [...wheels, pedal, leftLeg, rightLeg]) mergeStatic(part);
    mergeStatic(group, [...wheels, pedal, leftLeg, rightLeg]);
    group.scale.setScalar(.9);
    return { group, wheels, pedal, leftLeg, rightLeg, groundShadow };
  }

  function horizon() {
    const group = new THREE.Group();
    // Shared, opaque puffs receive soft daylight; no translucent overlapping discs.
    const cloudMaterial = new THREE.MeshLambertMaterial({ color: "#ffffff", emissive: "#d7edf8", emissiveIntensity: .7, fog: false });
    for (let n = 0; n < 12; n++) {
      const angle = n * Math.PI / 6;
      const hill = sphere(1, n % 2 ? "#b1d4b2" : "#cee2bd");
      hill.scale.set(44 + n % 3 * 14, 8 + n % 4 * 2, 37);
      put(group, hill, Math.sin(angle) * 175, -5, Math.cos(angle) * 175);
    }
    for (let n = 0; n < 7; n++) {
      const angle = n * Math.PI * 2 / 7;
      for (const [x, y, scale] of [[-8, 0, 4.4], [-3, 2, 6], [3, 4, 6.7], [9, 1, 4.7], [14, -.3, 3.2]]) {
        const cloud = new THREE.Mesh(geometry("cloud-sphere", () => new THREE.SphereGeometry(1, 20, 14)), cloudMaterial); cloud.scale.set(scale * 1.2, scale * .88, scale);
        put(group, cloud, Math.sin(angle) * 125 + x, 28 + n % 3 * 7 + y, Math.cos(angle) * 125);
      }
    }
    return merge(group);
  }

  return { box, buildingBox, buildingBlob, sphere, cylinder, put, rod, material, shadow, merge, windowOn, building, glbBuilding, glbAsset, tree, lamp, shelter, bicycle, horizon };
}

export type SceneArt = ReturnType<typeof createSceneArt>;
