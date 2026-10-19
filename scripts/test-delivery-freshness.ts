import assert from "node:assert/strict";
import { FRESHNESS, SECTIONS, freshnessLeft, sectionEntered, starsFor } from "../components/delivery/delivery-freshness";

assert.equal(freshnessLeft(0), 1);
assert.equal(freshnessLeft(FRESHNESS.seconds * 2), 0, "Never below empty");
// A clean ~75 s run with every delivery earns three stars; a slow one fewer.
assert.equal(starsFor(freshnessLeft(75), 4, 4), 3);
assert.equal(starsFor(freshnessLeft(75), 3, 4), 2, "Three stars need every delivery");
assert.equal(starsFor(freshnessLeft(110), 4, 4), 2);
assert.equal(starsFor(freshnessLeft(150), 4, 4), 1, "Finishing always earns one star");
// Penalties are meaningful but a single mistake does not ruin a good run.
assert.equal(starsFor(freshnessLeft(75 + FRESHNESS.hitPenalty), 4, 4), 3);
assert(SECTIONS.every((s, i) => i === 0 || s.from > SECTIONS[i - 1].from), "Sections in route order");
assert.equal(sectionEntered(94, 96)?.name, SECTIONS[0].name);
assert.equal(sectionEntered(96, 98), null, "A banner shows once, on entry");
console.log("Freshness clock, star thresholds and section banners verified.");
