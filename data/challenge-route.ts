import * as THREE from "three";

// Challenge mode's endless road: 100 m chunks, each ending at a seeded curvature
// (radius >= 120 m); curvature blends linearly through a chunk, so heading and position stay smooth.
export const CHUNK_METERS = 100;
const MAX_CURVATURE = 1 / 120;
const STEP = 1; // integration step in metres

function rng32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type ChunkedRoute = (distance: number) => { point: THREE.Vector3; tangent: THREE.Vector3 };

export function createChunkedRoute(seed: number): ChunkedRoute {
  const rand = rng32(seed);
  const curvature: number[] = [0, 0]; // curvature at chunk boundaries; the first chunk is straight
  const starts = [{ x: 0, z: 0, yaw: 0 }]; // yaw 0 faces -z, like the brand road's start
  const kAt = (i: number) => {
    while (curvature.length <= i) curvature.push((rand() * 2 - 1) * MAX_CURVATURE);
    return curvature[i];
  };
  // Walks `length` metres into chunk `i` from its start state.
  const walk = (i: number, length: number) => {
    let { x, z, yaw } = starts[i];
    const k0 = kAt(i), k1 = kAt(i + 1);
    for (let s = 0; s < length; s += STEP) {
      const h = Math.min(STEP, length - s);
      const mid = (s + h / 2) / CHUNK_METERS;
      const k = k0 + (k1 - k0) * mid;
      const midYaw = yaw + k * h / 2;
      x += -Math.sin(midYaw) * h;
      z += -Math.cos(midYaw) * h;
      yaw += k * h;
    }
    return { x, z, yaw };
  };
  return (distance) => {
    const d = Math.max(0, distance);
    const i = Math.floor(d / CHUNK_METERS);
    while (starts.length <= i) starts.push(walk(starts.length - 1, CHUNK_METERS));
    const { x, z, yaw } = walk(i, d - i * CHUNK_METERS);
    return { point: new THREE.Vector3(x, 0, z), tangent: new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)) };
  };
}
