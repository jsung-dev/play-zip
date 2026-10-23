"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, GitFork, PackageCheck, Pause, Play, Trophy } from "lucide-react";
import { DELIVERY_BRANDS, DELIVERY_GAME_CONFIG, OBSTACLE_PLACEMENTS } from "@/data/delivery-game";
import type { DeliveryChoiceId } from "@/data/delivery-campaign";
import { DELIVERY_STOPS, getDetourOffset, ROAD_CLOSURE, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { DeliveryScene3D } from "./DeliveryScene3D";
import { DeliveryBrandQuiz, DeliveryBrandStart, DeliveryChallengeOver, DeliveryPurchaseAd } from "./DeliveryCampaign";
import { CHALLENGE, challengeSpeedFactor, heartsLeft, readBest, saveBest, type GameMode } from "./delivery-challenge";
import { DeliveryPauseMenu } from "./DeliveryPauseMenu";
import { getDeliveryNavigation } from "./delivery-navigation";
import { duckWalkSeconds, DUCK } from "./three/duck-resident";
import { DRIVE_BY, driveByPhase, hasArrived, metersToStop } from "./delivery-driveby";
import { advanceDeliveryTargets, completedDeliveryCount } from "./delivery-progress";
import { nextDeliveryLane, settledDeliveryLane, laneTargetX, type TravelDirection, type TurnChoice } from "./delivery-turns";
import { DeliverySwipe } from "./DeliverySwipe";
import type { SwipeAction } from "./delivery-swipe";
import { clearsObstacle, DUCK_SECONDS, jumpDuration, jumpHeightAt, obstacleCenterX, obstacleHitHalfWidth, RAMP_POWER, SLAM_RATE, slamElapsed } from "./delivery-jump";
import { sectionEntered, starsFor } from "./delivery-course";
import { BOOST, boosterHit, FALL_SECONDS, gapUnder, RAMP_MAX_SPEED, RAMP_MIN_SPEED, rampHit } from "./delivery-pickups";
import { MOVER_PLACEMENTS, MOVER_SHAPE, moverCollides, moverPose, snapToLane, TIMED } from "./delivery-movers";
import { musicEnabled, playSfx, setMusicEnabled, setSoundEnabled, soundEnabled, startMusic, stopMusic, unlockSound } from "./delivery-sound";
import { applyCourse, generateCourse } from "./delivery-random-course";
import styles from "./DeliveryGame.module.css";
import navStyles from "./DeliveryNavigation.module.css";

type GameStatus = "ready" | "playing" | "quiz" | "arriving" | "completed" | "gameover";

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
  driveway: DrivewayState | null;
  travelDirection: TravelDirection;
  turnChoice: TurnChoice | null;
  jumpElapsed: number | null;
  duckElapsed: number | null;
  clock: number;
  moverStarts: Record<string, number>;
  moverTargets: Record<string, number>;
  jumpPower: number;
  jumpSlam: boolean;
  collected: Set<number>;
  fallElapsed: number | null;
  fallRespawn: number;
  toast: { text: string; kind: "good" | "bad" | "info"; until: number; id: number } | null;
  cleared: Set<string>;
  boostRemaining: number;
};


