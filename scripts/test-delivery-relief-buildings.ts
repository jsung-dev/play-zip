import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { RELIEF_BUILDINGS } from "@/data/delivery-relief-buildings";

const specs = Object.values(RELIEF_BUILDINGS);
assert.equal(specs.length, 2, "Two Meshy-model buildings");
for (const s of specs) {
  const file = `public${s.atlas}`;
  assert(existsSync(file) && statSync(file).size > 20_000, `Atlas present: ${s.id}`);
  assert(s.quads > 200 && s.quads * 2 < 4500, `Triangle budget ${s.id}: ${s.quads * 2}`);
  assert.equal(atob(s.data).length, s.quads * 40, `Packed data size ${s.id}`);
  assert(s.width > 4 && s.depth > 3 && s.height > 6, `Sane size ${s.id}`);
}
console.log("delivery relief buildings OK");
