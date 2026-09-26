import assert from "node:assert/strict";
import { stepDebris } from "../lib/debris-physics.ts";
const body = (extra = {}) => ({
  x: 0,
  y: 4,
  z: 0,
  vx: 1,
  vy: 0,
  vz: 0,
  radius: 0.25,
  age: 0,
  sleeping: false,
  ...extra,
});
const fall = body();
let bounced = false;
for (let i = 0; i < 720; i++) {
  stepDebris([fall], [], 1 / 60);
  bounced ||= fall.vy > 0;
  assert.ok(fall.y >= fall.radius);
}
assert.ok(bounced);
assert.ok(fall.sleeping);
const wall = body({ x: -1.8, y: 0.5, vx: 8 });
stepDebris([wall], [{ x: 0, z: 0, halfX: 1.5, halfZ: 2, height: 3 }], 1 / 60);
assert.ok(wall.x <= -1.75 && wall.vx < 0);
const roof = body({ y: 3.26, vy: -2, vx: 0 });
stepDebris([roof], [{ x: 0, z: 0, halfX: 2, halfZ: 2, height: 3 }], 1 / 60);
assert.ok(roof.y >= 3.25 && roof.vy >= 0);
const a = body({ x: -0.2, y: 2, vx: 2 }),
  b = body({ x: 0.2, y: 2, vx: -2 });
stepDebris([a, b], [], 1 / 60);
assert.ok(a.vx < 0 && b.vx > 0);
for (const fragment of [a, b, wall, roof]) {
  for (const value of Object.values(fragment))
    if (typeof value === "number") assert.ok(Number.isFinite(value));
}
console.log(
  "Debris checks passed: gravity, bounce, sleep, wall/roof contacts, and fragment collisions.",
);
