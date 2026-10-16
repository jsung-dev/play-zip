"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { DELIVERY_GAME_CONFIG, type DeliveryBrand } from "@/data/delivery-game";
import { getRouteFrame, getDrivewayFrame, getDrivewayLength, getDrivewayExitDistance, DELIVERY_STOPS, ROAD_CLOSURE, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { BrandImage } from "./DeliveryArt";
import { buildDeliveryWorld } from "./three/scene-builders";
import { TOWN_COLORS } from "./three/scene-art";
import { portraitCameraFov } from "./three/scene-layout";
import { createRouteGuidance } from "./three/route-guidance";
import { busTurnLaneClear, type TravelDirection, type TurnChoice } from "./delivery-turns";
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
  closureReached: boolean;
  travelDirection: TravelDirection;
  turnChoice: TurnChoice | null;
  completedStops: number[];
  jumpHeight: number;
};

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
  closureReached,
  travelDirection,
  turnChoice,
  completedStops,
  jumpHeight,
  deliveryBrand,
}: SceneState & { deliveryBrand: DeliveryBrand }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<SceneState>({ position, speed, paused, playing, arriving, sessionKey, laneX, collisionId, detour, stopIndex, stopDwell, deliveryPulse, deliverySuccessRemaining, driveway, guidanceReplay, closureReached, travelDirection, turnChoice, completedStops, jumpHeight });
  const [webglFailed, setWebglFailed] = useState(false);
  stateRef.current = { position, speed, paused, playing, arriving, sessionKey, laneX, collisionId, detour, stopIndex, stopDwell, deliveryPulse, deliverySuccessRemaining, driveway, guidanceReplay, closureReached, travelDirection, turnChoice, completedStops, jumpHeight };

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

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    const scene = new THREE.Scene();
    const skyCanvas = document.createElement("canvas");
    skyCanvas.width = 2; skyCanvas.height = 256;
    const skyContext = skyCanvas.getContext("2d")!;
    const skyGradient = skyContext.createLinearGradient(0, 0, 0, 256);
    skyGradient.addColorStop(0, "#39b7ef"); skyGradient.addColorStop(.6, "#87d5ee"); skyGradient.addColorStop(1, "#dbebe4");
    skyContext.fillStyle = skyGradient; skyContext.fillRect(0, 0, 2, 256);
    const skyTexture = new THREE.CanvasTexture(skyCanvas); skyTexture.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTexture;
    scene.fog = new THREE.Fog(TOWN_COLORS.haze, 88, 205);
    const camera = new THREE.PerspectiveCamera(DELIVERY_GAME_CONFIG.cameraFovDegrees, 1, 0.1, 270);
    camera.position.set(0, DELIVERY_GAME_CONFIG.cameraHeight, DELIVERY_GAME_CONFIG.cameraFollowDistance);

    const hemisphere = new THREE.HemisphereLight("#f1faff", "#a6b6ad", 1.15);
    const sun = new THREE.DirectionalLight("#fff5e4", 2.25);
    sun.position.set(-36, 65, 28);
    scene.add(hemisphere, sun);

    const world = buildDeliveryWorld(scene, deliveryBrand);
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
    let landingElapsed = 1;
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

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const width = Math.max(1, Math.round(bounds.width));
      const height = Math.max(1, Math.round(bounds.height));
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      // Preserve the roadside reading window on narrow phones as well.
      camera.fov = portraitCameraFov(camera.aspect);
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

    const animate = (timestamp: number) => {
      const current = stateRef.current;
      const deltaSeconds = Math.min((timestamp - lastTime) / 1_000, 0.05);
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
      world.bicycle.group.position.set(bikePosition.x, 0.08 + current.jumpHeight, bikePosition.z);
      // Keep the contact shadow on the road while airborne.
      world.bicycle.groundShadow.position.y = .045 - current.jumpHeight / bikeScale;
      world.bicycle.groundShadow.scale.setScalar(1 - current.jumpHeight * .25);
      const airborne = current.jumpHeight > 0;
      if (wasAirborne && !airborne) landingElapsed = 0;
      wasAirborne = airborne;
      if (!current.paused) landingElapsed += deltaSeconds;
      // Brief squash on landing only; the camera rail ignores jump height.
      const squash = reduceMotion ? 0 : Math.sin(Math.min(1, landingElapsed / .18) * Math.PI) * .07;
      world.bicycle.group.scale.set(bikeScale * (1 + squash * .5), bikeScale * (1 - squash), bikeScale * (1 + squash * .5));
      world.bicycle.group.rotation.y = routeFrame.yaw;
      const laneVelocity = (current.laneX - previousLaneX) / Math.max(deltaSeconds, 0.001);
      previousLaneX = current.laneX;
      if (current.collisionId !== activeCollisionId) {
        activeCollisionId = current.collisionId;
        collisionElapsedMs = 0;
      }
      if (activeCollisionId && current.playing && !current.paused) collisionElapsedMs += deltaSeconds * 1_000;
      const impactProgress = activeCollisionId ? Math.min(1, collisionElapsedMs / 420) : 1;
      const impactBump = activeCollisionId ? Math.sin(impactProgress * Math.PI) * 0.1 : 0;
      world.bicycle.group.rotation.z = Math.max(-0.15, Math.min(0.15, -laneVelocity * 0.023));
      world.bicycle.group.rotation.x = impactBump + current.jumpHeight * .06;
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

      camera.updateMatrixWorld();
      const guide = guidance.update(current, camera, canvas.clientHeight, highlightRemaining > 0, timestamp, current.playing || current.arriving);
      // Semantic state for accessibility/QA; never an on-screen debug panel.
      for (const [key, value] of Object.entries(guide)) {
        const attribute = `guidance${key[0].toUpperCase()}${key.slice(1)}`;
        if (canvas.dataset[attribute] !== String(value)) canvas.dataset[attribute] = String(value);
      }

      for (const [index, stop] of world.deliveryStops.entries()) {
        const progress = index === current.stopIndex ? Math.min(1, current.stopDwell / DELIVERY_GAME_CONFIG.deliveryStopDwellSeconds) : 0;
        stop.parcel.visible = progress > .08 && !reduceMotion;
        if (stop.parcel.visible) {
          const destination = stop.house.localToWorld(new THREE.Vector3(...stop.house.userData.entranceLocal as [number, number, number]));
          const deliveryProgress = THREE.MathUtils.smoothstep(progress, .08, 1);
          stop.parcel.position.copy(bikePosition).lerp(destination, deliveryProgress);
          stop.parcel.position.y = 1.65 + Math.sin(deliveryProgress * Math.PI) * 1.3;
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
        if (movingBusDistance < current.position - 45 || movingBusDistance < 0 || !busTurnLaneClear(movingBusDistance, movingBusDistance, activeMovingBus.placement.side)) {
          activeMovingBus.group.visible = false;
          activeMovingBus = null;
        }
      }

      if (!activeMovingBus && !nearRoadClosure && current.playing && !current.paused) {
        const nextBus = world.movingBuses.find(({ placement }) => (
          current.position >= placement.distance && !shownMovingBuses.has(placement.id)
          && busTurnLaneClear(current.position - 45, current.position + 68, placement.side)
        ));
        if (nextBus) {
          shownMovingBuses.add(nextBus.placement.id);
          nextBus.group.visible = true;
          movingBusDistance = Math.min(DELIVERY_GAME_CONFIG.totalDistance, current.position + 68);
          activeMovingBus = nextBus;
        }
      }

      renderer.render(scene, camera);
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
  }, [deliveryBrand]);

  return (
    <section className={styles.scene3d} data-paused={paused ? "true" : "false"} aria-label="3D 배달 동네">
      <canvas ref={canvasRef} className={styles.sceneCanvas} aria-label="자전거 뒤에서 바라보는 3D 배달 도로" />
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
