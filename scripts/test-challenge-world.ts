import assert from "node:assert/strict";
import * as THREE from "three";
import { CHUNK_METERS, createChunkedRoute } from "../data/challenge-route";
import { getRouteFrame, setRouteProvider, shiftRouteOrigin } from "../data/delivery-map";
import { CHALLENGE_VIEW, createChallengeStreet } from "../components/delivery/three/challenge-world";
import type { DeliveryWorld } from "../components/delivery/three/scene-builders";
import { createOutdoorAdResources } from "../components/delivery/three/outdoor-ad-material";
import { startChallengeCourse } from "../components/delivery/delivery-challenge-course";
import { createSceneArt } from "../components/delivery/three/scene-art";
import { createRoadSurfaceMaterial } from "../components/delivery/three/road-surface";

// Geometry tests need only the texture canvas, not a renderer.
// Any 2D-context call is a no-op except the two whose results are used.
const context = new Proxy({}, { get: (target: Record<string, unknown>, key: string) => key in target ? target[key] : key === "measureText" ? (text: string) => ({ width: text.length * 40 }) : key.startsWith("create") ? () => ({ addColorStop() {} }) : () => {} });
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
setRouteProvider(createChunkedRoute(1234));
const root = new THREE.Group();
startChallengeCourse(1234);
const world = { root, art: createSceneArt(), road: createRoadSurfaceMaterial(), outdoorResources: createOutdoorAdResources(), obstacles: [], movers: [], worldObjects: [] } as unknown as DeliveryWorld;
const street = createChallengeStreet(world);
let hazardsSeen = 0;
let buildings = Infinity;
for (let position = 0; position <= 3000; position += 25) {
  street.update(position);
  const ids = [...street.chunks.keys()];
  assert(Math.min(...ids) * CHUNK_METERS <= Math.max(0, position - CHALLENGE_VIEW.behind), `Road behind the rider at ${position} m`);
  assert((Math.max(...ids) + 1) * CHUNK_METERS > position + CHALLENGE_VIEW.ahead, `Road ahead of the rider at ${position} m`);
  assert(ids.length <= 4, `Old chunks are disposed (${ids.length} alive at ${position} m)`);
  // Chunks plus their movers (which sit on the root) are all that is alive.
  assert.equal(root.children.length, ids.length + world.movers.length);
  assert(world.worldObjects.every(o => o.parent && root.children.includes(o.parent)), "Disposed hazards leave the culling list");
  hazardsSeen = Math.max(hazardsSeen, world.obstacles.length + world.movers.length);
  if (position % 500 === 0) {
    // Same shift the scene applies: chunks built before and after it must still meet.
    const here = getRouteFrame(position).position;
    shiftRouteOrigin(here);
    for (const chunk of root.children) chunk.position.sub(here);
    street.shift(here);
    assert(getRouteFrame(position).position.length() < 1e-6, "Origin sits under the rider after a shift");
  }
  for (const chunk of root.children) if (chunk.name.startsWith("challenge-chunk")) buildings = Math.min(buildings, chunk.children.find(c => c.type === "Group" && c.children.some(b => b.type === "Group"))!.children.filter(b => b.type === "Group").length);
}
assert(buildings >= 4, `Every chunk carries street buildings, also after a shift (fewest: ${buildings})`);
assert(hazardsSeen > 0, "Chunks carry obstacles");
setRouteProvider(null);
console.log("Challenge chunks stream ahead, dispose behind and survive origin shifts.");
