import * as THREE from "three";
import { DELIVERY_GAME_CONFIG } from "@/data/delivery-game";
import { CHUNK_METERS } from "@/data/challenge-route";
import { getRouteFrame } from "@/data/delivery-map";
import { createRestrictedSurfaceMaterial } from "./road-surface";
import { addRoadEdges, createLaneDashes, createRoadRibbon } from "./scene-builders";
import { TOWN_COLORS, type SceneArt } from "./scene-art";
import { STREET_BUILDINGS, buildingProfile, makeBuilding, pointPolygonDistance, polygonsOverlap, streetTransform, type StreetBuilding } from "./street-layout";

// Challenge mode's world: road and street built 100 m chunk by chunk ahead of the rider, disposed behind.
export const CHALLENGE_VIEW = { behind: 40, ahead: 220 } as const;

const point2 = (v: THREE.Vector3) => new THREE.Vector2(v.x, v.z);

export function createChallengeStreet(root: THREE.Group, art: SceneArt, road: THREE.Material) {
  const restricted = createRestrictedSurfaceMaterial(road);
  const chunks = new Map<number, THREE.Group>();
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
          .find(item => (!state.previous || !polygonsOverlap(item.footprint, state.previous.footprint, .35)) && fits(item));
        if (!accepted) continue;
        const model = art.building(accepted, true), transform = streetTransform(accepted);
        model.position.copy(transform.position); model.rotation.y = transform.yaw;
        street.add(model);
        state.previous = accepted; state.index++;
      }
    }
    art.merge(street);
    chunk.add(street);
    root.add(chunk);
    chunks.set(i, chunk);
  }

  // Merged and ribbon geometry belongs to its chunk alone; shared materials stay.
  const dispose = (chunk: THREE.Group) => {
    chunk.removeFromParent();
    for (const holder of [chunk, ...chunk.children]) for (const child of holder.children) if (child instanceof THREE.Mesh) child.geometry.dispose();
  };

  return {
    chunks,
    update(position: number) {
      const last = Math.floor((position + CHALLENGE_VIEW.ahead) / CHUNK_METERS);
      while (built < last) build(++built);
      const first = Math.floor((position - CHALLENGE_VIEW.behind) / CHUNK_METERS);
      for (const [i, chunk] of chunks) if (i < first) { dispose(chunk); chunks.delete(i); }
    },
    /** Floating-origin shift: the caller moves the chunks (root children); this moves the remembered lots. */
    shift(delta: THREE.Vector3) {
      for (const state of Object.values(sides)) state.previous?.footprint.forEach(p => p.set(p.x - delta.x, p.y - delta.z));
    },
    dispose() { for (const chunk of chunks.values()) dispose(chunk); chunks.clear(); },
  };
}
