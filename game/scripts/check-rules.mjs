import assert from "node:assert/strict";
import {
  createGame,
  applyAction,
  runBots,
  expireTurn,
  player,
  siegeDamage,
} from "../lib/game.ts";
let g = createGame("one");
assert.equal(g.phase, "settling");
g = applyAction(g, "one", { type: "settle", plot: 1 });
assert.equal(g.players[0].hp, 300);
assert.equal(g.players[0].buildings.keep, 0);
assert.throws(() => applyAction(g, "one", { type: "settle", plot: 0 }));
const request = crypto.randomUUID();
g = applyAction(g, "one", { type: "build", building: "keep" }, request);
const paid = g.players[0].gold;
g = applyAction(g, "one", { type: "build", building: "keep" }, request);
assert.equal(g.players[0].gold, paid);
g = applyAction(g, "one", { type: "build", building: "workshop" });
g = applyAction(g, "one", { type: "craft", weapon: "trebuchet" });
assert.equal(g.players[0].orders, 0);
assert.throws(() =>
  applyAction(g, "one", {
    type: "attack",
    target: "bot-1",
    weapon: "trebuchet",
  }),
);
g = runBots(applyAction(g, "one", { type: "end" }));
assert.equal(g.current, 0);
assert.equal(g.round, 2);
assert.equal(g.players[0].orders, 3);
const expected = siegeDamage(g, g.players[0], g.players[1], "trebuchet"),
  before = g.players[1].hp;
g = applyAction(g, "one", {
  type: "attack",
  target: "bot-1",
  weapon: "trebuchet",
});
assert.equal(g.players[1].hp, before - expected);
assert.equal(g.players[0].shots, 1);
assert.throws(
  () =>
    applyAction(g, "one", {
      type: "attack",
      target: "bot-1",
      weapon: "trebuchet",
    }),
  /reloading/,
);
g = runBots(applyAction(g, "one", { type: "end" }));
assert.equal(g.players[0].shots, 0);
let m = createGame("a", "Alpha", "ABCDEF", true);
m.players.push(player("b", "Bravo", 1));
m = applyAction(m, "a", { type: "start" });
assert.equal(m.phase, "settling");
assert.throws(() => applyAction(m, "b", { type: "start" }));
m.deadline = Date.now() - 1;
m = expireTurn(m);
assert.equal(m.phase, "playing");
assert.ok(m.players.every((p) => p.plot !== null));
assert.throws(() => applyAction(m, "b", { type: "build", building: "keep" }));
m.deadline = Date.now() - 1;
m = expireTurn(m);
assert.equal(m.current, 1);
const one = m.players[1];
one.guests = [
  {
    id: crypto.randomUUID(),
    kind: "scientist",
    loyalty: 5,
    name: "Professor Fizzlewick",
  },
];
m.seed = 1;
m = applyAction(m, "b", {
  type: "quest",
  guest: one.guests[0].id,
  target: "a",
});
assert.equal(m.players[1].guests.length, 0);
assert.equal(m.players[0].guests.length, 1);
assert.equal(m.players[1].exposed, 2);
m = applyAction(m, "a", { type: "surrender" });
assert.equal(m.phase, "finished");
assert.equal(m.winner, "b");
console.log(
  "Rules checked: settlement, one castle, resource spending, idempotency, orders, bots, damage, turn ownership, timeouts, defection, victory.",
);
