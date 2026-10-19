import assert from "node:assert/strict";
import { neutralJoystick, sampleJoystick } from "../components/delivery/delivery-joystick";

let state = neutralJoystick();
for (const [x, y] of [[0, 0], [.1, -.1], [-.2, .2]]) {
  state = sampleJoystick(x, y, state);
  assert.equal(state.drive, null, "A small accidental touch must stay neutral");
  assert.equal(state.laneStep, 0);
}
state = sampleJoystick(0, -1, state);
assert.equal(state.drive, "forward");
state = sampleJoystick(0, -.15, state);
assert.equal(state.drive, "forward", "Hysteresis keeps driving when the thumb drifts back");
state = sampleJoystick(0, -.08, state);
assert.equal(state.drive, null, "Returning to the dead zone releases the throttle");
state = sampleJoystick(0, 1, state);
assert.equal(state.drive, "reverse");
state = sampleJoystick(-.8, -.8, state);
assert.equal(state.drive, "forward");
assert.equal(state.laneStep, -1, "Diagonal input changes one lane while driving");
for (let n = 0; n < 200; n++) {
  state = sampleJoystick(-.78 - n % 2 * .02, -.8, state);
  assert.equal(state.laneStep, 0, "Holding/jittering sideways must not repeat a lane change");
}
state = sampleJoystick(.05, -1, state);
assert.equal(state.drive, "forward", "Re-arming steering does not release forward input");
state = sampleJoystick(.8, -.8, state);
assert.equal(state.laneStep, 1);
state = sampleJoystick(-.8, -.8, state);
assert.equal(state.laneStep, 0, "A large uncentred pointer jump is not another gesture");
state = sampleJoystick(0, 0, state);
state = sampleJoystick(1, 0, state);
assert.equal(state.drive, null, "A lateral gesture alone does not drive");
assert.equal(state.laneStep, 1);
state = sampleJoystick(100, -100, neutralJoystick());
assert(Math.hypot(state.x, state.y) <= 1.000001, "Thumb must stay within its travel ring");
assert.equal(state.drive, "forward", "Dragging past the ring must keep driving");
assert.equal(state.laneStep, 1, "A long diagonal drag keeps normal lane semantics");
state = sampleJoystick(150, -150, state);
assert.equal(state.laneStep, 0, "Holding far beyond the ring must not repeat steering");
state = sampleJoystick(0, -150, state);
assert.equal(state.drive, "forward");
state = sampleJoystick(-150, -150, state);
assert.equal(state.laneStep, -1, "Long drags can re-arm steering without stopping");
state = sampleJoystick(0, 150, state);
assert.equal(state.drive, "reverse", "Changing direction outside the ring can reverse");
state = sampleJoystick(0, 0, state);
assert.equal(state.drive, null, "Returning to the touch origin releases drive");
assert.deepEqual(sampleJoystick(NaN, 1, state), neutralJoystick());
assert.deepEqual(sampleJoystick(1, Infinity, state), neutralJoystick());
console.log("Joystick dead zone, hysteresis, diagonal drive, one-lane latch, re-arm and travel clamp verified.");
