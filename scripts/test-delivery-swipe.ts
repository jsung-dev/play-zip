import assert from "node:assert/strict";
import { classifySwipe, SWIPE_DISTANCE } from "../components/delivery/delivery-swipe";
import { clearsObstacle, duckAmountAt, DUCK_SECONDS } from "../components/delivery/delivery-jump";

const d = SWIPE_DISTANCE;
assert.equal(classifySwipe(d - 1, 0), null, "Short drags are not swipes");
assert.equal(classifySwipe(-d, 3), "left");
assert.equal(classifySwipe(d, -5), "right");
assert.equal(classifySwipe(4, -d), "jump", "Up jumps");
assert.equal(classifySwipe(-4, d), "duck", "Down ducks");
assert.equal(classifySwipe(d, d + 1), "duck", "The longer axis wins");
assert.equal(classifySwipe(NaN, 0), null);

assert.equal(duckAmountAt(null), 0);
assert(duckAmountAt(DUCK_SECONDS / 2) === 1, "Fully crouched mid-duck");
assert(duckAmountAt(0) === 0 && duckAmountAt(DUCK_SECONDS) === 0, "Upright at both ends");
assert.equal(clearsObstacle("overhead", 0, true), true, "Ducking passes a low bar");
assert.equal(clearsObstacle("overhead", 0, false), false, "Standing hits it");
assert.equal(clearsObstacle("overhead", 3, false), false, "Jumping does not clear it");
assert.equal(clearsObstacle("plank", 0.5), true, "Other obstacles keep their clearance");
console.log("Swipe controls and ducking verified.");
