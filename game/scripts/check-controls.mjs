import assert from "node:assert/strict";
import { createTapTracker } from "../lib/pointer-tap.ts";

const gesture = createTapTracker();
gesture.down(1, 100, 100);
assert.equal(
  gesture.up(1, 102, 102),
  true,
  "A deliberate tap selects a clearing",
);
gesture.down(1, 100, 100);
gesture.move(1, 150, 100);
assert.equal(
  gesture.up(1, 100, 100),
  false,
  "Panning and returning to the starting point is still a drag",
);
gesture.down(1, 100, 100);
gesture.down(2, 200, 100);
assert.equal(
  gesture.up(1, 100, 100),
  false,
  "First pinch finger must not select",
);
assert.equal(
  gesture.up(2, 200, 100),
  false,
  "Last pinch finger must not select",
);
gesture.down(1, 100, 100);
gesture.cancel(1);
assert.equal(
  gesture.up(1, 100, 100),
  false,
  "An interrupted touch must not select",
);
gesture.down(1, 100, 100);
gesture.reset();
assert.equal(
  gesture.up(1, 100, 100),
  false,
  "Leaving the window cancels a touch",
);
gesture.down(3, 50, 50);
assert.equal(
  gesture.up(3, 50, 50),
  true,
  "A new tap works after an interrupted gesture",
);
assert.equal(
  gesture.up(9, 50, 50),
  false,
  "Releasing an unrelated control must not select the world",
);
console.log(
  "Controls checked: tap, pan, pinch, cancellation, blur and gesture recovery.",
);

// The camera must preserve a map point under a drag/zoom and fit every stronghold
// in both portrait and landscape. This catches axis signs and aspect regressions.
const { projectIsometric, isometricDrag, fitIsometric } =
  await import("../lib/isometric-view.ts");
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
for (const [dx, dy] of [
  [80, 0],
  [0, -45],
  [70, 32],
]) {
  const shift = isometricDrag(dx, dy, 0.1);
  const screen = projectIsometric({ ...shift, y: 0 });
  near(screen.x, -dx * 0.1);
  near(screen.y, dy * 0.1);
}
const kingdom = [
  { x: -17, y: 0, z: -12 },
  { x: 20, y: 8, z: -7 },
  { x: 9, y: 4, z: 24 },
  { x: -23, y: 2, z: 21 },
];
for (const aspect of [0.46, 1, 1.78, 2.8]) {
  const fit = fitIsometric(kingdom, aspect, 10);
  const center = projectIsometric({ x: fit.x, y: 0, z: fit.z });
  for (const point of kingdom) {
    const projected = projectIsometric(point);
    assert.ok(
      Math.abs(projected.x - center.x) <= (fit.span * aspect) / 2 - 9.99,
    );
    assert.ok(Math.abs(projected.y - center.y) <= fit.span / 2 - 9.99);
  }
}
const point = { x: 12, y: 4, z: -7 };
const focused = fitIsometric([point], 1.8, 15);
const center = projectIsometric({ x: focused.x, y: 0, z: focused.z });
near(center.x, projectIsometric(point).x);
near(center.y, projectIsometric(point).y);
console.log(
  "Isometric controls checked: screen-to-ground axes, focus, portrait and landscape realm framing.",
);

// A fixed orthographic camera needs screen-size LOD, with hysteresis at boundaries.
const { detailLevel, inIsometricView } =
  await import("../lib/isometric-view.ts");
assert.equal(detailLevel(20, "far"), "near");
assert.equal(detailLevel(13, "near"), "near");
assert.equal(detailLevel(13, "middle"), "middle");
assert.equal(detailLevel(7, "far"), "far");
assert.equal(detailLevel(7, "middle"), "middle");
assert.equal(detailLevel(4, "near"), "far");
const origin = { x: 0, y: 0, z: 0 };
assert.equal(inIsometricView(origin, origin, 30, 1), true);
assert.equal(inIsometricView({ x: 100, y: 0, z: 100 }, origin, 30, 1), false);
assert.equal(inIsometricView({ x: 100, y: 0, z: -100 }, origin, 30, 1), false);
console.log(
  "LOD checked: zoom transitions, hysteresis and offscreen animation bounds.",
);
