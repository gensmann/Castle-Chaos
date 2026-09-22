import assert from "node:assert/strict";
const origin = process.argv[2] ?? "http://127.0.0.1:8787";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw new Error(
    "The API check only runs against a local Worker, never production.",
  );
const prefix = `check-${Date.now()}`;
async function api(user, body, expected = 200) {
  const r = await fetch(origin + "/api/game", {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      ...(user
        ? {
            "oai-authenticated-user-id": user,
            "oai-authenticated-user-email": user + "@local.test",
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  assert.equal(r.status, expected, JSON.stringify(data));
  return data;
}
const a = prefix + "-a",
  b = prefix + "-b",
  c = prefix + "-c";
await api(null, null, 401);
let A = await api(a),
  B = await api(b);
assert.equal(A.game.phase, "settling");
A = await api(a, { op: "create", name: "Borg Alpha" });
const code = A.game.code;
assert.match(code, /^[A-Z2-9]{6}$/);
B = await api(b, { op: "join", name: "Borg Bravo", code });
A = await api(a);
assert.equal(A.game.players.length, 2);
assert.equal(A.me === B.me, false);
await api(a, { op: "create", name: "Double Castle" }, 400);
async function order(
  user,
  data,
  action,
  requestId = crypto.randomUUID(),
  expected = 200,
) {
  return api(
    user,
    { op: "action", action, revision: data.revision, requestId },
    expected,
  );
}
await order(b, B, { type: "start" }, crypto.randomUUID(), 400);
A = await order(a, A, { type: "start" });
assert.equal(A.game.phase, "settling");
B = await api(b);
B = await order(b, B, { type: "settle", plot: 2 });
A = await api(a);
A = await order(a, A, { type: "settle", plot: 1 });
assert.equal(A.game.phase, "playing");
assert.equal(A.game.players[0].hp, 300);
assert.equal(A.game.players[1].wood, -1);
assert.equal(A.game.seed, 0);
B = await api(b);
await order(
  b,
  B,
  { type: "build", building: "keep" },
  crypto.randomUUID(),
  400,
);
const receipt = crypto.randomUUID();
A = await order(a, A, { type: "build", building: "keep" }, receipt);
const gold = A.game.players[0].gold;
const repeat = await order(a, A, { type: "build", building: "keep" }, receipt);
assert.equal(repeat.game.players[0].gold, gold);
await order(
  a,
  { ...A, revision: A.revision - 1 },
  { type: "build", building: "workshop" },
  crypto.randomUUID(),
  409,
);
const raceBody = {
  op: "action",
  revision: A.revision,
  action: { type: "build", building: "quarry" },
};
const statuses = await Promise.all(
  [0, 1].map(() =>
    fetch(origin + "/api/game", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "oai-authenticated-user-id": a,
        "oai-authenticated-user-email": a + "@local.test",
      },
      body: JSON.stringify({ ...raceBody, requestId: crypto.randomUUID() }),
    }).then((r) => r.status),
  ),
);
assert.deepEqual(statuses.sort(), [200, 409]);
A = await api(a);
assert.equal(A.game.players[0].buildings.quarry, 1);
A = await order(a, A, { type: "end" });
B = await api(b);
assert.equal(B.game.players[B.game.current].id, B.me);
const left = await api(b, { op: "leave" });
assert.equal(left.game.mode, "practice");
A = await api(a);
assert.equal(A.game.phase, "finished");
assert.equal(A.game.winner, A.me);
// Leaving during the initial shared landing must not strand the other player.
let C = await api(c);
A = await api(a, { op: "create", name: "Borg Alpha" });
C = await api(c, { op: "join", name: "Borg Charlie", code: A.game.code });
A = await api(a);
A = await order(a, A, { type: "start" });
A = await order(a, A, { type: "settle", plot: 0 });
await api(c, { op: "leave" });
A = await api(a);
assert.equal(A.game.phase, "finished");
console.log(
  "API checked: two authenticated players, create/join, one active castle, host permissions, settlement, turn ownership, private intelligence, idempotency, stale requests, concurrent writes, surrender, and leaving during landing.",
);
