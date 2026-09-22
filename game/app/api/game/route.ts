import { getDb } from "@/db";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import {
  applyAction,
  createGame,
  expireTurn,
  player,
  record,
  runBots,
  type Action,
  type Game,
} from "@/lib/game";
import { z } from "zod";

type Profile = {
  user_id: string;
  player_id: string;
  room_code: string;
  display_name: string;
};
type Room = { code: string; state: string; revision: number };
const schema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("action"),
    revision: z.number().int().nonnegative(),
    requestId: z.string().uuid(),
    action: z.discriminatedUnion("type", [
      z.object({
        type: z.literal("settle"),
        plot: z.number().int().min(0).max(2),
      }),
      z.object({
        type: z.literal("build"),
        building: z.enum(["keep", "walls", "workshop", "tavern", "quarry"]),
      }),
      z.object({
        type: z.literal("craft"),
        weapon: z.enum(["trebuchet", "ballista", "goatapult", "arcane"]),
      }),
      z.object({
        type: z.literal("attack"),
        target: z.string().max(80),
        weapon: z.enum(["trebuchet", "ballista", "goatapult", "arcane"]),
      }),
      z.object({ type: z.literal("recruit"), guest: z.string().uuid() }),
      z.object({
        type: z.literal("quest"),
        guest: z.string().uuid(),
        target: z.string().max(80),
      }),
      z.object({
        type: z.enum([
          "feast",
          "repair",
          "end",
          "start",
          "start-bots",
          "surrender",
        ]),
      }),
    ]),
  }),
  z.object({ op: z.literal("create"), name: z.string().trim().min(2).max(24) }),
  z.object({
    op: z.literal("join"),
    name: z.string().trim().min(2).max(24),
    code: z.string().regex(/^[A-Z2-9]{6}$/),
  }),
  z.object({ op: z.enum(["reset", "leave"]) }),
]);
const response = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
function publicState(game: Game, me: string) {
  const g = structuredClone(game);
  g.seed = 0;
  g.receipts = [];
  g.players.forEach((p) => {
    if (p.id !== me && p.exposed === 0) {
      p.gold = -1;
      p.wood = -1;
      p.stone = -1;
      p.guests = p.guests.map((v) => ({ ...v, loyalty: 0 }));
    }
  });
  return g;
}
function result(game: Game, profile: Profile, revision: number) {
  return response({
    game: publicState(game, profile.player_id),
    me: profile.player_id,
    revision,
  });
}
async function readProfile(id: string) {
  return getDb()
    .prepare("SELECT * FROM profiles WHERE user_id = ?")
    .bind(id)
    .first<Profile>();
}
async function readRoom(code: string) {
  return getDb()
    .prepare("SELECT code,state,revision FROM rooms WHERE code = ?")
    .bind(code)
    .first<Room>();
}
async function ensureProfile(userId: string) {
  let p = await readProfile(userId);
  if (p) return p;
  const db = getDb(),
    pid = crypto.randomUUID(),
    code = `solo-${pid}`,
    game = createGame(pid, "Your Lordship", code);
  await db.batch([
    db
      .prepare(
        "INSERT INTO rooms(code,state,revision,updated_at) VALUES(?,?,0,?)",
      )
      .bind(code, JSON.stringify(game), Date.now()),
    db
      .prepare(
        "INSERT OR IGNORE INTO profiles(user_id,player_id,room_code,display_name) VALUES(?,?,?,?)",
      )
      .bind(userId, pid, code, "Your Lordship"),
    db
      .prepare(
        "DELETE FROM rooms WHERE code = ? AND NOT EXISTS (SELECT 1 FROM profiles WHERE room_code = ?)",
      )
      .bind(code, code),
  ]);
  p = await readProfile(userId);
  if (!p) throw new Error("Could not reserve your castle. Please try again.");
  return p;
}
async function save(room: Room, game: Game) {
  const r = await getDb()
    .prepare(
      "UPDATE rooms SET state=?,revision=revision+1,updated_at=? WHERE code=? AND revision=?",
    )
    .bind(JSON.stringify(game), Date.now(), room.code, room.revision)
    .run();
  return r.meta.changes === 1;
}
function readableError(e: unknown) {
  if (e instanceof z.ZodError) return "That royal order was not understood.";
  return e instanceof Error
    ? e.message
    : "The royal messenger has lost the letter. Please try again.";
}
export async function GET() {
  try {
    const user = await getChatGPTUser();
    if (!user)
      return response(
        { error: "Sign in to save a castle and join multiplayer." },
        401,
      );
    const p = await ensureProfile(user.userId);
    let room = await readRoom(p.room_code);
    if (!room)
      return response({ error: "This realm could not be found." }, 404);
    let g = JSON.parse(room.state) as Game;
    const tick = expireTurn(g);
    if (tick !== g) {
      if (await save(room, tick)) {
        g = tick;
        room.revision++;
      } else {
        room = await readRoom(p.room_code);
        if (!room) throw new Error("Realm unavailable.");
        g = JSON.parse(room.state);
      }
    }
    return result(g, p, room.revision);
  } catch (e) {
    console.error("Game load failed", e);
    return response(
      {
        error:
          "The royal archives are temporarily unavailable. Your castle is safe; please retry.",
      },
      503,
    );
  }
}
export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return response(
        { error: "That messenger is from the wrong kingdom." },
        403,
      );
    const user = await getChatGPTUser();
    if (!user)
      return response(
        { error: "Sign in to command a persistent castle." },
        401,
      );
    if (Number(request.headers.get("content-length")) > 8192)
      return response({ error: "That decree is much too long." }, 413);
    const raw = await request.text();
    if (raw.length > 8192)
      return response({ error: "That decree is much too long." }, 413);
    const body = schema.parse(JSON.parse(raw));
    const p = await ensureProfile(user.userId);
    const room = await readRoom(p.room_code);
    if (!room) return response({ error: "Realm not found." }, 404);
    const g = JSON.parse(room.state) as Game;
    if (body.op === "action") {
      if (g.receipts.includes(body.requestId))
        return result(g, p, room.revision);
      const tick = expireTurn(g);
      if (tick !== g) {
        await save(room, tick);
        return response(
          {
            error:
              "The turn changed while your messenger was travelling. The realm has been refreshed.",
          },
          409,
        );
      }
      if (body.revision !== room.revision)
        return response(
          {
            error:
              "The realm changed. Review the new state and issue your order again.",
          },
          409,
        );
      const next = runBots(
        applyAction(g, p.player_id, body.action as Action, body.requestId),
      );
      if (!(await save(room, next)))
        return response(
          {
            error: "Another order arrived first. The realm has been refreshed.",
          },
          409,
        );
      return result(next, p, room.revision + 1);
    }
    const living = g.players.find((v) => v.id === p.player_id)?.hp ?? 0;
    if (
      g.mode === "online" &&
      g.phase !== "finished" &&
      living > 0 &&
      body.op !== "leave"
    )
      return response(
        {
          error:
            "You already have a castle in an active realm. Leave that realm before founding another.",
        },
        400,
      );
    const db = getDb();
    let next: Game;
    let target: Room | null = null;
    let name = p.display_name;
    if (body.op === "join") {
      target = await readRoom(body.code);
      if (!target)
        return response(
          {
            error:
              "No realm has that code. Check the six letters with your host.",
          },
          404,
        );
      next = JSON.parse(target.state);
      if (next.mode !== "online" || next.phase !== "lobby")
        return response(
          {
            error:
              "This siege has already begun. Ask the host to open a new realm.",
          },
          400,
        );
      if (next.players.length >= 4)
        return response({ error: "This realm already has four rulers." }, 400);
      if (next.players.some((v) => v.id === p.player_id))
        return response({ error: "You already have a castle here." }, 400);
      name = body.name;
      next.players.push(player(p.player_id, name, next.players.length));
      record(
        next,
        `${name} arrives with a crown and several unreasonable demands.`,
        "notice",
      );
    } else if (body.op === "create") {
      const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const bytes = crypto.getRandomValues(new Uint8Array(6));
      const code = Array.from(bytes, (b) => chars[b % chars.length]).join("");
      name = body.name;
      next = createGame(p.player_id, name, code, true);
    } else next = createGame(p.player_id, name, `solo-${crypto.randomUUID()}`);
    const statements: D1PreparedStatement[] = [];
    // All writes execute in one D1 transaction. Profile guards prevent two concurrent
    // requests from granting the same ruler castles in different realms.
    if (target)
      statements.push(
        db
          .prepare(
            "UPDATE rooms SET state=?,revision=revision+1,updated_at=? WHERE code=? AND revision=? AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND room_code=?) AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND revision=?)",
          )
          .bind(
            JSON.stringify(next),
            Date.now(),
            next.code,
            target.revision,
            user.userId,
            room.code,
            room.code,
            room.revision,
          ),
      );
    else
      statements.push(
        db
          .prepare(
            "INSERT INTO rooms(code,state,revision,updated_at) SELECT ?,?,0,? WHERE EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND room_code=?) AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND revision=?)",
          )
          .bind(
            next.code,
            JSON.stringify(next),
            Date.now(),
            user.userId,
            room.code,
            room.code,
            room.revision,
          ),
      );
    const expectedRevision = target ? target.revision + 1 : 0;
    statements.push(
      db
        .prepare(
          "UPDATE profiles SET room_code=?,display_name=? WHERE user_id=? AND room_code=? AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND revision=? AND state=?)",
        )
        .bind(
          next.code,
          name,
          user.userId,
          room.code,
          next.code,
          expectedRevision,
          JSON.stringify(next),
        ),
    );
    if (g.mode === "practice")
      statements.push(
        db
          .prepare(
            "DELETE FROM rooms WHERE code=? AND NOT EXISTS(SELECT 1 FROM profiles WHERE room_code=?)",
          )
          .bind(room.code, room.code),
      );
    else {
      let old = g;
      if (g.phase === "lobby" || g.phase === "settling") {
        old = structuredClone(g);
        old.players = old.players.filter((v) => v.id !== p.player_id);
        if (!old.players.length) {
          old.phase = "finished";
          old.winner = null;
        }
        if (
          old.phase === "settling" &&
          old.players.every((v) => v.plot !== null)
        ) {
          old.phase = "playing";
          old.current = 0;
          old.deadline = Date.now() + 90000;
        }
        if (old.phase === "playing" && old.players.length === 1) {
          old.phase = "finished";
          old.winner = old.players[0].id;
        }
        record(old, `${p.display_name} leaves the council.`, "notice");
      } else if (g.phase === "playing" && living > 0)
        old = runBots(applyAction(g, p.player_id, { type: "surrender" }));
      statements.push(
        db
          .prepare(
            "UPDATE rooms SET state=?,revision=revision+1,updated_at=? WHERE code=? AND revision=? AND EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND room_code=?)",
          )
          .bind(
            JSON.stringify(old),
            Date.now(),
            room.code,
            room.revision,
            user.userId,
            next.code,
          ),
      );
    }
    const writes = await db.batch(statements);
    if (writes[0].meta.changes !== 1 || writes[1].meta.changes !== 1)
      return response(
        { error: "The realm changed before you arrived. Please retry." },
        409,
      );
    return result(
      next,
      { ...p, room_code: next.code, display_name: name },
      expectedRevision,
    );
  } catch (e) {
    console.error("Game order failed", e);
    const msg = readableError(e);
    if (/SQLITE|D1_|database|no such table/i.test(msg))
      return response(
        {
          error:
            "The royal archives could not save that order. Please reload before trying again.",
        },
        503,
      );
    return response({ error: msg }, 400);
  }
}
