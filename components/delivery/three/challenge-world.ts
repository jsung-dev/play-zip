import * as THREE from "three";
import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { CHUNK_METERS } from "@/data/challenge-route";
import { getRouteFrame } from "@/data/delivery-map";
import { createRestrictedSurfaceMaterial } from "./road-surface";
import { GAP_LENGTH } from "../delivery-pickups";
import { challengeChunk } from "../delivery-challenge-course";
import { createOutdoorAdvertisement } from "./outdoor-ad-model";
import { addRoadEdges, createGap, createLaneDashes, createMover, createObstacle, createRamp, createRoadRibbon, placeOnRoute, type DeliveryWorld } from "./scene-builders";
import { TOWN_COLORS } from "./scene-art";
import { STREET_BUILDINGS, adFootprint, buildingProfile, makeBuilding, pointPolygonDistance, polygonsOverlap, streetTransform, type StreetBuilding } from "./street-layout";

// Challenge mode's world: road, street, ads and obstacles built 100 m chunk by chunk ahead of the rider, disposed behind.
export const CHALLENGE_VIEW = { behind: 40, ahead: 220 } as const;

const point2 = (v: THREE.Vector3) => new THREE.Vector2(v.x, v.z);

export function createChallengeStreet(world: DeliveryWorld) {
  const { root, art, road, outdoorResources } = world;
  const restricted = createRestrictedSurfaceMaterial(road);
  const chunks = new Map<number, THREE.Group>();
  // Movers sit on the root (the scene positions them every frame), so they are tracked per chunk.
  const chunkMovers = new Map<number, DeliveryWorld["movers"]>();
  // Lots run across chunk borders, so each side remembers its last building.
  const sides = { left: { index: 0, previous: undefined as StreetBuilding | undefined }, right: { index: 0, previous: undefined as StreetBuilding | undefined } };
  let built = -1;

  const fits = (item: StreetBuilding) => {
    for (let d = item.distance - 18; d <= item.distance + 18; d += .5) {
      if (pointPolygonDistance(point2(getRouteFrame(d).position), item.footprint) < STREET_BUILDINGS.sidewalkOuterEdge + .15) return false;
    }
    return true;
  };

  function build(i: number) {
    const start = i * CHUNK_METERS, end = start + CHUNK_METERS;
    const chunk = new THREE.Group();
    chunk.name = `challenge-chunk-${i}`;
    // Overlap 0.5 m so ribbons meet without a seam; the first chunk also paves behind the start.
    // The lawn strip stays narrower than the tightest bend (radius 120 m) so it never folds over itself.
    const from = i === 0 ? -45 : start;
    chunk.add(createRoadRibbon(220, art.material(TOWN_COLORS.lawn), "main", -.14, from, end + .5));
    chunk.add(createRoadRibbon(DELIVERY_GAME_CONFIG.roadWidth, road, "main", 0, from, end + .5));
    addRoadEdges(chunk, art, restricted, from, end + .5);
    chunk.add(createLaneDashes(art, Math.max(-32, from), end));

    const course = challengeChunk(i);
    // This chunk's ad and the next one's (its lot may reach back here) keep buildings clear.
    const ads = [...course.ads, ...challengeChunk(i + 1).ads].map(ad => ({ ad, footprint: adFootprint(ad) }));
    const street = new THREE.Group();
    for (const side of ["left", "right"] as const) {
      const state = sides[side];
      for (let distance = Math.max(2, start); distance < end; distance += .25) {
        const base = makeBuilding(distance, side, state.index, 0, true);
        if (state.previous) {
          const tangent = point2(getRouteFrame(distance).tangent);
          const gap = Math.min(...base.footprint.map(p => p.dot(tangent))) - Math.max(...state.previous.footprint.map(p => p.dot(tangent)));
          if (gap < (buildingProfile(state.previous, true).halfWidth + buildingProfile(base, true).halfWidth) * STREET_BUILDINGS.gapRatio) continue;
        }
        // Inside a bend a lot steps back until it clears the road.
        const accepted = [0, 1.5, 3, 5, 7, 9, 12].map(extra => extra === 0 ? base : makeBuilding(distance, side, state.index, extra, true))
          .find(item => (!state.previous || !polygonsOverlap(item.footprint, state.previous.footprint, .35))
            && !ads.some(a => Math.abs(a.ad.distance - distance) < 35 && polygonsOverlap(item.footprint, a.footprint, .6)) && fits(item));
        if (!accepted) continue;
        const model = art.building(accepted, true), transform = streetTransform(accepted);
        model.position.copy(transform.position); model.rotation.y = transform.yaw;
        street.add(model);
        state.previous = accepted; state.index++;
      }
    }
    art.merge(street);
    chunk.add(street);

    const hazards: THREE.Object3D[] = [];
    for (const ad of course.ads) chunk.add(createOutdoorAdvertisement(ad, art, outdoorResources));
    for (const placement of course.obstacles) {
      const obstacle = createObstacle(placement, art);
      placeOnRoute(obstacle.group, placement.distance);
      world.obstacles.push(obstacle); hazards.push(obstacle.group);
    }
    for (const ramp of course.ramps) {
      hazards.push(createRamp(ramp, art));
      hazards.push(...createGap({ start: ramp.distance + 1, end: ramp.distance + 1 + GAP_LENGTH }, art));
    }
    for (const object of hazards) { chunk.add(object); world.worldObjects.push(object); }
    chunk.userData.hazards = hazards;
    const movers = course.movers.map(placement => createMover(placement, art, outdoorResources));
    for (const mover of movers) { mover.group.visible = false; root.add(mover.group); world.movers.push(mover); }
    chunkMovers.set(i, movers);
    root.add(chunk);
    chunks.set(i, chunk);
  }

  // Geometry is freed with its chunk (a cached template one just re-uploads if used again); shared materials stay.
  const freeGeometry = (object: THREE.Object3D) => object.traverse(child => { if (child instanceof THREE.Mesh) child.geometry.dispose(); });
  const dispose = (i: number, chunk: THREE.Group) => {
    chunk.removeFromParent();
    freeGeometry(chunk);
    const hazards = new Set<THREE.Object3D>(chunk.userData.hazards);
    world.worldObjects.splice(0, Infinity, ...world.worldObjects.filter(o => !hazards.has(o)));
    world.obstacles.splice(0, Infinity, ...world.obstacles.filter(o => !hazards.has(o.group)));
    const movers = new Set(chunkMovers.get(i));
    for (const mover of movers) { mover.group.removeFromParent(); freeGeometry(mover.group); }
    world.movers.splice(0, Infinity, ...world.movers.filter(m => !movers.has(m)));
    chunkMovers.delete(i);
  };

  return {
    chunks,
    update(position: number) {
      const last = Math.floor((position + CHALLENGE_VIEW.ahead) / CHUNK_METERS);
      while (built < last) build(++built);
      const first = Math.floor((position - CHALLENGE_VIEW.behind) / CHUNK_METERS);
      for (const [i, chunk] of chunks) if (i < first) { dispose(i, chunk); chunks.delete(i); }
    },
    /** Floating-origin shift: the caller moves the chunks (root children); this moves the remembered lots. */
    shift(delta: THREE.Vector3) {
      for (const state of Object.values(sides)) state.previous?.footprint.forEach(p => p.set(p.x - delta.x, p.y - delta.z));
    },
    dispose() { for (const [i, chunk] of chunks) dispose(i, chunk); chunks.clear(); },
  };
}
