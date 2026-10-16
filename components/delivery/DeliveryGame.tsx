"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, GitFork, PackageCheck, Pause, Play } from "lucide-react";
import { DELIVERY_BRANDS, DELIVERY_GAME_CONFIG, OBSTACLE_PLACEMENTS } from "@/data/delivery-game";
import type { DeliveryChoiceId } from "@/data/delivery-campaign";
import { DELIVERY_STOPS, ROAD_CLOSURE, getDetourOffset, getDrivewayLength, getDrivewayExitDistance, getDrivewayDeliveryInterval, getRouteFrame, isAtDrivewayDelivery, type DetourChoice, type DrivewayState } from "@/data/delivery-map";
import { DeliveryScene3D } from "./DeliveryScene3D";
import { DeliveryBrandQuiz, DeliveryBrandStart, DeliveryPurchaseAd } from "./DeliveryCampaign";
import { DeliveryPauseMenu } from "./DeliveryPauseMenu";
import { getDeliveryNavigation } from "./delivery-navigation";
import { advanceDeliveryTargets, completedDeliveryCount } from "./delivery-progress";
import { DeliveryJoystick, type DeliveryJoystickHandle } from "./DeliveryJoystick";
import type { JoystickDrive } from "./delivery-joystick";
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
};

type DriveInput = {
  forward: boolean;
  reverse: boolean;
};

