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
  // fadeable: an own transparent copy of the material, so a hit can fade just this object.
  function glbAsset(name: AssetName, fadeable = false) {
    const model = ASSET_MODELS[name], group = new THREE.Group();
    const material = fadeable ? Object.assign(glbMaterial.clone(), { transparent: true, onBeforeCompile: glbMaterial.onBeforeCompile, customProgramCacheKey: glbMaterial.customProgramCacheKey }) : glbMaterial;
    for (const part of model.parts) {
      const mesh = new THREE.Mesh(geometry(`asset:${name}:${part.name}`, () => decodeGlbPart(part)), material);
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
    const group = glbAsset((["prop_tree_01", "prop_tree_02", "prop_tree_03"] as const)[item.variant % 3]);
    shadow(group, 4.2, 3.8, .35, -.1);
    merge(group); group.position.x = (item.side === "left" ? -1 : 1) * (DELIVERY_GAME_CONFIG.roadWidth / 2 + 4.95);
    group.userData.routeDistance = item.distance; return group;
  }

  function lamp(item: SceneryItem) {
    const group = new THREE.Group(), side = item.side === "left" ? -1 : 1;
    // The GLB lamp head points +X: toward the road for left-side lamps, so right-side ones turn round.
    const head = glbAsset("prop_street_lamp"); head.rotation.y = side > 0 ? Math.PI : 0; group.add(head);
    shadow(group, 1.4, 1.6);
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
    // v5 GLB rider + bike at final size (front = -Z); wheels, crank and legs turn on their GLB pivots.
    const group = glbAsset("rider_bike"), part = (name: string) => group.getObjectByName(name)!;
    shadow(group, 2.16, 3.15, .22, .14);
    const groundShadow = group.children[group.children.length - 1];
    // Brand area stays brand-coloured: the GLB box, label and basket cartons are swapped for the
    // original brand-coloured box/label/cartons (authored at 1/0.9 scale, so drawn in a 0.9 group).
    for (const name of ["delivery_box", "brand_label", "basket_items"]) part(name).visible = false;
    const brandParts = new THREE.Group(); brandParts.scale.setScalar(.9); group.add(brandParts);
    for (const x of [-.23, .23]) {
      const carton = new THREE.Group();
      put(carton, box(.37, .63, .32, brand.secondaryColor, .025), 0, .32, 0);
      const cap = new THREE.Mesh(geometry("carton-top", () => new THREE.CylinderGeometry(.12, .25, .22, 4)), material(brand.primaryColor));
      cap.rotation.y = Math.PI / 4; put(carton, cap, 0, .73, 0);
      const labelMesh = new THREE.Mesh(geometry("carton-label", () => new THREE.PlaneGeometry(.32, .53)), productMaterial);
      put(carton, labelMesh, 0, .35, .168);
      put(brandParts, carton, x, 1.37, -1.11);
    }
    put(brandParts, box(1.44, .94, .9, brand.secondaryColor, .075), 0, 1.5, 1.02);
    put(brandParts, box(1.49, .16, .96, brand.primaryColor, .055), 0, 2.0, 1.02);
    for (const x of [-.6, .6]) put(brandParts, box(.075, .91, .025, "#c8a88a", .012), x, 1.48, 1.49);
    const backLabel = new THREE.Mesh(new THREE.PlaneGeometry(1.23, .72), new THREE.MeshBasicMaterial({ map: label, toneMapped: false }));
    put(brandParts, backLabel, 0, 1.49, 1.481);
    mergeStatic(brandParts);
    return { group, wheels: [part("wheel_front"), part("wheel_rear")], pedal: part("crank"), leftLeg: part("leg_left"), rightLeg: part("leg_right"), groundShadow };
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
