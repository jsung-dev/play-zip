import assert from "node:assert/strict";
import * as THREE from "three";
import { CHUNK_METERS, createChunkedRoute } from "../data/challenge-route";
import { getRouteFrame, setRouteProvider, shiftRouteOrigin } from "../data/delivery-map";
import { CHALLENGE_VIEW, createChallengeStreet } from "../components/delivery/three/challenge-world";
import { createSceneArt } from "../components/delivery/three/scene-art";
import { createRoadSurfaceMaterial } from "../components/delivery/three/road-surface";

// Geometry tests need only the texture canvas, not a renderer.
const context = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {} };
Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => context }) } });
setRouteProvider(createChunkedRoute(1234));
const root = new THREE.Group();
const street = createChallengeStreet(root, createSceneArt(), createRoadSurfaceMaterial());
let buildings = Infinity;
for (let position = 0; position <= 3000; position += 25) {
  street.update(position);
  const ids = [...street.chunks.keys()];
  assert(Math.min(...ids) * CHUNK_METERS <= Math.max(0, position - CHALLENGE_VIEW.behind), `Road behind the rider at ${position} m`);
  assert((Math.max(...ids) + 1) * CHUNK_METERS > position + CHALLENGE_VIEW.ahead, `Road ahead of the rider at ${position} m`);
  assert(ids.length <= 4, `Old chunks are disposed (${ids.length} alive at ${position} m)`);
  assert.equal(root.children.length, ids.length);
  if (position % 500 === 0) {
    // Same shift the scene applies: chunks built before and after it must still meet.
    const here = getRouteFrame(position).position;
    shiftRouteOrigin(here);
    for (const chunk of root.children) chunk.position.sub(here);
    street.shift(here);
    assert(getRouteFrame(position).position.length() < 1e-6, "Origin sits under the rider after a shift");
  }
  for (const chunk of root.children) buildings = Math.min(buildings, chunk.children.at(-1)!.children.length);
}
assert(buildings >= 4, `Every chunk carries street buildings, also after a shift (fewest: ${buildings})`);
setRouteProvider(null);
console.log("Challenge chunks stream ahead, dispose behind and survive origin shifts.");
