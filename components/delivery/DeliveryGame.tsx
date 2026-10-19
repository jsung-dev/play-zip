"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronsUp, GitFork, PackageCheck, Pause, Play } from "lucide-react";
import { DELIVERY_BRANDS, DELIVERY_GAME_CONFIG, OBSTACLE_PLACEMENTS } from "@/data/delivery-game";
import type { DeliveryChoiceId } from "@/data/delivery-campaign";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDetourOffset, getDrivewayLength, getDrivewayExitDistance, getDrivewayDeliveryInterval, getRouteFrame, isAtDrivewayDelivery, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { DeliveryScene3D } from "./DeliveryScene3D";
import { DeliveryBrandQuiz, DeliveryBrandStart, DeliveryPurchaseAd } from "./DeliveryCampaign";
import { DeliveryPauseMenu, type ControlHand } from "./DeliveryPauseMenu";
import { getDeliveryNavigation } from "./delivery-navigation";
import { advanceDeliveryTargets, completedDeliveryCount } from "./delivery-progress";
import { nextDeliveryLane, settledDeliveryLane, laneTargetX, occupiedDeliveryTurn, enterTurnLane, type TravelDirection, type TurnChoice } from "./delivery-turns";
import { DeliveryJoystick, type DeliveryJoystickHandle } from "./DeliveryJoystick";
import type { JoystickDrive } from "./delivery-joystick";
import { clearsObstacle, jumpDuration, jumpHeightAt, obstacleCenterX, obstacleHitHalfWidth, RAMP_POWER } from "./delivery-jump";
import { FRESHNESS, freshnessLeft, sectionEntered, starsFor } from "./delivery-freshness";
import { BOOST, boosterHit, FALL_SECONDS, gapUnder, RAMP_MAX_SPEED, RAMP_MIN_SPEED, rampHit } from "./delivery-pickups";
import { MOVER_PLACEMENTS, MOVER_SHAPE, moverCollides, moverPose } from "./delivery-movers";
import { playSfx, setSoundEnabled, soundEnabled, startMusic, stopMusic, unlockSound } from "./delivery-sound";
import styles from "./DeliveryGame.module.css";
import navStyles from "./DeliveryNavigation.module.css";

type GameStatus = "ready" | "playing" | "quiz" | "arriving" | "completed";

type RuntimeState = {
  position: number;
  speed: number;
  laneX: number;
  laneFromX: number;
  laneTarget: number;
  laneStartedAt: number;
  collisionId: string | null;
  collisionCount: number;
  slowdownUntil: number;
  stopIndex: number;
  quizPassedStops: number[];
  completedStops: number[];
  skippedStops: number[];
  stopDwell: number;
  deliveryPulse: number;
  deliverySuccessRemaining: number;
  detour: DetourChoice;
  closureReached: boolean;
  driveway: DrivewayState | null;
  travelDirection: TravelDirection;
  turnChoice: TurnChoice | null;
  jumpElapsed: number | null;
  clock: number;
  moverStarts: Record<string, number>;
  jumpPower: number;
  collected: Set<number>;
  fallElapsed: number | null;
  fallRespawn: number;
  usedSeconds: number;
  toast: { text: string; kind: "good" | "bad" | "info"; until: number; id: number } | null;
  cleared: Set<string>;
  boostRemaining: number;
};

type DriveInput = {
  forward: boolean;
  reverse: boolean;
};

const makeRuntime = (): RuntimeState => ({ position: 0, speed: 0, laneX: 0, laneFromX: 0, laneTarget: 1, laneStartedAt: 0, collisionId: null, collisionCount: 0, slowdownUntil: 0, stopIndex: 0, quizPassedStops: [], completedStops: [], skippedStops: [], stopDwell: 0, deliveryPulse: 0, deliverySuccessRemaining: 0, detour: "main", closureReached: false, driveway: null, travelDirection: 1, turnChoice: null, jumpElapsed: null, clock: 0, moverStarts: {}, jumpPower: 1, collected: new Set(), boostRemaining: 0, fallElapsed: null, fallRespawn: 0, usedSeconds: 0, toast: null, cleared: new Set() });

let toastId = 0;
// Short on-screen callouts (praise, penalties, section names); the latest wins.
function showToast(runtime: RuntimeState, text: string, kind: "good" | "bad" | "info", seconds = 1.1) {
  runtime.toast = { text, kind, until: runtime.clock + seconds, id: ++toastId };
}

function approach(value: number, target: number, maxDelta: number) {
  if (value < target) return Math.min(target, value + maxDelta);
  return Math.max(target, value - maxDelta);
}