const makeRuntime = (): RuntimeState => ({ position: 0, speed: 0, laneX: 0, laneFromX: 0, laneTarget: 1, laneStartedAt: 0, collisionId: null, collisionCount: 0, slowdownUntil: 0, stopIndex: 0, quizPassedStops: [], completedStops: [], skippedStops: [], stopDwell: 0, deliveryPulse: 0, deliverySuccessRemaining: 0, detour: "main", driveway: null, travelDirection: 1, turnChoice: null, jumpElapsed: null, duckElapsed: null, clock: 0, moverStarts: {}, moverTargets: {}, jumpPower: 1, jumpSlam: false, collected: new Set(), boostRemaining: 0, fallElapsed: null, fallRespawn: 0, toast: null, cleared: new Set() });

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
  const pauseTouchHandledRef = useRef(false);
  const obstaclePassUntilRef = useRef(new Map<string, number>());
  const [frame, setFrame] = useState<RuntimeState>(() => ({ ...runtimeRef.current }));
  const [status, setStatus] = useState<GameStatus>("ready");
  const [paused, setPaused] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [courseSeed, setCourseSeed] = useState(0);
  // Challenge mode: no stops or quiz; laps of fresh random courses, faster each lap, until the hearts run out.
  const [mode, setMode] = useState<GameMode>("brand");
  const modeRef = useRef<GameMode>("brand"); modeRef.current = mode;
  const lapRef = useRef(0);
  const [best, setBest] = useState(0);
  useEffect(() => setBest(readBest()), []);
  const [guidanceReplay, setGuidanceReplay] = useState(0);
  const [soundOn, setSoundOn] = useState(true);
  const [musicOn, setMusicOn] = useState(true);
  useEffect(() => { setSoundOn(soundEnabled()); setMusicOn(musicEnabled()); }, []);
  const toggleMusic = useCallback(() => {
    const next = !musicEnabled();
    setMusicEnabled(next); setMusicOn(next);
    if (next) unlockSound();
  }, []);
  const toggleSound = useCallback(() => {
    const next = !soundEnabled();
    setSoundEnabled(next); setSoundOn(next);
    if (next) unlockSound();
  }, []);
  const clearInputs = useCallback(() => {
    runtimeRef.current.turnChoice = null;
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

  // Picking a milk starts the ride at once; there is no separate start button.
  const startGame = useCallback((brand: DeliveryChoiceId) => {
    unlockSound();
    setSelectedBrand(brand);
    // Every ride gets its own obstacle layout (rules in delivery-random-course.ts).
    const seed = Math.floor(Math.random() * 2 ** 31);
    applyCourse(generateCourse(seed));
    setCourseSeed(seed);
    lapRef.current = 0;
    resetRuntime();
    setSessionKey((current) => current + 1);
    setStatus("playing");
  }, [resetRuntime]);

  const returnToStart = useCallback(() => {
    resetRuntime();
    setSelectedBrand(null);
    setStatus("ready");
  }, [resetRuntime]);

  const completeQuiz = useCallback(() => {
    const runtime = runtimeRef.current;
    const index = runtime.stopIndex;
    if (status !== "quiz" || runtime.completedStops.includes(index)) return;
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
    if (runtime.stopDwell > 0) return; // stopped for the duck: stay in your lane
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
    if (runtime.jumpElapsed !== null || runtime.duckElapsed !== null || runtime.fallElapsed !== null) return;
    runtime.jumpElapsed = 0;
    runtime.jumpPower = 1;
    runtime.jumpSlam = false;
    playSfx("jump");
    setFrame({ ...runtime });
  }, [paused, status]);

  const duck = useCallback(() => {
    if (status !== "playing" || paused) return;
    const runtime = runtimeRef.current;
    if (runtime.jumpElapsed !== null && runtime.jumpPower === 1 && !runtime.jumpSlam && runtime.fallElapsed === null) {
      // Down-swipe in the air: drop straight to the road.
      runtime.jumpSlam = true;
      runtime.jumpElapsed = slamElapsed(runtime.jumpElapsed);
      showToast(runtime, "급하강!", "good", .8);
      setFrame({ ...runtime });
      return;
    }
    if (runtime.duckElapsed !== null || runtime.jumpElapsed !== null || runtime.fallElapsed !== null) return;
    runtime.duckElapsed = 0;
    playSfx("land");
    setFrame({ ...runtime });
  }, [paused, status]);

  const handleSwipe = useCallback((action: SwipeAction) => {
    if (action === "left") moveLane(-1);
    else if (action === "right") moveLane(1);
    else if (action === "jump") jump();
    else duck();
  }, [duck, jump, moveLane]);

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
      if (runtime.toast && runtime.clock > runtime.toast.until) runtime.toast = null;
      runtime.boostRemaining = Math.max(0, runtime.boostRemaining - deltaSeconds);
      if (runtime.fallElapsed !== null) {
        // Fell into a collapsed road: drop out of sight, then respawn before the gap.
        runtime.fallElapsed += deltaSeconds;
        if (runtime.fallElapsed >= FALL_SECONDS) {
          Object.assign(runtime, { fallElapsed: null, position: runtime.fallRespawn, speed: 0, laneTarget: 1, laneX: 0, laneFromX: 0, laneStartedAt: timestamp, jumpElapsed: null, duckElapsed: null, collisionId: null });
          clearInputs();
          setFrame({ ...runtime });
        }
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }
      const boosting = runtime.boostRemaining > 0;
      if (runtime.jumpElapsed !== null) {
        runtime.jumpElapsed += deltaSeconds * (runtime.jumpSlam ? SLAM_RATE : 1);
        if (runtime.jumpElapsed >= jumpDuration(runtime.jumpPower)) {
          if (runtime.jumpPower > 1) { showToast(runtime, "착지 성공!", "good"); playSfx("nice"); } else playSfx("land");
          runtime.jumpElapsed = null;
        }
      }
      if (runtime.duckElapsed !== null) {
        runtime.duckElapsed += deltaSeconds;
        if (runtime.duckElapsed >= DUCK_SECONDS) runtime.duckElapsed = null;
      }
      const settledLane = settledDeliveryLane(runtime.position, runtime.laneTarget);
      if (settledLane !== runtime.laneTarget) {
        runtime.laneFromX = runtime.laneX;
        runtime.laneTarget = settledLane;
        runtime.laneStartedAt = timestamp;
      }
      const laneProgress = Math.min(1, Math.max(0, (timestamp - runtime.laneStartedAt) / (DELIVERY_GAME_CONFIG.laneChangeSeconds * 1_000)));
      const easedLaneProgress = laneProgress * laneProgress * (3 - 2 * laneProgress);
      const previousLaneX = runtime.laneX;
      runtime.laneX = runtime.laneFromX + (laneTargetX(runtime.laneTarget, runtime.position) - runtime.laneFromX) * easedLaneProgress;
      // Always rolling forward; the rider only steers, jumps and ducks.
      const challenge = modeRef.current === "challenge";
      const desiredSpeed = DELIVERY_GAME_CONFIG.forwardSpeedPerSecond * (boosting ? BOOST.speedFactor : 1) * (challenge ? challengeSpeedFactor(lapRef.current) : 1);
      const rate = DELIVERY_GAME_CONFIG.accelerationPerSecond * (boosting ? 2 : 1);

      const slowdownActive = timestamp < runtime.slowdownUntil;
      const cappedSpeed = slowdownActive
        ? Math.min(desiredSpeed, 11)
        : desiredSpeed;
      // A ramp flight keeps its launch speed: no throttle or brakes in the air.
      if (!(runtime.jumpElapsed !== null && runtime.jumpPower > 1)) runtime.speed = approach(runtime.speed, cappedSpeed, rate * deltaSeconds);
      // The bike stays put while the duck walks over (stopDwell counts that wait).
      if (runtime.stopDwell > 0) runtime.speed = 0;
      // Brake gently so the bike stops beside the house of the pending delivery.
      if (!challenge && runtime.stopIndex < DELIVERY_STOPS.length && !runtime.completedStops.includes(runtime.stopIndex) && runtime.speed > 0
        && !(runtime.jumpElapsed !== null && runtime.jumpPower > 1)) {
        const cap = Math.sqrt(2 * DRIVE_BY.brake * metersToStop(runtime.position, runtime.stopIndex));
        if (driveByPhase(runtime.position, runtime.stopIndex) === "warn" && runtime.speed > cap) runtime.speed = cap;
      }
      const previousPosition = runtime.position;
      runtime.position += runtime.speed * deltaSeconds;

      if (runtime.position <= 0) {
        runtime.position = 0;
        if (runtime.speed < 0) runtime.speed = 0;
      }

      // All three roads at the fork are open: the lane before the split picks left / middle / right.
      // Until the roads visibly part, a lane change still moves to the neighbouring road;
      // shifting the eased lane start keeps the bike's world position continuous.
      if (runtime.position <= ROAD_CLOSURE.junctionDistance + ROAD_CLOSURE.switchMeters) {
        const detour: DetourChoice = runtime.laneTarget < 1 ? "left" : runtime.laneTarget > 1 ? "right" : "main";
        if (detour !== runtime.detour) {
          const shift = getDetourOffset(runtime.position, runtime.detour) - getDetourOffset(runtime.position, detour);
          runtime.laneX += shift; runtime.laneFromX += shift; runtime.detour = detour;
        }
      }

      // shortcut: a lap restarts the same 1 km road with a new random course (and rebuilds the scene); an endless generated road replaces this later.
      if (challenge && runtime.position >= DELIVERY_GAME_CONFIG.totalDistance) {
        lapRef.current += 1;
        const seed = Math.floor(Math.random() * 2 ** 31);
        applyCourse(generateCourse(seed));
        setCourseSeed(seed);
        Object.assign(runtime, { position: 0, detour: "main", moverStarts: {}, moverTargets: {}, collected: new Set(), cleared: new Set(), jumpElapsed: null, duckElapsed: null });
        obstaclePassUntilRef.current.clear();
        showToast(runtime, `${lapRef.current + 1}바퀴째 · 더 빨라져요!`, "info", 1.8);
      }
      if (runtime.position >= DELIVERY_GAME_CONFIG.totalDistance) {
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
      if (!challenge && runtime.stopIndex < DELIVERY_STOPS.length && !runtime.completedStops.includes(runtime.stopIndex)) {
        if (runtime.stopDwell > 0) {
          runtime.stopDwell += deltaSeconds;
          const side = DELIVERY_STOPS[runtime.stopIndex].side === "left" ? -1 : 1;
          const walk = duckWalkSeconds(side * DUCK.restU, runtime.laneX + side * DUCK.meetGap);
          if (runtime.stopDwell >= walk) {
            runtime.stopDwell = walk;
            clearInputs();
            setFrame({ ...runtime });
            setStatus("quiz");
            return;
          }
        } else if (hasArrived(runtime.position, runtime.stopIndex, runtime.speed)) {
          runtime.stopDwell = .001;
          runtime.speed = 0;
          runtime.jumpElapsed = null;
          showToast(runtime, "배달지 도착!", "good", 1.2);
          playSfx("land");
        }
      }

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
        showToast(runtime, "앗! 부딪혔어요", "bad");
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
      {
        // The ramp is the only way over a collapsed road; it tops up speed so the flight always clears it.
        if (rampHit(previousPosition, runtime.position, runtime.laneX, runtime.detour, runtime.jumpElapsed !== null)) {
          runtime.jumpElapsed = 0; runtime.jumpPower = RAMP_POWER; runtime.jumpSlam = false; jumpHeight = 0;
          runtime.speed = Math.min(RAMP_MAX_SPEED, Math.max(runtime.speed, RAMP_MIN_SPEED));
          playSfx("ramp");
        }
        const gap = gapUnder(runtime.position, runtime.detour, runtime.jumpElapsed !== null);
        if (gap) {
          runtime.fallElapsed = 0; runtime.fallRespawn = gap.start - 16; runtime.speed = 0; runtime.boostRemaining = 0;
          showToast(runtime, "도로가 무너졌어요!", "bad", 1.6);
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
      if (Math.abs(runtime.speed) > 0.01) {
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
          if (clearsObstacle(obstacle.kind, jumpHeight, runtime.duckElapsed !== null)) { praise(obstacle.id); continue; }
          hit(obstacle.id);
          break;
        }
      }
      // Moving hazards wake as the bike reaches them; a hit only slows, as above.
      for (const mover of MOVER_PLACEMENTS) {
        if (!TIMED.has(mover.kind) && runtime.moverStarts[mover.id] === undefined) {
          if (runtime.position < mover.trigger || (mover.branch && mover.branch !== runtime.detour)) continue;
          runtime.moverStarts[mover.id] = runtime.clock;
          runtime.moverTargets[mover.id] = snapToLane(runtime.laneX);
        }
        if (mover.branch && mover.branch !== runtime.detour) continue;
        // Waiting is always safe: a stopped bike is never hit by a mover.
        if (!moverCollides(mover.kind) || Math.abs(runtime.speed) < .5 || timestamp < (obstaclePassUntilRef.current.get(mover.id) ?? 0)) continue;
        const pose = moverPose(mover, runtime.clock, runtime.moverStarts[mover.id], runtime.moverTargets[mover.id]), shape = MOVER_SHAPE[mover.kind];
        if (pose.done || !pose.live || Math.abs(runtime.position - pose.distance) > shape.halfLength + DELIVERY_GAME_CONFIG.collisionHalfLength) continue;
        // Branch movers use lane-relative x; main-road ones compare in main-road coordinates.
        const bikeX = mover.branch ? runtime.laneX : runtime.laneX + getDetourOffset(pose.distance, runtime.detour);
        // Narrower than the bike's static-obstacle box on purpose: grazing is forgiven.
        if (Math.abs(bikeX - pose.x) > shape.halfWidth + .7) continue;
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
    const keys: Record<string, SwipeAction> = { ArrowLeft: "left", ArrowRight: "right", ArrowUp: "jump", Space: "jump", ArrowDown: "duck" };
    const handleKeyDown = (event: KeyboardEvent) => {
      const action = keys[event.code];
      if (!action) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (status !== "playing" || paused) return;
      event.preventDefault();
      if (!event.repeat) handleSwipe(action);
    };
    window.addEventListener("keydown", handleKeyDown, { passive: false });
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSwipe, paused, status]);

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

  const challengeMeters = lapRef.current * DELIVERY_GAME_CONFIG.totalDistance + frame.position;
  useEffect(() => {
    if (mode !== "challenge" || status !== "playing" || heartsLeft(frame.collisionCount) > 0) return;
    runtimeRef.current.speed = 0;
    setBest(saveBest(lapRef.current * DELIVERY_GAME_CONFIG.totalDistance + runtimeRef.current.position));
    setStatus("gameover");
  }, [frame.collisionCount, mode, status]);

  useEffect(() => {
    // No cleanup here: quiz -> playing must keep the running tune instead of restarting it.
    if ((status === "playing" || status === "quiz") && !paused && musicOn) startMusic(); else stopMusic();
  }, [musicOn, paused, status]);
  useEffect(() => stopMusic, []);

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
        data-course-seed={courseSeed}
        data-mode={mode}
        data-hearts={heartsLeft(frame.collisionCount)}
        data-detour={frame.detour}
        data-drive-by={driveByPhase(frame.position, frame.stopIndex)}
      >
        <header className={navStyles.hud} data-navigation-hud aria-label="배달 길안내">
          <div className={navStyles.card}>
          <div className={navStyles.row} data-delivery-phase={navigation.phase} data-navigation-direction={navigation.direction}>
            {mode === "challenge" ? <>
              <div className={navStyles.icon} aria-hidden="true"><Trophy /></div>
              <div className={navStyles.copy}>
                <strong>챌린지</strong>
                <span>최고 {best.toLocaleString("ko-KR")}m</span>
              </div>
              <div className={navStyles.distance} title="달린 거리">
                <strong data-challenge-meters aria-label={`${Math.floor(challengeMeters)}미터 달림`}>{Math.floor(challengeMeters).toLocaleString("ko-KR")}<small>m</small></strong>
              </div>
            </> : <>
            <div className={navStyles.icon} aria-hidden="true"><NavigationIcon /></div>
            <div className={navStyles.copy}>
              <strong data-navigation-instruction>{navigation.instruction}</strong>
              <span data-navigation-destination>{navigation.destination}</span>
            </div>
            <div className={navStyles.distance} title="현재 경로를 따라 배달 구역까지 남은 거리">
              <strong data-navigation-remaining aria-label={`${navigation.destination} 배달 구역까지 ${navigation.remaining}미터`}>{navigation.remaining.toLocaleString("ko-KR")}<small>m</small></strong>
            </div>
            </>}
            {canPause && (
              <button
                className={navStyles.pause}
                type="button"
                onPointerDown={() => { pauseTouchHandledRef.current = false; }}
                onPointerUp={(event) => {
                  // Some mobile browsers do not synthesize a click for a
                  // second finger while another finger is on the screen.
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
          {mode === "challenge" ? <div className={navStyles.progress} role="img" aria-label={`하트 ${heartsLeft(frame.collisionCount)}개 남음`}>
            <span>하트</span>
            <div className={navStyles.segments}>
              {Array.from({ length: CHALLENGE.hearts }, (_, index) => <i key={index} data-state={index < heartsLeft(frame.collisionCount) ? "complete" : "pending"} />)}
            </div>
          </div> : <div className={navStyles.progress}>
            <span>배달 {completedDeliveries} / {totalDeliveries}</span>
            <div className={navStyles.segments} role="progressbar" aria-label="배달 완료 수" aria-valuemin={0} aria-valuemax={totalDeliveries} aria-valuenow={completedDeliveries}>
              {Array.from({ length: totalDeliveries }, (_, index) => <i key={index} data-state={index < completedDeliveries ? "complete" : "pending"} />)}
            </div>
          </div>}
          </div>
          <span className={styles.screenReaderOnly} role="status" aria-live="polite" aria-atomic="true">{navigation.instruction}. {navigation.destination}</span>
        </header>

        <div className={styles.playArea}>
          {status === "playing" && (
            <div className={styles.rideStats}>
              {frame.toast && <strong key={frame.toast.id} className={styles.toastBadge} data-kind={frame.toast.kind}>{frame.toast.text}</strong>}
              {frame.boostRemaining > 0 && <strong className={styles.boostBadge}>우유 부스터!</strong>}
            </div>
          )}
          <DeliveryScene3D
            position={frame.position}
            speed={frame.speed}
            paused={paused}
            playing={status === "playing"}
            arriving={status === "arriving"}
            sessionKey={sessionKey}
            courseSeed={courseSeed}
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
            travelDirection={frame.travelDirection}
            turnChoice={frame.turnChoice}
            completedStops={frame.completedStops}
            jumpHeight={jumpHeightAt(frame.jumpElapsed, frame.jumpPower)}
            liveRef={runtimeRef}
          />

          <DeliverySwipe disabled={status !== "playing" || paused} onAction={handleSwipe} />
        </div>

        {status === "ready" && <DeliveryBrandStart onStart={startGame} mode={mode} onMode={setMode} best={best} />}
        {status === "gameover" && <DeliveryChallengeOver meters={challengeMeters} best={best} onRetry={() => startGame(selectedBrand!)} /* set by the ride that just ended */ onHome={returnToStart} />}

        {paused && canPause && <DeliveryPauseMenu stopIndex={frame.stopIndex} soundOn={soundOn} onToggleSound={toggleSound} musicOn={musicOn} onToggleMusic={toggleMusic} onResume={() => setPaused(false)} onRestart={returnToStart} onReplay={() => { clearInputs(); setGuidanceReplay(value => value + 1); setPaused(false); }} />}

        {status === "quiz" && nextStop && <DeliveryBrandQuiz key={frame.stopIndex} brand={deliveryBrand} stopIndex={frame.stopIndex} address={nextStop.address} onCorrect={completeQuiz} />}
        {status === "completed" && <DeliveryPurchaseAd brand={deliveryBrand} completedDeliveries={completedDeliveries} hits={frame.collisionCount} stars={starsFor(frame.collisionCount, completedDeliveries, totalDeliveries)} onRestart={returnToStart} />}
      </section>
    </main>
  );
}
