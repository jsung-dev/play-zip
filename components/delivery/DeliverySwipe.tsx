"use client";

import { useRef, type PointerEvent } from "react";
import { classifySwipe, type SwipeAction } from "./delivery-swipe";
import styles from "./DeliveryGame.module.css";

type Props = { disabled: boolean; onAction: (action: SwipeAction) => void };
type Gesture = { id: number; x: number; y: number; fired: boolean };

// One full-screen pad: swipe sideways to change lane, up to jump, down to duck; a tap also jumps.
export function DeliverySwipe({ disabled, onAction }: Props) {
  const gesture = useRef<Gesture | null>(null);
  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled || gesture.current || event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, fired: false };
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    const action = classifySwipe(event.clientX - g.x, event.clientY - g.y);
    if (!action) return;
    g.x = event.clientX; g.y = event.clientY; g.fired = true;
    onAction(action);
  };
  const end = (event: PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current;
    if (!g || g.id !== event.pointerId) return;
    gesture.current = null;
    if (event.type === "pointerup" && !g.fired) onAction("jump");
  };
  return (
    <button
      type="button"
      className={styles.swipePad}
      disabled={disabled}
      aria-label="화면 조작: 좌우로 밀면 차선 이동, 위로 밀거나 탭하면 점프, 아래로 밀면 숙이기"
      data-swipe-pad
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => { if (event.code === "Space") event.preventDefault(); }}
    />
  );
}