export function DeliveryGame() {
  const [selectedBrand, setSelectedBrand] = useState<DeliveryChoiceId | null>(null);
  const deliveryBrand = DELIVERY_BRANDS[selectedBrand ?? DELIVERY_GAME_CONFIG.deliveryBrandId];
  const runtimeRef = useRef<RuntimeState>(makeRuntime());
  const animationFrameRef = useRef<number | null>(null);
  const lastFrameRef = useRef<number | null>(null);
  const lastUiCommitRef = useRef(0);
  const joystickRef = useRef<DeliveryJoystickHandle>(null);
  const joystickDriveRef = useRef<JoystickDrive>(null);
  const pauseTouchHandledRef = useRef(false);
  const obstaclePassUntilRef = useRef(new Map<string, number>());
  const keyInputsRef = useRef<DriveInput>({ forward: false, reverse: false });
  const driveInputRef = useRef<DriveInput>({ forward: false, reverse: false });
  const [frame, setFrame] = useState<RuntimeState>(() => ({ ...runtimeRef.current }));
  const [status, setStatus] = useState<GameStatus>("ready");
  const [paused, setPaused] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [guidanceReplay, setGuidanceReplay] = useState(0);
  // Which thumb steers; the other half of the screen is the jump area.
  const [controlHand, setControlHand] = useState<ControlHand>("right");
  useEffect(() => {
    try { if (localStorage.getItem("delivery-control-hand") === "left") setControlHand("left"); } catch { /* storage blocked: keep default */ }
  }, []);
  const [soundOn, setSoundOn] = useState(true);
  useEffect(() => setSoundOn(soundEnabled()), []);
  const toggleSound = useCallback(() => {
    const next = !soundEnabled();
    setSoundEnabled(next); setSoundOn(next);
    if (next) unlockSound();
  }, []);
  const changeControlHand = useCallback((hand: ControlHand) => {
    setControlHand(hand);
    try { localStorage.setItem("delivery-control-hand", hand); } catch { /* not persisted */ }
  }, []);

  const syncDriveInput = useCallback(() => {
    const next = {
      forward: keyInputsRef.current.forward || joystickDriveRef.current === "forward",
      reverse: keyInputsRef.current.reverse || joystickDriveRef.current === "reverse",
    };
    driveInputRef.current = next;
  }, []);

  const handleJoystickDrive = useCallback((direction: JoystickDrive) => {
    joystickDriveRef.current = direction;
    syncDriveInput();
  }, [syncDriveInput]);

  const clearInputs = useCallback(() => {
    runtimeRef.current.turnChoice = null;
    joystickRef.current?.reset();
    joystickDriveRef.current = null;
    keyInputsRef.current = { forward: false, reverse: false };
    driveInputRef.current = { forward: false, reverse: false };
  }, []);

  const resetRuntime = useCallback(() => {
    const fresh = makeRuntime();
    runtimeRef.current = fresh;
    obstaclePassUntilRef.current.clear();
    lastFrameRef.current = null;
    setFrame({ ...fresh });
    setPaused(false);
    setGuidanceReplay(0);
    clearInputs();
  }, [clearInputs]);

  const startGame = useCallback(() => {
    if (!selectedBrand) return;
    unlockSound();
    resetRuntime();
    setSessionKey((current) => current + 1);
    setStatus("playing");
  }, [resetRuntime, selectedBrand]);

  const returnToStart = useCallback(() => {
    resetRuntime();
    setSelectedBrand(null);
    setStatus("ready");
  }, [resetRuntime]);

  const completeQuiz = useCallback(() => {
    const runtime = runtimeRef.current;
    const index = runtime.driveway?.stopIndex;
    if (status !== "quiz" || index === undefined || runtime.completedStops.includes(index)) return;
    runtime.quizPassedStops = [...runtime.quizPassedStops, index];
    // Correct answer and handoff are one atomic action. No second dwell timer.
    runtime.completedStops = [...runtime.completedStops, index];
    runtime.skippedStops = runtime.skippedStops.filter(stop => stop !== index);
    runtime.deliveryPulse += 1;
    playSfx("deliver");
    runtime.deliverySuccessRemaining = DELIVERY_GAME_CONFIG.deliverySuccessSeconds;
    Object.assign(runtime, advanceDeliveryTargets(runtime));
    runtime.speed = 0;
    runtime.stopDwell = 0;
    clearInputs();
    setFrame({ ...runtime });
    setStatus("playing");
  }, [clearInputs, status]);

  const moveLane = useCallback((direction: -1 | 1) => {
    if (status !== "playing" || paused) return;
    const runtime = runtimeRef.current;
    if (runtime.driveway) return;
    // Finish each 0.26s adjacent-lane movement before accepting another.
    if (Math.abs(runtime.laneX - laneTargetX(runtime.laneTarget, runtime.position)) > .15) return;
    const nextTarget = nextDeliveryLane(runtime.position, runtime.laneTarget, direction);
    if (nextTarget === runtime.laneTarget) return;
    runtime.laneFromX = runtime.laneX;
    runtime.laneTarget = nextTarget;
    runtime.laneStartedAt = performance.now();
    setFrame({ ...runtime });
  }, [paused, status]);

  const jump = useCallback(() => {
    if (status !== "playing" || paused) return;
    const runtime = runtimeRef.current;
    if (runtime.jumpElapsed !== null) return;
    runtime.jumpElapsed = 0;
    runtime.jumpPower = 1;
    playSfx("jump");
    setFrame({ ...runtime });
  }, [paused, status]);

  useEffect(() => {
    if (status !== "playing" || paused) return;

    const tick = (timestamp: number) => {
      const runtime = runtimeRef.current;
      const previous = lastFrameRef.current ?? timestamp;
      const deltaSeconds = Math.min((timestamp - previous) / 1_000, 0.05);
      lastFrameRef.current = timestamp;
      // Advance feedback on game time, so pausing/backgrounding cannot skip it.
      runtime.deliverySuccessRemaining = Math.max(0, runtime.deliverySuccessRemaining - deltaSeconds);
      runtime.clock += deltaSeconds;
      runtime.usedSeconds += deltaSeconds;
      if (runtime.toast && runtime.clock > runtime.toast.until) runtime.toast = null;
      runtime.boostRemaining = Math.max(0, runtime.boostRemaining - deltaSeconds);
      if (runtime.fallElapsed !== null) {
        // Fell into a collapsed road: drop out of sight, then respawn before the gap.
        runtime.fallElapsed += deltaSeconds;
        if (runtime.fallElapsed >= FALL_SECONDS) {
          Object.assign(runtime, { fallElapsed: null, position: runtime.fallRespawn, speed: 0, laneTarget: 1, laneX: 0, laneFromX: 0, laneStartedAt: timestamp, jumpElapsed: null, collisionId: null });
          clearInputs();
          setFrame({ ...runtime });
        }
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const boosting = runtime.boostRemaining > 0;
      if (runtime.jumpElapsed !== null) {
        runtime.jumpElapsed += deltaSeconds;
        if (runtime.jumpElapsed >= jumpDuration(runtime.jumpPower)) {
          if (runtime.jumpPower > 1) { showToast(runtime, "착지 성공!", "good"); playSfx("nice"); } else playSfx("land");
          runtime.jumpElapsed = null;
        }
      }
      const input = driveInputRef.current;
      if (input.forward !== input.reverse) runtime.travelDirection = input.reverse ? -1 : 1;
      const settledLane = settledDeliveryLane(runtime.position, runtime.laneTarget);
      if (!runtime.driveway && settledLane !== runtime.laneTarget) {
        runtime.laneFromX = runtime.laneX;
        runtime.laneTarget = settledLane;
        runtime.laneStartedAt = timestamp;
      }
      const laneProgress = Math.min(1, Math.max(0, (timestamp - runtime.laneStartedAt) / (DELIVERY_GAME_CONFIG.laneChangeSeconds * 1_000)));
      const easedLaneProgress = laneProgress * laneProgress * (3 - 2 * laneProgress);
      const previousLaneX = runtime.laneX;
      if (!runtime.driveway) runtime.laneX = runtime.laneFromX + (laneTargetX(runtime.laneTarget, runtime.position) - runtime.laneFromX) * easedLaneProgress;
      const bothPressed = input.forward && input.reverse;
      const desiredSpeed = bothPressed
        ? 0
        : input.forward
          ? DELIVERY_GAME_CONFIG.forwardSpeedPerSecond * (boosting ? BOOST.speedFactor : 1)
          : input.reverse
            ? -DELIVERY_GAME_CONFIG.reverseSpeedPerSecond
            : 0;
      const changingDirection = desiredSpeed !== 0 && runtime.speed !== 0 && Math.sign(desiredSpeed) !== Math.sign(runtime.speed);
      const rate = changingDirection
        ? DELIVERY_GAME_CONFIG.directionChangeDecelerationPerSecond
        : desiredSpeed === 0
          ? DELIVERY_GAME_CONFIG.decelerationPerSecond
          : DELIVERY_GAME_CONFIG.accelerationPerSecond * (boosting ? 2 : 1);

      const slowdownActive = timestamp < runtime.slowdownUntil;
      const cappedSpeed = slowdownActive
        ? Math.sign(desiredSpeed) * Math.min(Math.abs(desiredSpeed), desiredSpeed >= 0 ? 11 : 4)
        : desiredSpeed;
      // A ramp flight keeps its launch speed: no throttle or brakes in the air.
      if (!(runtime.jumpElapsed !== null && runtime.jumpPower > 1)) runtime.speed = approach(runtime.speed, cappedSpeed, rate * deltaSeconds);
      if (Math.abs(runtime.speed) < 0.012 && desiredSpeed === 0) runtime.speed = 0;
      // Inside an unserved delivery alley, brake automatically so the bike
      // stops on the pad and the quiz opens, even if the throttle is held.
      const pendingStop = runtime.driveway && !runtime.completedStops.includes(runtime.driveway.stopIndex) ? runtime.driveway : null;
      if (pendingStop && runtime.speed !== 0) {
        const zone = getDrivewayDeliveryInterval(pendingStop.stopIndex);
        const ahead = ((zone.start + zone.end) / 2 - pendingStop.progress) * Math.sign(runtime.speed);
        const cap = Math.sqrt(2 * DELIVERY_GAME_CONFIG.deliveryAutoBrakePerSecond * Math.max(0, ahead));
        if (ahead >= 0 && Math.abs(runtime.speed) > cap) runtime.speed = Math.sign(runtime.speed) * cap;
      }
      const previousPosition = runtime.position;
      const wasInDriveway = runtime.driveway !== null;
      if (runtime.driveway) {
        const driveway = runtime.driveway;
        const length = getDrivewayLength(driveway.stopIndex);
        driveway.progress += runtime.speed * deltaSeconds;
        if (driveway.progress >= length && runtime.speed >= 0) {
          // The path ends at this exact main-road lane. Carry the small frame
          // remainder across the join without stopping or teleporting.
          const fromExit = driveway.entryEnd === "exit";
          const exitDistance = fromExit ? driveway.entryPosition : getDrivewayExitDistance(driveway.stopIndex);
          const unitsPerMeter = getRouteFrame(exitDistance + .5).position.distanceTo(getRouteFrame(exitDistance - .5).position);
          runtime.position = exitDistance + (driveway.progress - length) / unitsPerMeter;
          runtime.laneTarget = DELIVERY_STOPS[driveway.stopIndex].side === "left" ? -1 : 3;
          runtime.laneX = runtime.laneFromX = fromExit ? driveway.entryLaneX : (runtime.laneTarget - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
          runtime.laneStartedAt = timestamp;
          runtime.driveway = null;
        } else if (driveway.progress <= 0 && runtime.speed < 0) {
          const fromExit = driveway.entryEnd === "exit";
          const entrance = fromExit ? DELIVERY_STOPS[driveway.stopIndex].distance : driveway.entryPosition;
          const unitsPerMeter = getRouteFrame(entrance + .5).position.distanceTo(getRouteFrame(entrance - .5).position);
          runtime.position = entrance + driveway.progress / unitsPerMeter;
          runtime.laneTarget = DELIVERY_STOPS[driveway.stopIndex].side === "left" ? -1 : 3;
          runtime.laneX = runtime.laneFromX = fromExit ? (runtime.laneTarget - 1) * DELIVERY_GAME_CONFIG.laneSpacing : driveway.entryLaneX;
          runtime.laneStartedAt = timestamp;
          runtime.driveway = null;
        }
      } else {
        runtime.position += runtime.speed * deltaSeconds;
        const entered = enterTurnLane(runtime.position, runtime.speed, runtime.laneX);
        if (entered) {
          runtime.driveway = entered;
          runtime.turnChoice = null;
          runtime.collisionId = null;
        }
      }
      runtime.turnChoice = runtime.driveway ? null : occupiedDeliveryTurn(runtime.position, runtime.travelDirection, runtime.laneX);

      if (runtime.position <= 0) {
        runtime.position = 0;
        if (runtime.speed < 0) runtime.speed = 0;
      }

      // The existing lane controls steer into the fork. Keep the selection
      // reversible before the split, with a short forgiving entry afterward.
      const junction = ROAD_CLOSURE.junctionDistance;
      if (!runtime.driveway && runtime.position <= junction) {
        runtime.detour = runtime.laneTarget < 1 ? "left" : runtime.laneTarget > 1 ? "right" : "main";
      } else if (!runtime.driveway && runtime.detour === "main" && runtime.position <= junction + 12 && runtime.laneTarget !== 1) {
        runtime.detour = runtime.laneTarget < 1 ? "left" : "right";
      }
      if (runtime.detour !== "main") runtime.closureReached = false;

      const closureGate = ROAD_CLOSURE.distance - ROAD_CLOSURE.stopBeforeMeters;
      if (!runtime.driveway && runtime.detour === "main" && runtime.speed > 0 && runtime.position >= closureGate) {
        runtime.position = closureGate;
        runtime.speed = 0;
        runtime.closureReached = true;
        clearInputs();
      }

      if (!runtime.driveway && runtime.position >= DELIVERY_GAME_CONFIG.totalDistance) {
        runtime.position = DELIVERY_GAME_CONFIG.totalDistance;
        runtime.speed = 0;
        runtime.jumpElapsed = null;
        Object.assign(runtime, advanceDeliveryTargets(runtime));
        clearInputs();
        playSfx("deliver");
        setFrame({ ...runtime });
        setStatus("arriving");
        return;
      }

      const previousStopIndex = runtime.stopIndex;
      Object.assign(runtime, advanceDeliveryTargets(runtime));
      if (runtime.stopIndex !== previousStopIndex) runtime.stopDwell = 0;
      const deliveryIndex = runtime.driveway?.stopIndex;
      if (deliveryIndex !== undefined && !runtime.completedStops.includes(deliveryIndex)) {
        const stoppedInZone = isAtDrivewayDelivery(runtime.driveway, deliveryIndex) && Math.abs(runtime.speed) < 0.55;
        if (stoppedInZone) {
          runtime.stopIndex = deliveryIndex;
          runtime.speed = 0;
          runtime.stopDwell = 0;
          runtime.jumpElapsed = null;
          clearInputs();
          setFrame({ ...runtime });
          setStatus("quiz");
          return;
        }
        runtime.stopDwell = 0;
      } else runtime.stopDwell = 0;

      // An alley-to-main join bypasses that section of the main road; do not
      // sweep collisions across the entrance-to-exit route-coordinate jump.
      const hit = (id: string) => {
        // A softer bump than before (was 38%): with more obstacles the old
        // penalty made the ride feel like it kept jolting to a halt.
        runtime.speed *= 0.6;
        runtime.collisionId = id;
        runtime.collisionCount += 1;
        runtime.slowdownUntil = timestamp + DELIVERY_GAME_CONFIG.collisionSlowdownSeconds * 1_000;
        obstaclePassUntilRef.current.set(id, timestamp + DELIVERY_GAME_CONFIG.obstaclePassThroughSeconds * 1_000);
        runtime.boostRemaining = 0;
        runtime.usedSeconds += FRESHNESS.hitPenalty;
        showToast(runtime, `앗! −${FRESHNESS.hitPenalty}초`, "bad");
        playSfx("hit");
      };
      // Praise once per hazard when a jump carries the bike over it.
      const praise = (id: string) => {
        if (runtime.cleared.has(id)) return;
        runtime.cleared.add(id);
        showToast(runtime, "좋아!", "good", .8);
        playSfx("nice");
      };
      let jumpHeight = jumpHeightAt(runtime.jumpElapsed, runtime.jumpPower);
      if (!wasInDriveway && !runtime.driveway) {
        // The ramp is the only way over a collapsed road; it tops up speed so the flight always clears it.
        if (rampHit(previousPosition, runtime.position, runtime.laneX, runtime.detour, runtime.jumpElapsed !== null)) {
          runtime.jumpElapsed = 0; runtime.jumpPower = RAMP_POWER; jumpHeight = 0;
          runtime.speed = Math.min(RAMP_MAX_SPEED, Math.max(runtime.speed, RAMP_MIN_SPEED));
          playSfx("ramp");
        }
        const gap = gapUnder(runtime.position, runtime.detour, runtime.jumpElapsed !== null);
        if (gap) {
          runtime.fallElapsed = 0; runtime.fallRespawn = gap.start - 16; runtime.speed = 0; runtime.boostRemaining = 0;
          runtime.usedSeconds += FRESHNESS.fallPenalty;
          showToast(runtime, `도로가 무너졌어요 −${FRESHNESS.fallPenalty}초`, "bad", 1.6);
          runtime.collisionCount += 1;
          clearInputs();
          playSfx("hit");
          setFrame({ ...runtime });
          animationFrameRef.current = window.requestAnimationFrame(tick);
          return;
        }
        const section = sectionEntered(previousPosition, runtime.position);
        if (section) showToast(runtime, section.name, "info", 1.8);
        const booster = boosterHit(previousPosition, runtime.position, runtime.laneX, runtime.detour, runtime.collected);
        if (booster >= 0) {
          runtime.collected.add(booster);
          runtime.boostRemaining = BOOST.seconds;
          playSfx("boost");
        }
      }
      if (!wasInDriveway && !runtime.driveway && Math.abs(runtime.speed) > 0.01) {
        for (const obstacle of OBSTACLE_PLACEMENTS) {
          if (timestamp < (obstaclePassUntilRef.current.get(obstacle.id) ?? 0)) continue;
          const crossesObstacle = Math.min(previousPosition, runtime.position) <= obstacle.distance + DELIVERY_GAME_CONFIG.collisionHalfLength
            && Math.max(previousPosition, runtime.position) >= obstacle.distance - DELIVERY_GAME_CONFIG.collisionHalfLength;
          if (!crossesObstacle) continue;
          const stepDistance = runtime.position - previousPosition;
          const progressAcrossStep = Math.abs(stepDistance) < 0.001
            ? 0
            : Math.max(0, Math.min(1, (obstacle.distance - previousPosition) / stepDistance));
          const actualBikeX = previousLaneX + (runtime.laneX - previousLaneX) * progressAcrossStep
            + getDetourOffset(obstacle.distance, runtime.detour);
          const obstacleX = obstacleCenterX(obstacle) + getDetourOffset(obstacle.distance, obstacle.branch ?? "main");
          if (Math.abs(actualBikeX - obstacleX) >= obstacleHitHalfWidth(obstacle)) continue;
          if (clearsObstacle(obstacle.kind, jumpHeight)) { praise(obstacle.id); continue; }
          hit(obstacle.id);
          break;
        }
      }
      // Moving hazards wake as the bike reaches them; a hit only slows, as above.
      for (const mover of MOVER_PLACEMENTS) {
        if (runtime.moverStarts[mover.id] === undefined) {
          if (runtime.position < mover.trigger) continue;
          runtime.moverStarts[mover.id] = runtime.clock;
        }
        // Waiting is always safe: a stopped bike is never hit by a mover.
        if (!moverCollides(mover.kind) || runtime.driveway || Math.abs(runtime.speed) < .5 || timestamp < (obstaclePassUntilRef.current.get(mover.id) ?? 0)) continue;
        const pose = moverPose(mover, runtime.clock - runtime.moverStarts[mover.id]), shape = MOVER_SHAPE[mover.kind];
        if (pose.done || Math.abs(runtime.position - pose.distance) > shape.halfLength + DELIVERY_GAME_CONFIG.collisionHalfLength) continue;
        // Narrower than the bike's static-obstacle box on purpose: grazing is forgiven.
        if (Math.abs(runtime.laneX + getDetourOffset(pose.distance, runtime.detour) - pose.x) > shape.halfWidth + .7) continue;
        if (shape.clearance !== null && jumpHeight > shape.clearance) { praise(mover.id); continue; }
        hit(mover.id);
        break;
      }
      if (runtime.collisionId && timestamp >= (obstaclePassUntilRef.current.get(runtime.collisionId) ?? 0)) {
        runtime.collisionId = null;
      }

      // The 3D scene reads runtimeRef every frame; the HUD only needs ~12 updates/s.
      // Re-rendering the whole game tree at 60fps cost phones frame time.
      if (timestamp - lastUiCommitRef.current >= 80) {
        lastUiCommitRef.current = timestamp;
        setFrame({ ...runtime });
      }
      animationFrameRef.current = window.requestAnimationFrame(tick);
    };

    lastFrameRef.current = null;
    animationFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
      lastFrameRef.current = null;
    };
  }, [clearInputs, paused, status]);

  useEffect(() => {
    if (status !== "arriving" || paused) return;
    const completionTimer = window.setTimeout(() => setStatus("completed"), 1_900);
    return () => window.clearTimeout(completionTimer);
  }, [paused, status]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]).has(event.code)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (status !== "playing" || paused) return;
      event.preventDefault();
      if (event.code === "Space") {
        if (!event.repeat) jump();
        return;
      }
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        if (!event.repeat) moveLane(event.code === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.code === "ArrowUp") keyInputsRef.current.forward = true;
      if (event.code === "ArrowDown") keyInputsRef.current.reverse = true;
      syncDriveInput();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"]).has(event.code)) return;
      if (status === "playing" && !paused) event.preventDefault();
      if (event.code === "ArrowUp") keyInputsRef.current.forward = false;
      if (event.code === "ArrowDown") keyInputsRef.current.reverse = false;
      syncDriveInput();
    };
    const handleBlur = () => clearInputs();
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    window.addEventListener("keyup", handleKeyUp, { passive: false });
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, [clearInputs, jump, moveLane, paused, status, syncDriveInput]);

  useEffect(() => {
    const handleVisibility = () => {
      if (!document.hidden) return;
      clearInputs();
      if (status === "playing" || status === "arriving") {
        runtimeRef.current.speed = 0;
        setFrame({ ...runtimeRef.current });
        setPaused(true);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [clearInputs, status]);

  useEffect(() => {
    if (status !== "playing" || paused) clearInputs();
  }, [clearInputs, paused, status]);

  useEffect(() => {
    if ((status === "playing" || status === "quiz") && !paused && soundOn) startMusic(); else stopMusic();
    return stopMusic;
  }, [paused, soundOn, status]);

  const togglePause = () => {
    clearInputs();
    unlockSound();
    if (!paused) {
      runtimeRef.current.speed = 0;
      setFrame({ ...runtimeRef.current });
    }
    setPaused((current) => !current);
  };

  const nextStop = DELIVERY_STOPS[frame.stopIndex];
  const totalDeliveries = DELIVERY_STOPS.length + 1;
  // Count completed handoffs, including the final destination after its animation.
  const completedDeliveries = completedDeliveryCount(frame.completedStops, status === "completed");
  const freshness = freshnessLeft(frame.usedSeconds);
  const canPause = status === "playing" || status === "arriving";
  const navigation = getDeliveryNavigation(frame, status === "arriving");
  const NavigationIcon = { forward: ArrowUp, left: ArrowLeft, right: ArrowRight, reverse: ArrowDown, fork: GitFork, stop: Pause, delivery: PackageCheck, complete: Check }[navigation.direction];

  return (
    <main className={styles.pageShell}>
      <section
        className={styles.gameFrame}
        aria-label="몽글몽글 3D 자전거 배달 게임"
        data-game-status={status}
        data-delivery-brand={selectedBrand ?? ""}
        data-quiz-passed={frame.quizPassedStops.length}
        data-completed-stops={frame.completedStops.join(",")}
        data-skipped-stops={frame.skippedStops.join(",")}
        data-position={frame.position.toFixed(2)}
        data-speed={frame.speed.toFixed(2)}
        data-lane={frame.laneTarget}
        data-lane-x={frame.laneX.toFixed(3)}
        data-travel-direction={frame.travelDirection}
        data-turn-choice={frame.turnChoice ? `${frame.turnChoice.stopIndex}:${frame.turnChoice.entryEnd}` : ""}
        data-collision-count={frame.collisionCount}
        data-jumping={frame.jumpElapsed !== null ? "true" : "false"}
        data-falling={frame.fallElapsed !== null ? "true" : "false"}
        data-slowdown-active={frame.slowdownUntil > performance.now() ? "true" : "false"}
        data-stop-index={frame.stopIndex}
        data-stop-dwell={frame.stopDwell.toFixed(3)}
        data-delivery-pulse={frame.deliveryPulse}
        data-delivery-success-remaining={frame.deliverySuccessRemaining.toFixed(3)}
        data-detour={frame.detour}
        data-closure-reached={frame.closureReached ? "true" : "false"}
        data-driveway-index={frame.driveway?.stopIndex ?? -1}
        data-driveway-entry={frame.driveway?.entryEnd ?? "entrance"}
        data-driveway-progress={(frame.driveway?.progress ?? 0).toFixed(3)}
        data-driveway-length={frame.driveway ? getDrivewayLength(frame.driveway.stopIndex).toFixed(3) : 0}
        data-delivery-zone-start={frame.driveway ? getDrivewayDeliveryInterval(frame.driveway.stopIndex).start.toFixed(3) : 0}
        data-delivery-zone-end={frame.driveway ? getDrivewayDeliveryInterval(frame.driveway.stopIndex).end.toFixed(3) : 0}
      >
        <header className={navStyles.hud} data-navigation-hud aria-label="배달 길안내">
          <div className={navStyles.card}>
          <div className={navStyles.row} data-delivery-phase={navigation.phase} data-navigation-direction={navigation.direction}>
            <div className={navStyles.icon} aria-hidden="true"><NavigationIcon /></div>
            <div className={navStyles.copy}>
              <strong data-navigation-instruction>{navigation.instruction}</strong>
              <span data-navigation-destination>{navigation.destination}</span>
            </div>
            <div className={navStyles.distance} title="현재 경로를 따라 배달 구역까지 남은 거리">
              <strong data-navigation-remaining aria-label={`${navigation.destination} 배달 구역까지 ${navigation.remaining}미터`}>{navigation.remaining.toLocaleString("ko-KR")}<small>m</small></strong>
            </div>
            {canPause && (
              <button
                className={navStyles.pause}
                type="button"
                onPointerDown={() => { pauseTouchHandledRef.current = false; }}
                onPointerUp={(event) => {
                  // Some mobile browsers do not synthesize a click for a
                  // second finger while the first is holding the joystick.
                  if (event.pointerType !== "touch" || event.isPrimary) return;
                  const bounds = event.currentTarget.getBoundingClientRect();
                  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) return;
                  event.preventDefault();
                  pauseTouchHandledRef.current = true;
                  togglePause();
                }}
                onClick={(event) => {
                  // Keep mouse/keyboard clicks; avoid double toggling in
                  // browsers that also emit a click after that second touch.
                  if (!pauseTouchHandledRef.current || event.detail === 0) togglePause();
                  pauseTouchHandledRef.current = false;
                }}
                aria-label={paused ? "배달 계속하기" : "게임 일시정지"}
              >
                {paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
              </button>
            )}
          </div>
          <div className={navStyles.progress}>
            <span>배달 {completedDeliveries} / {totalDeliveries}</span>
            <div className={navStyles.segments} role="progressbar" aria-label="배달 완료 수" aria-valuemin={0} aria-valuemax={totalDeliveries} aria-valuenow={completedDeliveries}>
              {Array.from({ length: totalDeliveries }, (_, index) => <i key={index} data-state={index < completedDeliveries ? "complete" : "pending"} />)}
            </div>
          </div>
          <div className={navStyles.freshness} data-freshness-level={freshness >= .5 ? "high" : freshness >= .25 ? "mid" : "low"}>
            <span>우유 신선도</span>
            <div role="progressbar" aria-label="우유 신선도" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(freshness * 100)}><i style={{ width: `${freshness * 100}%` }} /></div>
          </div>
          </div>
          <span className={styles.screenReaderOnly} role="status" aria-live="polite" aria-atomic="true">{navigation.instruction}. {navigation.destination}</span>
        </header>

        <div className={styles.playArea} data-control-hand={controlHand}>
          {status === "playing" && (
            <div className={styles.rideStats}>
              {frame.toast && <strong key={frame.toast.id} className={styles.toastBadge} data-kind={frame.toast.kind}>{frame.toast.text}</strong>}
              {frame.boostRemaining > 0 && <strong className={styles.boostBadge}>우유 부스터!</strong>}
            </div>
          )}
          {status === "playing" && frame.toast?.kind === "good" && <span key={`spark-${frame.toast.id}`} className={styles.sparkle} aria-hidden="true">{Array.from({ length: 8 }, (_, n) => <i key={n} style={{ "--a": `${n * 45}deg` } as CSSProperties} />)}</span>}
          <DeliveryScene3D
            position={frame.position}
            speed={frame.speed}
            paused={paused}
            playing={status === "playing"}
            arriving={status === "arriving"}
            sessionKey={sessionKey}
            laneX={frame.laneX}
            collisionId={frame.collisionId}
            detour={frame.detour}
            deliveryBrand={deliveryBrand}
            stopIndex={frame.stopIndex}
            stopDwell={frame.stopDwell}
            deliveryPulse={frame.deliveryPulse}
            deliverySuccessRemaining={frame.deliverySuccessRemaining}
            driveway={frame.driveway}
            guidanceReplay={guidanceReplay}
            closureReached={frame.closureReached}
            travelDirection={frame.travelDirection}
            turnChoice={frame.turnChoice}
            completedStops={frame.completedStops}
            jumpHeight={jumpHeightAt(frame.jumpElapsed, frame.jumpPower)}
            liveRef={runtimeRef}
          />

          <DeliveryJoystick ref={joystickRef} disabled={status !== "playing" || paused} steeringDisabled={frame.driveway !== null} onDrive={handleJoystickDrive} onLane={moveLane} />
          {status === "playing" && !paused && (
            <button
              className={styles.jumpZone}
              type="button"
              aria-label="점프 (이 쪽 화면 아무 곳이나 탭)"
              data-jump-zone
              data-airborne={frame.jumpElapsed !== null}
              // Its own pointer target, so the steering thumb is never interrupted.
              onPointerDown={(event) => { event.preventDefault(); jump(); }}
              onClick={(event) => { if (event.detail === 0) jump(); }}
              onContextMenu={(event) => event.preventDefault()}
            >
              <span className={styles.jumpButton} data-jump-button aria-hidden="true"><ChevronsUp /></span>
            </button>
          )}
        </div>

        {status === "ready" && <DeliveryBrandStart selected={selectedBrand} onSelect={setSelectedBrand} onStart={startGame} />}

        {paused && canPause && <DeliveryPauseMenu stopIndex={frame.stopIndex} controlHand={controlHand} onControlHand={changeControlHand} soundOn={soundOn} onToggleSound={toggleSound} onResume={() => setPaused(false)} onRestart={returnToStart} onReplay={() => { clearInputs(); setGuidanceReplay(value => value + 1); setPaused(false); }} />}

        {status === "quiz" && nextStop && <DeliveryBrandQuiz key={frame.stopIndex} brand={deliveryBrand} stopIndex={frame.stopIndex} address={nextStop.address} onCorrect={completeQuiz} />}
        {status === "completed" && <DeliveryPurchaseAd brand={deliveryBrand} completedDeliveries={completedDeliveries} freshness={freshness} stars={starsFor(freshness, completedDeliveries, totalDeliveries)} onRestart={returnToStart} />}
      </section>
    </main>
  );
}
