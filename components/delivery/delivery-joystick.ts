export type JoystickDrive = "forward" | "reverse" | null;
export type JoystickSample = {
  x: number;
  y: number;
  drive: JoystickDrive;
  laneLatched: boolean;
  laneStep: -1 | 0 | 1;
};

// Normalised thumb travel. Steering re-arms independently of the vertical axis,
// so returning straight ahead permits another lane change without stopping.
// Fixed centre with a low release point: once the throttle is on, a thumb
// drifting back toward the centre keeps driving without a long push.
export const JOYSTICK_CONFIG = {
  travelRatio: .36,
  driveEngage: .24,
  driveRelease: .1,
  laneEngage: .62,
  laneRelease: .26,
} as const;

export const neutralJoystick = (): JoystickSample => ({ x: 0, y: 0, drive: null, laneLatched: false, laneStep: 0 });

export function sampleJoystick(x: number, y: number, previous: JoystickSample): JoystickSample {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return neutralJoystick();
  const length = Math.max(1, Math.hypot(x, y));
  x /= length;
  y /= length;
  let drive: JoystickDrive = null;
  if (y <= -JOYSTICK_CONFIG.driveEngage || previous.drive === "forward" && y < -JOYSTICK_CONFIG.driveRelease) drive = "forward";
  else if (y >= JOYSTICK_CONFIG.driveEngage || previous.drive === "reverse" && y > JOYSTICK_CONFIG.driveRelease) drive = "reverse";
  let laneLatched = previous.laneLatched;
  if (Math.abs(x) <= JOYSTICK_CONFIG.laneRelease) laneLatched = false;
  const laneStep = !laneLatched && Math.abs(x) >= JOYSTICK_CONFIG.laneEngage ? (x < 0 ? -1 : 1) : 0;
  if (laneStep) laneLatched = true;
  return { x, y, drive, laneLatched, laneStep };
}
