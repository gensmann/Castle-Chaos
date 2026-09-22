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
  "Orbiting and returning to the starting point is still a drag",
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
  "Controls checked: tap, orbit, pinch, cancellation, blur and gesture recovery.",
);
