import assert from "node:assert/strict";
import { CHALLENGE, challengeSpeedFactor, heartsLeft, readBest, saveBest } from "../components/delivery/delivery-challenge";

// Minimal localStorage for node; one test also runs with storage blocked.
const store = new Map<string, string>();
Object.assign(globalThis, { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) } });
// The helpers read localStorage on each call, so the shim above only has to exist before they run.

assert.equal(heartsLeft(0), CHALLENGE.hearts);
assert.equal(heartsLeft(CHALLENGE.hearts + 3), 0, "Hearts never go negative");
assert.equal(challengeSpeedFactor(0), 1);
assert(challengeSpeedFactor(2) > challengeSpeedFactor(1), "Each km is faster");
assert.equal(challengeSpeedFactor(100), CHALLENGE.maxSpeedFactor, "Speed is capped");

assert.equal(readBest(), 0);
assert.equal(saveBest(1234.7), 1234, "First run sets the record (whole metres)");
assert.equal(saveBest(900), 1234, "A shorter run keeps the record");
assert.equal(saveBest(2000), 2000);
assert.equal(readBest(), 2000);

Object.assign(globalThis, { localStorage: { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } } });
assert.equal(readBest(), 0, "Blocked storage reads as no record");
assert.equal(saveBest(10), 10, "Blocked storage still returns the run");
console.log("Challenge hearts, lap speed and best-distance record verified.");
