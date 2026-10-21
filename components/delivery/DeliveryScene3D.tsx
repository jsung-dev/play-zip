"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DELIVERY_GAME_CONFIG, type DeliveryBrand } from "@/data/delivery-game";
import { DELIVERY_HOUSE, getRouteFrame, getDrivewayFrame, getDrivewayLength, getDrivewayExitDistance, DELIVERY_STOPS, ROAD_CLOSURE, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { BrandImage } from "./DeliveryArt";
import { buildDeliveryWorld } from "./three/scene-builders";
import { portraitCameraFov } from "./three/scene-layout";
import { createRouteGuidance } from "./three/route-guidance";
import { type TravelDirection, type TurnChoice } from "./delivery-turns";
import { DUCK, animateDuck, duckPose, meetPoint } from "./three/duck-resident";
import { DRIVE_BY } from "./delivery-driveby";
import { duckAmountAt, jumpHeightAt } from "./delivery-jump";
import { moverPose, TIMED } from "./delivery-movers";
import styles from "./DeliveryGame.module.css";

type SceneState = {
  position: number;
  speed: number;
  paused: boolean;
  playing: boolean;
  arriving: boolean;
  sessionKey: number;
  laneX: number;
  collisionId: string | null;
  detour: DetourChoice;
  stopIndex: number;
  stopDwell: number;
  deliveryPulse: number;
  deliverySuccessRemaining: number;
  driveway: DrivewayState | null;
  guidanceReplay: number;
  travelDirection: TravelDirection;
  turnChoice: TurnChoice | null;
  completedStops: number[];
  jumpHeight: number;
};

type LiveKeys = "position" | "speed" | "laneX" | "collisionId" | "detour" | "stopIndex" | "stopDwell" | "deliveryPulse" | "deliverySuccessRemaining" | "driveway" | "travelDirection" | "turnChoice" | "completedStops";
const LIVE_KEYS: LiveKeys[] = ["position", "speed", "laneX", "collisionId", "detour", "stopIndex", "stopDwell", "deliveryPulse", "deliverySuccessRemaining", "driveway", "travelDirection", "turnChoice", "completedStops"];
export type LiveRuntime = Pick<SceneState, LiveKeys> & { jumpElapsed: number | null; duckElapsed: number | null; jumpPower: number; clock: number; moverStarts: Record<string, number>; moverTargets: Record<string, number>; collected: Set<number>; boostRemaining: number; fallElapsed: number | null };

export function DeliveryScene3D({
  position,
  speed,
  paused,
  playing,
  arriving,
  sessionKey,
  laneX,
  collisionId,
  detour,
  stopIndex,
  stopDwell,
  deliveryPulse,
  deliverySuccessRemaining,
  driveway,
  guidanceReplay,
 
  travelDirection,
  turnChoice,
  completedStops,
  jumpHeight,
  deliveryBrand,
  liveRef,
}: SceneState & { deliveryBrand: DeliveryBrand; liveRef?: { readonly current: LiveRuntime } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const speedLinesRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<SceneState>({ position, speed, paused, playing, arriving, sessionKey, laneX, collisionId, detour, stopIndex, stopDwell, deliveryPulse, deliverySuccessRemaining, driveway, guidanceReplay, travelDirection, turnChoice, completedStops, jumpHeight });
  const [webglFailed, setWebglFailed] = useState(false);
  stateRef.current = { position, speed, paused, playing, arriving, sessionKey, laneX, collisionId, detour, stopIndex, stopDwell, deliveryPulse, deliverySuccessRemaining, driveway, guidanceReplay, travelDirection, turnChoice, completedStops, jumpHeight };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        alpha: false,
        powerPreference: "high-performance",
      });
    } catch {
      setWebglFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Neutral tone mapping keeps pastel props bright and saturated (ACES greyed them).
    renderer.toneMapping = THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1.08;

    const scene = new THREE.Scene();
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 2; skyCanvas.height = 256;
    const skyContext = skyCanvas.getContext("2d")!;
    const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
    skyGradient.addColorStop(0, "#2aa9f5"); skyGradient.addColorStop(.6, "#86d6fb"); skyGradient.addColorStop(1, "#e9f8ff");
    skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 2, 256);
    const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTexture;
    scene.fog = new THREE.Fog("#e3f4fb", 95, 215);
    const camera = new THREE.PerspectiveCamera(DELIVERY_GAME_CONFIG.cameraFovDegrees, 1, 0.1, 270);
    camera.position.set(0, DELIVERY_GAME_CONFIG.cameraHeight, DELIVERY_GAME_CONFIG.cameraFollowDistance);

    const hemisphere = new THREE.HemisphereLight("#f4fbff", "#c9d6c4", 1.35);
    const sun = new THREE.DirectionalLight("#fff3dc", 2.4);
    sun.position.set(-36, 65, 28);
    scene.add(hemisphere, sun);

    const world = buildDeliveryWorld(scene, deliveryBrand);
    // Upload every block once now (behind the start screen), so driving into a
    // new street section never pays a first-draw GPU upload mid-ride.
    {
      const culled: THREE.Object3D[] = [];
      scene.traverse((object) => { if (object instanceof THREE.Mesh && object.frustumCulled) { object.frustumCulled = false; culled.push(object); } });
      const hidden = [...world.worldObjects, ...world.movingBuses.map((bus) => bus.group), ...world.movers.map((mover) => mover.group)].filter((object) => !object.visible);
      for (const object of hidden) object.visible = true;
      const warm = new THREE.WebGLRenderTarget(1, 1);
      renderer.setRenderTarget(warm); renderer.render(scene, camera); renderer.setRenderTarget(null); warm.dispose();
      for (const object of culled) object.frustumCulled = true;
      for (const object of hidden) object.visible = false;
    }
    const guidance = createRouteGuidance(world);
    let replaySeen = guidanceReplay, highlightRemaining = 0;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let animationFrame = 0;
    let lastTime = performance.now();
    let wheelPhase = 0;
    let previousLaneX = stateRef.current.laneX;
    let activeCollisionId: string | null = null;
    let collisionElapsedMs = 420;
    let activeMovingBus: (typeof world.movingBuses)[number] | null = null;
    let movingBusDistance = 0;
    let renderedSession = stateRef.current.sessionKey;
    let landingElapsed = 1, wobble = 0;
    const meetU: (number | null)[] = world.deliveryStops.map(() => null);
    // Dust puffs: a small pool reused for hits and hard landings.
    const dustMaterial = new THREE.MeshBasicMaterial({ color: "#efe3cf", transparent: true, opacity: 0, depthWrite: false });
    const dustGeometry = new THREE.IcosahedronGeometry(.28, 1);
    const dust = Array.from({ length: 10 }, () => {
      const puff = new THREE.Mesh(dustGeometry, dustMaterial.clone()); puff.visible = false; world.root.add(puff);
      return { puff, velocity: new THREE.Vector3(), age: 1 };
    });
    const kickDust = (at: THREE.Vector3, count: number) => {
      dust.slice(0, count).forEach((d, n) => {
        const a = n / count * Math.PI * 2;
        d.age = 0; d.puff.visible = true; d.puff.position.set(at.x, .25, at.z);
        d.velocity.set(Math.cos(a) * 2.2, 1.2 + (n % 3) * .4, Math.sin(a) * 2.2);
      });
    };
    let wasAirborne = false;
    const bikeScale = world.bicycle.group.scale.x;
    const shownMovingBuses = new Set<string>();

    const resetMovingBuses = () => {
      shownMovingBuses.clear();
      activeMovingBus = null;
      for (const bus of world.movingBuses) {
        bus.group.visible = false;
        bus.group.position.z = 0;
      }
    };

    let baseFov = camera.fov, shake = 0, shakeStrength = 0, speedLineOpacity = -1;
    const shakeOffset = new THREE.Vector3();
    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Preserve the roadside reading window on narrow phones as well.
      camera.fov = baseFov = portraitCameraFov(camera.aspect);
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const handleContextLost = (event: Event) => {
      event.preventDefault();
      setWebglFailed(true);
    };
    canvas.addEventListener("webglcontextlost", handleContextLost);

    // Read motion straight from the game's runtime each frame instead of waiting
    // for a React re-render, which can land a frame late and make the ride judder.
    const frameState = { ...stateRef.current };
    const animate = (timestamp: number) => {
      const live = liveRef?.current;
      const current = Object.assign(frameState, stateRef.current);
      if (live) {
        for (const key of LIVE_KEYS) (current as unknown as Record<LiveKeys, unknown>)[key] = live[key];
        current.jumpHeight = jumpHeightAt(live.jumpElapsed, live.jumpPower);
      }
      // The first frame's timestamp can precede lastTime (set before the GPU
      // warm-up); a negative step made the camera lerp overshoot wildly.
      const deltaSeconds = Math.max(0, Math.min((timestamp - lastTime) / 1_000, 0.05));
      lastTime = timestamp;

      if (current.sessionKey !== renderedSession) {
        renderedSession = current.sessionKey;
        resetMovingBuses();
        highlightRemaining = 0;
        replaySeen = current.guidanceReplay;
      }
      if (current.guidanceReplay !== replaySeen) { replaySeen = current.guidanceReplay; highlightRemaining = 4; }
      if (current.playing && !current.paused) highlightRemaining = Math.max(0, highlightRemaining - deltaSeconds);

      const mainFrame = getRouteFrame(current.position, current.detour);
      const routeFrame = current.driveway ? getDrivewayFrame(current.driveway.stopIndex, current.driveway.progress, current.driveway) : mainFrame;
      world.horizon.position.set(routeFrame.position.x, 0, routeFrame.position.z);
      const bikePosition = routeFrame.position.clone().addScaledVector(routeFrame.lateral, current.driveway ? 0 : current.laneX);
      // Falling into a collapsed road: the bike sinks out of sight before the respawn.
      const fall = live?.fallElapsed ?? null;
      const sink = fall === null ? 0 : 9 * fall * fall;
      world.bicycle.group.position.set(bikePosition.x, 0.08 + current.jumpHeight - sink, bikePosition.z);
      // Keep the contact shadow on the road while airborne.
      world.bicycle.groundShadow.position.y = .045 - current.jumpHeight / bikeScale;
      world.bicycle.groundShadow.scale.setScalar(1 - current.jumpHeight * .25);
      const airborne = current.jumpHeight > 0;
      if (wasAirborne && !airborne) { landingElapsed = 0; if (live?.jumpPower && live.jumpPower > 1 && !reduceMotion) kickDust(bikePosition, 8); }
      wasAirborne = airborne;
      if (!current.paused) landingElapsed += deltaSeconds;
      // Brief squash on landing only; the camera rail ignores jump height.
      const squash = reduceMotion ? 0 : Math.sin(Math.min(1, landingElapsed / .18) * Math.PI) * .04;
      // Ducking squashes the rider low and leans them forward.
      const duck = live ? duckAmountAt(live.duckElapsed) : 0;
      world.bicycle.group.scale.set(bikeScale * (1 + squash * .5), bikeScale * (1 - squash - duck * .3), bikeScale * (1 + squash * .5));
      world.bicycle.group.rotation.y = routeFrame.yaw;
      const laneVelocity = (current.laneX - previousLaneX) / Math.max(deltaSeconds, 0.001);
      previousLaneX = current.laneX;
      if (current.collisionId !== activeCollisionId) {
        activeCollisionId = current.collisionId;
        collisionElapsedMs = 0;
        if (activeCollisionId) { shake = .25; shakeStrength = .05; wobble = .7; if (!reduceMotion) kickDust(bikePosition, 10); }
      }
      if (activeCollisionId && current.playing && !current.paused) collisionElapsedMs += deltaSeconds * 1_000;
      const impactProgress = activeCollisionId ? Math.min(1, collisionElapsedMs / 420) : 1;
      const impactBump = activeCollisionId ? Math.sin(impactProgress * Math.PI) * 0.1 : 0;
      // On a hit the rider wobbles side to side for a moment.
      wobble = Math.max(0, wobble - (current.paused ? 0 : deltaSeconds));
      world.bicycle.group.rotation.z = Math.max(-0.15, Math.min(0.15, -laneVelocity * 0.023)) + (reduceMotion ? 0 : Math.sin(wobble * 26) * .2 * wobble / .7);
      for (const d of dust) {
        if (!d.puff.visible) continue;
        d.age += current.paused ? 0 : deltaSeconds;
        d.puff.position.addScaledVector(d.velocity, current.paused ? 0 : deltaSeconds);
        d.puff.scale.setScalar(1 + d.age * 2.4);
        (d.puff.material as THREE.MeshBasicMaterial).opacity = Math.max(0, .75 * (1 - d.age / .6));
        if (d.age > .6) d.puff.visible = false;
      }
      world.bicycle.group.rotation.x = impactBump + current.jumpHeight * .06 + duck * .22;
      wheelPhase -= (current.speed * deltaSeconds) / 0.43;
      for (const wheel of world.bicycle.wheels) wheel.rotation.x = wheelPhase;
      world.bicycle.pedal.rotation.x = wheelPhase * 1.35;
      const legSwing = Math.sin(wheelPhase * 1.35) * Math.min(0.34, Math.abs(current.speed) / 28);
      world.bicycle.leftLeg.rotation.x = legSwing;
      world.bicycle.rightLeg.rotation.x = -legSwing;

      const entryMix = current.driveway ? THREE.MathUtils.smoothstep(current.driveway.progress, 0, 7) : 0;
      const exitMix = current.driveway ? THREE.MathUtils.smoothstep(getDrivewayLength(current.driveway.stopIndex) - current.driveway.progress, 0, 9) : 0;
      const drivewayMix = Math.min(entryMix, exitMix);
      const cameraRail = routeFrame.position.clone();
      // Preserve the original camera on all three through lanes. Only follow
      // the extra lane's added width so the rider stays visible on portrait phones.
      const throughLaneOffset = (offset: number) => THREE.MathUtils.clamp(offset, -DELIVERY_GAME_CONFIG.laneSpacing, DELIVERY_GAME_CONFIG.laneSpacing);
      if (!current.driveway) cameraRail.addScaledVector(routeFrame.lateral, current.laneX - throughLaneOffset(current.laneX));
      if (current.driveway) {
        const enteredAtExit = current.driveway.entryEnd === "exit";
        const side = DELIVERY_STOPS[current.driveway.stopIndex].side === "left" ? -1 : 1;
        const entranceFrame = getRouteFrame(enteredAtExit ? DELIVERY_STOPS[current.driveway.stopIndex].distance : current.driveway.entryPosition);
        const exitFrame = getRouteFrame(enteredAtExit ? current.driveway.entryPosition : getDrivewayExitDistance(current.driveway.stopIndex));
        const entranceLane = enteredAtExit ? side * DELIVERY_GAME_CONFIG.laneSpacing * 2 : current.driveway.entryLaneX;
        const exitLane = enteredAtExit ? current.driveway.entryLaneX : side * DELIVERY_GAME_CONFIG.laneSpacing * 2;
        cameraRail.addScaledVector(entranceFrame.lateral, -throughLaneOffset(entranceLane) * (1 - entryMix));
        cameraRail.addScaledVector(exitFrame.lateral, -throughLaneOffset(exitLane) * (1 - exitMix));
      }
      const cameraTarget = cameraRail.clone()
        .addScaledVector(routeFrame.lateral, .8 + current.laneX * 0.12)
        .addScaledVector(routeFrame.tangent, -DELIVERY_GAME_CONFIG.cameraFollowDistance);
      const forkApproach = THREE.MathUtils.clamp((current.position - (ROAD_CLOSURE.junctionDistance - 100)) / 55, 0, 1);
      const forkDeparture = 1 - THREE.MathUtils.clamp((current.position - (ROAD_CLOSURE.junctionDistance + 55)) / 70, 0, 1);
      const forkView = Math.min(forkApproach, forkDeparture);
      cameraTarget.y = DELIVERY_GAME_CONFIG.cameraHeight + forkView * 1.4;
      const followBlend = reduceMotion ? 1 : 1 - Math.exp(-9 * deltaSeconds);
      camera.position.lerp(cameraTarget, followBlend);
      // Speed feel: the view widens a little near top speed, with streaks at the edges.
      const boost = live && live.boostRemaining > 0 ? 1 : 0;
      const rush = reduceMotion ? 0 : Math.max(boost, THREE.MathUtils.smoothstep(Math.abs(current.speed), 12, 20));
      // Boost is the one deliberate rush: wider view and strong streaks.
      const fov = baseFov + rush * 2.5 + (reduceMotion ? 0 : boost * 5);
      if (Math.abs(camera.fov - fov) > .01) { camera.fov += (fov - camera.fov) * Math.min(1, deltaSeconds * 1.5); camera.updateProjectionMatrix(); }
      const lines = Math.round((rush * .35 + boost * .4) * (current.paused ? 0 : 1) * 20) / 20;
      if (lines !== speedLineOpacity && speedLinesRef.current) { speedLineOpacity = lines; speedLinesRef.current.style.opacity = String(lines); }
      const lookTarget = cameraRail.clone().addScaledVector(routeFrame.tangent, 16 - forkView * 2 - drivewayMix * 7);
      lookTarget.y = 1.15;
      camera.lookAt(lookTarget);
      if (scene.fog instanceof THREE.Fog) scene.fog.far = 205 + forkView * 15;

      for (const object of world.worldObjects) {
        const objectDistance = Number(object.userData.routeDistance ?? 0);
        const relativeDistance = objectDistance - current.position;
        object.visible = relativeDistance > -38 && relativeDistance < 180;
        const obstacleId = String(object.userData.obstacleId ?? "");
        if (obstacleId) {
          const opacity = obstacleId === current.collisionId ? 0.3 : 1;
          object.traverse((part) => {
            if (!(part instanceof THREE.Mesh)) return;
            const materials = Array.isArray(part.material) ? part.material : [part.material];
            for (const material of materials) {
              if ("opacity" in material) {
                material.userData.baseOpacity ??= material.opacity;
                material.opacity = material.userData.baseOpacity * opacity;
              }
            }
          });
        }
      }
      world.destination.visible = current.position > 790;
      world.boosters.update(current.position, live?.collected, timestamp / 1000);

      // Moving hazards: timed ones run on the game clock; triggered ones wait at their start pose.
      for (const mover of world.movers) {
        const id = mover.placement.id, clock = live?.clock ?? 0, started = live?.moverStarts[id];
        const pose = moverPose(mover.placement, clock, started, live?.moverTargets[id]);
        const relative = pose.distance - current.position;
        mover.group.visible = !pose.done && relative > -38 && relative < 180;
        if (!mover.group.visible) continue;
        const frame = getRouteFrame(Math.min(DELIVERY_GAME_CONFIG.totalDistance, Math.max(0, pose.distance)), mover.placement.branch ?? "main");
        const at = frame.position.addScaledVector(frame.lateral, pose.x);
        mover.group.position.set(at.x, 0, at.z);
        mover.group.rotation.y = frame.yaw;
        const timed = TIMED.has(mover.placement.kind);
        mover.animate(timed ? clock : started === undefined ? 0 : clock - started, timed || started !== undefined, timestamp / 1000, pose);
      }

      camera.updateMatrixWorld();
      const guide = guidance.update(current, camera, canvas.clientHeight, highlightRemaining > 0, timestamp, current.playing || current.arriving);
      // Semantic state for accessibility/QA; never an on-screen debug panel.
      for (const [key, value] of Object.entries(guide)) {
        const attribute = `guidance${key[0].toUpperCase()}${key.slice(1)}`;
        if (canvas.dataset[attribute] !== String(value)) canvas.dataset[attribute] = String(value);
      }

      for (const [index, stop] of world.deliveryStops.entries()) {
        // The duck walks to the stopped bike, takes the parcel after the quiz and carries it home.
        const here = index === current.stopIndex && !current.completedStops?.includes(index);
        const arrived = here ? current.stopDwell : 0;
        const delivered = current.deliverySuccessRemaining > 0 && current.completedStops?.at(-1) === index
          ? DELIVERY_GAME_CONFIG.deliverySuccessSeconds - current.deliverySuccessRemaining : null;
        const done = delivered === null && !!current.completedStops?.includes(index);
        if (arrived > 0 && meetU[index] === null) meetU[index] = current.laneX;
        if (arrived === 0 && delivered === null && !done) meetU[index] = null;
        const { base, rest, door, duck } = stop;
        const near = Math.abs(current.position - stop.distance - DELIVERY_HOUSE.along) < DRIVE_BY.warnAhead;
        const pose = duckPose({ waving: near, arrived, delivered, rest, door, meet: meetPoint(meetU[index] ?? current.laneX, stop.side, 0) });
        const world3 = (p: { u: number; v: number }) => base.position.clone().addScaledVector(base.lateral, p.u).addScaledVector(base.tangent, p.v);
        const at = world3(pose.at), look = world3(pose.look);
        duck.group.visible = pose.visible && !done;
        duck.group.position.set(at.x, 0, at.z);
        if (look.distanceToSquared(at) > .01) duck.group.rotation.y = Math.atan2(look.x - at.x, look.z - at.z);
        animateDuck(duck, reduceMotion ? "idle" : pose.anim, timestamp / 1000, pose.carrying);
        // Parcel: bike -> duck's hands at the handover, then in its arms on the way home.
        stop.parcel.visible = delivered !== null && pose.visible && !reduceMotion;
        if (stop.parcel.visible) {
          const hands = at.clone(); hands.y = 1.05;
          const t = THREE.MathUtils.clamp((delivered ?? 0) / DUCK.handSeconds, 0, 1);
          stop.parcel.position.copy(bikePosition).setY(1.5).lerp(hands, THREE.MathUtils.smoothstep(t, 0, 1));
        }
      }

      const nearRoadClosure = current.driveway !== null || (current.position >= ROAD_CLOSURE.junctionDistance - 15 && current.position <= ROAD_CLOSURE.mergeEnd + 12);
      if (nearRoadClosure && activeMovingBus) {
        activeMovingBus.group.visible = false;
        shownMovingBuses.add(activeMovingBus.placement.id);
        activeMovingBus = null;
      }

      if (activeMovingBus && current.playing && !current.paused && !nearRoadClosure) {
        movingBusDistance -= activeMovingBus.placement.speed * deltaSeconds;
        const busFrame = getRouteFrame(Math.max(0, Math.min(DELIVERY_GAME_CONFIG.totalDistance, movingBusDistance)));
        const busPosition = busFrame.position.clone().addScaledVector(busFrame.lateral, (activeMovingBus.placement.side === "left" ? -1 : 1) * DELIVERY_GAME_CONFIG.busLaneOffset);
        activeMovingBus.group.position.set(busPosition.x, 0, busPosition.z);
        activeMovingBus.group.rotation.y = busFrame.yaw;
        if (movingBusDistance < current.position - 45 || movingBusDistance < 0) {
          activeMovingBus.group.visible = false;
          activeMovingBus = null;
        }
      }

      if (!activeMovingBus && !nearRoadClosure && current.playing && !current.paused) {
        const nextBus = world.movingBuses.find(({ placement }) => (
          current.position >= placement.distance && !shownMovingBuses.has(placement.id)
        ));
        if (nextBus) {
          shownMovingBuses.add(nextBus.placement.id);
          nextBus.group.visible = true;
          movingBusDistance = Math.min(DELIVERY_GAME_CONFIG.totalDistance, current.position + 68);
          activeMovingBus = nextBus;
        }
      }

      // A small, slow nudge on hits only (fast jitter read as the ride rattling).
      shake = Math.max(0, shake - deltaSeconds);
      const amount = reduceMotion || current.paused ? 0 : shakeStrength * Math.sin(shake / .25 * Math.PI);
      shakeOffset.set(0, -amount, 0);
      camera.position.add(shakeOffset);
      renderer.render(scene, camera);
      camera.position.sub(shakeOffset);
      animationFrame = window.requestAnimationFrame(animate);
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      const materials = new Set<THREE.Material>();
      const textures = new Set<THREE.Texture>();
      world.root.traverse((object) => {
        if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Sprite)) return;
        if (object instanceof THREE.Mesh) geometries.add(object.geometry);
        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of objectMaterials) {
          materials.add(material);
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) textures.add(value);
          }
        }
      });
      for (const texture of textures) texture.dispose();
      for (const material of materials) material.dispose();
      for (const geometry of geometries) geometry.dispose();
      guidance.dispose();
      skyTexture.dispose();
      renderer.dispose();
    };
  }, [deliveryBrand, liveRef]);

  return (
    <section className={styles.scene3d} data-paused={paused ? "true" : "false"} aria-label="3D 배달 동네">
      <canvas ref={canvasRef} className={styles.sceneCanvas} aria-label="자전거 뒤에서 바라보는 3D 배달 도로" />
      <div ref={speedLinesRef} className={styles.speedLines} aria-hidden="true" />
      <div className={styles.sceneVignette} aria-hidden="true" />
      {webglFailed && (
        <div className={styles.webglFallback} role="alert">
          <strong>3D 화면을 표시하지 못했어요</strong>
          <span>WebGL을 지원하는 최신 브라우저에서 다시 열어주세요.</span>
        </div>
      )}
      {arriving && (
        <div className={styles.deliveryMoment3d} role="status" aria-live="polite">
          <BrandImage brand={deliveryBrand} kind="product" alt={`${deliveryBrand.productName} 전달`} />
        </div>
      )}
    </section>
  );
}
