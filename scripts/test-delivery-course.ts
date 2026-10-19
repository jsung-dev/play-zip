import assert from "node:assert/strict";
import { OBSTACLE_PLACEMENTS } from "../data/delivery-game";
import { SECTIONS, sectionEntered, starsFor } from "../components/delivery/delivery-course";
import { MOVER_PLACEMENTS, moverCollides } from "../components/delivery/delivery-movers";
import { GAPS } from "../components/delivery/delivery-pickups";

assert.equal(starsFor(0, 4, 4), 3);
assert.equal(starsFor(1, 4, 4), 3, "One bump still allows three stars");
assert.equal(starsFor(0, 3, 4), 2, "Three stars need every delivery");
assert.equal(starsFor(4, 4, 4), 2);
assert.equal(starsFor(9, 4, 4), 1, "Finishing always earns one star");
assert(SECTIONS.every((s, i) => i === 0 || s.from > SECTIONS[i - 1].from), "Sections in route order");
assert.equal(sectionEntered(SECTIONS[0].from - 1, SECTIONS[0].from + 1)?.name, SECTIONS[0].name);
assert.equal(sectionEntered(SECTIONS[0].from + 1, SECTIONS[0].from + 3), null, "A banner shows once, on entry");

// Layout: one pattern at a time. Hazards on the same road are either part of the
// same pattern (same distance) or at least 10 m apart, and every section has some.
const events = [
  ...OBSTACLE_PLACEMENTS.map(o => ({ d: o.distance, route: o.branch ?? "main", id: o.id })),
  // Drums belong to the detour ramp pattern: they roll away from it to funnel riders onto it.
  ...MOVER_PLACEMENTS.filter(m => moverCollides(m.kind) && m.kind !== "drum").map(m => ({ d: m.distance, route: m.branch ?? "main", id: m.id })),
  ...GAPS.map(g => ({ d: g.start, route: g.branch ?? "main", id: `gap-${g.start}` })),
];
for (const route of ["main", "left", "right"]) {
  const list = events.filter(e => e.route === route).sort((a, b) => a.d - b.d);
  for (let i = 1; i < list.length; i++) {
    const gap = list[i].d - list[i - 1].d;
    assert(gap === 0 || gap >= 10, `${list[i - 1].id} and ${list[i].id} overlap (${gap.toFixed(1)} m)`);
  }
}
for (const [i, section] of SECTIONS.entries()) {
  const end = SECTIONS[i + 1]?.from ?? 1000;
  assert(events.some(e => e.d >= section.from && e.d < end), `${section.name} has a hazard`);
}
console.log("Hit-based stars, section banners and non-overlapping layout verified.");
