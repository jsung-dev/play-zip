"use client";

import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useRef, useState, type PointerEvent } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Move } from "lucide-react";
import { JOYSTICK_CONFIG, neutralJoystick, sampleJoystick, type JoystickDrive, type JoystickSample } from "./delivery-joystick";
import styles from "./DeliveryGame.module.css";

export type DeliveryJoystickHandle = { reset: () => void };
type Props = { disabled: boolean; steeringDisabled: boolean; onDrive: (direction: JoystickDrive) => void; onLane: (direction: -1 | 1) => void };
type Gesture = { id: number; centerX: number; centerY: number; travel: number; sample: JoystickSample; left: number; top: number };

export const DeliveryJoystick = forwardRef<DeliveryJoystickHandle, Props>(function DeliveryJoystick({ disabled, steeringDisabled, onDrive, onLane }, ref) {
  const padRef = useRef<HTMLButtonElement>(null);
  const visualRef = useRef<HTMLSpanElement>(null);
  const gestureRef = useRef<Gesture | null>(null);
  const callbacksRef = useRef({ onDrive, onLane, disabled, steeringDisabled });
  callbacksRef.current = { onDrive, onLane, disabled, steeringDisabled };
  const [thumb, setThumb] = useState({ x: 0, y: 0, originX: 0, originY: 0, active: false });
  const helpId = useId();

  const reset = useCallback(() => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return;
    if (padRef.current?.hasPointerCapture(gesture.id)) padRef.current.releasePointerCapture(gesture.id);
    callbacksRef.current.onDrive(null);
    setThumb({ x: 0, y: 0, originX: 0, originY: 0, active: false });
  }, []);
  useImperativeHandle(ref, () => ({ reset }), [reset]);

  useEffect(() => { if (disabled) reset(); }, [disabled, reset]);
  useEffect(() => {
    const release = (event: globalThis.PointerEvent) => { if (event.pointerId === gestureRef.current?.id) reset(); };
    const visibility = () => { if (document.hidden) reset(); };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", reset);
    // Mobile URL bars resize the viewport mid-ride; only a real rotation/width
    // change cancels the gesture, otherwise the throttle would drop out.
    let width = window.innerWidth;
    const resize = () => { if (window.innerWidth !== width) { width = window.innerWidth; reset(); } };
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      // No render on unmount; a remount always starts with neutral input.
      gestureRef.current = null;
      callbacksRef.current.onDrive(null);
    };
  }, [reset]);

  const update = (event: PointerEvent<HTMLButtonElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.id !== event.pointerId) return;
    event.preventDefault();
    if (callbacksRef.current.disabled || !event.currentTarget.hasPointerCapture(event.pointerId) || event.pointerType === "mouse" && event.buttons === 0) { reset(); return; }
    let dx = event.clientX - gesture.centerX, dy = event.clientY - gesture.centerY;
    // Dynamic stick: beyond the ring the centre is dragged along with the thumb,
    // so a long push followed by a small drift back never cuts the throttle.
    const distance = Math.hypot(dx, dy), moved = distance > gesture.travel;
    if (moved) {
      const pull = (distance - gesture.travel) / distance;
      gesture.centerX += dx * pull; gesture.centerY += dy * pull; dx -= dx * pull; dy -= dy * pull;
    }
    const next = sampleJoystick(dx / gesture.travel, dy / gesture.travel, gesture.sample);
    if (next.drive !== gesture.sample.drive) callbacksRef.current.onDrive(next.drive);
    if (next.laneStep && !callbacksRef.current.steeringDisabled) callbacksRef.current.onLane(next.laneStep);
    gesture.sample = next;
    setThumb((previous) => ({ ...previous, x: next.x * gesture.travel, y: next.y * gesture.travel, active: true,
      ...(moved ? { originX: gesture.centerX - gesture.left, originY: gesture.centerY - gesture.top } : {}) }));
  };

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || gestureRef.current || event.button !== 0) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const size = visualRef.current?.getBoundingClientRect().width;
    if (!size) return;
    gestureRef.current = { id: event.pointerId, centerX: event.clientX, centerY: event.clientY, travel: size * JOYSTICK_CONFIG.travelRatio, sample: neutralJoystick(), left: bounds.left, top: bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    // Touch-down is neutral; the first deliberate drag chooses the direction.
    setThumb({ x: 0, y: 0, originX: event.clientX - bounds.left, originY: event.clientY - bounds.top, active: true });
  };
  const release = (event: PointerEvent<HTMLButtonElement>) => { if (gestureRef.current?.id === event.pointerId) reset(); };

  return (
    <div className={styles.joystickControls} aria-label="이동 조작">
      <button
        ref={padRef}
        type="button"
        className={styles.joystick}
        disabled={disabled}
        aria-label="주행 화면 이동 조이스틱"
        aria-roledescription="조이스틱"
        aria-describedby={helpId}
        data-joystick
        data-active={thumb.active}
        data-steering-disabled={steeringDisabled}
        onPointerDown={start}
        onPointerMove={update}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
        onContextMenu={(event) => { event.preventDefault(); reset(); }}
        onKeyDown={(event) => { if (event.code === "Space") event.preventDefault(); }}
      >
        <span ref={visualRef} data-joystick-visual className={styles.joystickVisual} style={{ left: thumb.originX, top: thumb.originY }} aria-hidden="true">
          <span className={styles.joystickRing} />
          <ChevronUp className={styles.joystickUp} />
          <ChevronDown className={styles.joystickDown} />
          <ChevronLeft className={styles.joystickLeft} />
          <ChevronRight className={styles.joystickRight} />
          <span className={styles.joystickThumb} style={{ transform: `translate(${thumb.x}px, ${thumb.y}px)` }}><Move /></span>
        </span>
      </button>
      <span id={helpId} className={styles.screenReaderOnly}>조이스틱 쪽 화면 어디서든 터치한 뒤 위로 밀어 전진, 아래로 밀어 후진합니다. 좌우로 한 번 밀면 인접 차선으로 이동합니다. 골목 앞에서만 나타나는 바깥쪽 회전 차선으로 옮기면 골목으로 이어집니다. 기존 세 차선은 직진합니다. 놓친 배달은 돌아와 다시 할 수 있습니다. 원 밖으로 밀면 원이 손가락을 따라와 조작이 유지됩니다. 반대쪽 화면을 탭하면 점프합니다. 손을 놓으면 감속해 멈춥니다. 키보드 화살표로도 조작할 수 있습니다.</span>
    </div>
  );
});