const makeRuntime = (): RuntimeState => ({ position: 0, speed: 0, laneX: 0, laneFromX: 0, laneTarget: 1, laneStartedAt: 0, collisionId: null, collisionCount: 0, slowdownUntil: 0, stopIndex: 0, quizPassedStops: [], completedStops: [], skippedStops: [], stopDwell: 0, deliveryPulse: 0, deliverySuccessRemaining: 0, detour: "main", closureReached: false, driveway: null });

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
    if (status !== "quiz" || runtime.quizPassedStops.includes(runtime.stopIndex)) return;
    runtime.quizPassedStops = [...runtime.quizPassedStops, runtime.stopIndex];
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
    const nextTarget = Math.max(0, Math.min(2, runtime.laneTarget + direction));
    if (nextTarget === runtime.laneTarget) return;
    runtime.laneFromX = runtime.laneX;
    runtime.laneTarget = nextTarget;
    runtime.laneStartedAt = performance.now();
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
      const input = driveInputRef.current;
      const laneProgress = Math.min(1, Math.max(0, (timestamp - runtime.laneStartedAt) / (DELIVERY_GAME_CONFIG.laneChangeSeconds * 1_000)));
      const easedLaneProgress = laneProgress * laneProgress * (3 - 2 * laneProgress);
      const previousLaneX = runtime.laneX;
      if (!runtime.driveway) runtime.laneX = runtime.laneFromX + ((runtime.laneTarget - 1) * DELIVERY_GAME_CONFIG.laneSpacing - runtime.laneFromX) * easedLaneProgress;
      const bothPressed = input.forward && input.reverse;
      const nextStop = DELIVERY_STOPS[runtime.stopIndex];
      const entranceLane = nextStop?.side === "left" ? 0 : 2;
      const desiredSpeed = bothPressed
        ? 0
        : input.forward
          ? DELIVERY_GAME_CONFIG.forwardSpeedPerSecond
          : input.reverse
            ? -DELIVERY_GAME_CONFIG.reverseSpeedPerSecond
            : 0;
      const changingDirection = desiredSpeed !== 0 && runtime.speed !== 0 && Math.sign(desiredSpeed) !== Math.sign(runtime.speed);
      const rate = changingDirection
        ? DELIVERY_GAME_CONFIG.directionChangeDecelerationPerSecond
        : desiredSpeed === 0
          ? DELIVERY_GAME_CONFIG.decelerationPerSecond
          : DELIVERY_GAME_CONFIG.accelerationPerSecond;

      const slowdownActive = timestamp < runtime.slowdownUntil;
      const cappedSpeed = slowdownActive
        ? Math.sign(desiredSpeed) * Math.min(Math.abs(desiredSpeed), desiredSpeed >= 0 ? 7.5 : 3.5)
        : desiredSpeed;
      runtime.speed = approach(runtime.speed, cappedSpeed, rate * deltaSeconds);
      if (Math.abs(runtime.speed) < 0.012 && desiredSpeed === 0) runtime.speed = 0;
      const previousPosition = runtime.position;
      const wasInDriveway = runtime.driveway !== null;
      if (runtime.driveway) {
        const driveway = runtime.driveway;
        const length = getDrivewayLength(driveway.stopIndex);
        driveway.progress += runtime.speed * deltaSeconds;
        if (driveway.progress >= length && runtime.speed >= 0) {
          // The path ends at this exact main-road lane. Carry the small frame
          // remainder across the join without stopping or teleporting.
          const exitDistance = getDrivewayExitDistance(driveway.stopIndex);
          const unitsPerMeter = getRouteFrame(exitDistance + .5).position.distanceTo(getRouteFrame(exitDistance - .5).position);
          runtime.position = exitDistance + (driveway.progress - length) / unitsPerMeter;
          runtime.laneTarget = DELIVERY_STOPS[driveway.stopIndex].side === "left" ? 0 : 2;
          runtime.laneX = runtime.laneFromX = (runtime.laneTarget - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
          runtime.laneStartedAt = timestamp;
          runtime.driveway = null;
        } else if (driveway.progress <= 0 && runtime.speed < 0) {
          runtime.position = driveway.entryPosition;
          runtime.laneX = runtime.laneFromX = driveway.entryLaneX;
          runtime.laneTarget = DELIVERY_STOPS[driveway.stopIndex].side === "left" ? 0 : 2;
          runtime.laneStartedAt = timestamp;
          runtime.driveway = null;
        }
      } else {
        runtime.position += runtime.speed * deltaSeconds;
        if (nextStop && runtime.speed > 0 && runtime.laneTarget === entranceLane
          && runtime.position >= nextStop.distance && runtime.position <= nextStop.distance + 6
          && Math.abs(runtime.laneX - (entranceLane - 1) * DELIVERY_GAME_CONFIG.laneSpacing) < .55) {
          runtime.driveway = { stopIndex: runtime.stopIndex, progress: 0, entryPosition: runtime.position, entryLaneX: runtime.laneX };
          runtime.collisionId = null;
        }
      }

      if (runtime.position <= 0) {
        runtime.position = 0;
        if (runtime.speed < 0) runtime.speed = 0;
      }

      // The existing lane controls steer into the fork. Keep the selection
      // reversible before the split, with a short forgiving entry afterward.
      const junction = ROAD_CLOSURE.junctionDistance;
      if (!runtime.driveway && runtime.position <= junction) {
        runtime.detour = runtime.laneTarget === 0 ? "left" : runtime.laneTarget === 2 ? "right" : "main";
      } else if (!runtime.driveway && runtime.detour === "main" && runtime.position <= junction + 12 && runtime.laneTarget !== 1) {
        runtime.detour = runtime.laneTarget === 0 ? "left" : "right";
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
        Object.assign(runtime, advanceDeliveryTargets(runtime));
        clearInputs();
        setFrame({ ...runtime });
        setStatus("arriving");
        return;
      }

      const previousStopIndex = runtime.stopIndex;
      Object.assign(runtime, advanceDeliveryTargets(runtime));
      if (runtime.stopIndex !== previousStopIndex) runtime.stopDwell = 0;
      if (nextStop && runtime.position <= DELIVERY_GAME_CONFIG.totalDistance) {
        const stoppedInZone = isAtDrivewayDelivery(runtime.driveway, runtime.stopIndex) && Math.abs(runtime.speed) < 0.55;
        if (stoppedInZone && !runtime.quizPassedStops.includes(runtime.stopIndex)) {
          runtime.speed = 0;
          runtime.stopDwell = 0;
          clearInputs();
          setFrame({ ...runtime });
          setStatus("quiz");
          return;
        }
        runtime.stopDwell = stoppedInZone ? runtime.stopDwell + deltaSeconds : 0;
        if (runtime.stopDwell >= DELIVERY_GAME_CONFIG.deliveryStopDwellSeconds) {
          runtime.completedStops = [...runtime.completedStops, runtime.stopIndex];
          runtime.stopIndex += 1;
          runtime.stopDwell = 0;
          runtime.deliveryPulse += 1;
          runtime.deliverySuccessRemaining = DELIVERY_GAME_CONFIG.deliverySuccessSeconds;
        }
      }

      // An alley-to-main join bypasses that section of the main road; do not
      // sweep collisions across the entrance-to-exit route-coordinate jump.
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
          const obstacleX = (obstacle.lane - 1) * DELIVERY_GAME_CONFIG.laneSpacing;
          if (Math.abs(actualBikeX - obstacleX) >= DELIVERY_GAME_CONFIG.collisionHalfWidth + 0.52) continue;

          runtime.speed *= 0.38;
          runtime.collisionId = obstacle.id;
          runtime.collisionCount += 1;
          runtime.slowdownUntil = timestamp + DELIVERY_GAME_CONFIG.collisionSlowdownSeconds * 1_000;
          obstaclePassUntilRef.current.set(obstacle.id, timestamp + DELIVERY_GAME_CONFIG.obstaclePassThroughSeconds * 1_000);
          break;
        }
      }
      if (runtime.collisionId && timestamp >= (obstaclePassUntilRef.current.get(runtime.collisionId) ?? 0)) {
        runtime.collisionId = null;
      }

      setFrame({ ...runtime });
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
      if (!new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]).has(event.code)) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (status !== "playing" || paused) return;
      event.preventDefault();
      if (event.code === "ArrowLeft" || event.code === "ArrowRight") {
        if (!event.repeat) moveLane(event.code === "ArrowLeft" ? -1 : 1);
        return;
      }
      if (event.code === "ArrowUp") keyInputsRef.current.forward = true;
      if (event.code === "ArrowDown") keyInputsRef.current.reverse = true;
      syncDriveInput();
    };
    const handleKeyUp = (event: KeyboardEvent) => {
      if (!new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]).has(event.code)) return;
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
  }, [clearInputs, moveLane, paused, status, syncDriveInput]);

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

  const togglePause = () => {
    clearInputs();
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
        data-collision-count={frame.collisionCount}
        data-slowdown-active={frame.slowdownUntil > performance.now() ? "true" : "false"}
        data-stop-index={frame.stopIndex}
        data-stop-dwell={frame.stopDwell.toFixed(3)}
        data-delivery-pulse={frame.deliveryPulse}
        data-delivery-success-remaining={frame.deliverySuccessRemaining.toFixed(3)}
        data-detour={frame.detour}
        data-closure-reached={frame.closureReached ? "true" : "false"}
        data-driveway-index={frame.driveway?.stopIndex ?? -1}
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
          </div>
          <span className={styles.screenReaderOnly} role="status" aria-live="polite" aria-atomic="true">{navigation.instruction}. {navigation.destination}</span>
        </header>

        <div className={styles.playArea}>
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
          />

          <DeliveryJoystick ref={joystickRef} disabled={status !== "playing" || paused} steeringDisabled={frame.driveway !== null} onDrive={handleJoystickDrive} onLane={moveLane} />
        </div>

        {status === "ready" && <DeliveryBrandStart selected={selectedBrand} onSelect={setSelectedBrand} onStart={startGame} />}

        {paused && canPause && <DeliveryPauseMenu stopIndex={frame.stopIndex} onResume={() => setPaused(false)} onRestart={returnToStart} onReplay={() => { clearInputs(); setGuidanceReplay(value => value + 1); setPaused(false); }} />}

        {status === "quiz" && nextStop && <DeliveryBrandQuiz key={frame.stopIndex} brand={deliveryBrand} stopIndex={frame.stopIndex} address={nextStop.address} onCorrect={completeQuiz} />}
        {status === "completed" && <DeliveryPurchaseAd brand={deliveryBrand} completedDeliveries={completedDeliveries} onRestart={returnToStart} />}
      </section>
    </main>
  );
}
