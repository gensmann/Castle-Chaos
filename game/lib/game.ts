export type Resource = "gold" | "wood" | "stone";
export type GuestKind = "scientist" | "builder" | "wrangler" | "bard";
export type Building = "keep" | "walls" | "workshop" | "tavern" | "quarry";
export type Weapon = "trebuchet" | "ballista" | "goatapult" | "arcane";
export type Guest = {
  id: string;
  kind: GuestKind;
  loyalty: number;
  name: string;
};
export type Player = {
  id: string;
  name: string;
  castle: string;
  color: string;
  bot: boolean;
  plot: number | null;
  hp: number;
  maxHp: number;
  gold: number;
  wood: number;
  stone: number;
  morale: number;
  orders: number;
  shots: number;
  buildings: Record<Building, number>;
  weapons: Record<Weapon, number>;
  guests: Guest[];
  exposed: number;
};
export type Battle = {
  id: string;
  from: string;
  to: string;
  weapon: Weapon | GuestKind;
  damage: number;
  betrayed?: boolean;
};
export type GameEvent = {
  id: string;
  round: number;
  text: string;
  kind: "battle" | "build" | "guest" | "turn" | "notice";
  battle?: Battle;
};
export type Game = {
  version: 1;
  code: string;
  mode: "practice" | "online";
  phase: "lobby" | "settling" | "playing" | "finished";
  players: Player[];
  current: number;
  round: number;
  weather: number;
  visitors: Guest[];
  events: GameEvent[];
  receipts: string[];
  winner: string | null;
  deadline: number;
  seed: number;
};
export type Action =
  | { type: "settle"; plot: number }
  | { type: "build"; building: Building }
  | { type: "craft"; weapon: Weapon }
  | { type: "attack"; target: string; weapon: Weapon }
  | { type: "recruit"; guest: string }
  | { type: "quest"; guest: string; target: string }
  | { type: "feast" | "repair" | "end" | "start" | "start-bots" | "surrender" };
export const COLORS = ["#b9c973", "#d48873", "#8ebcc4", "#be9ccd"];
export const BUILDINGS: Record<
  Building,
  {
    name: string;
    blurb: string;
    detail: string;
    cost: Record<Resource, number>;
  }
> = {
  keep: {
    name: "Grand Keep",
    blurb: "A little more imposing.",
    detail: "+160 maximum health. Restores 160 health.",
    cost: { gold: 100, wood: 45, stone: 90 },
  },
  walls: {
    name: "Stone Ramparts",
    blurb: "Keep your neighbours out.",
    detail: "Reduces incoming damage by 8 per level.",
    cost: { gold: 65, wood: 25, stone: 65 },
  },
  workshop: {
    name: "Siege Workshop",
    blurb: "Bad ideas. Better range.",
    detail:
      "+10 siege damage per level. Unlocks magic and goatapults at level 2.",
    cost: { gold: 90, wood: 70, stone: 30 },
  },
  tavern: {
    name: "The Tipsy Wyvern",
    blurb: "Hospitality has its uses.",
    detail:
      "+8 morale and +6 guest loyalty at the start of your turn, per level.",
    cost: { gold: 75, wood: 60, stone: 25 },
  },
  quarry: {
    name: "Royal Quarry",
    blurb: "Rock-solid investments.",
    detail: "+20 gold, +15 timber and +25 stone income per level.",
    cost: { gold: 65, wood: 50, stone: 15 },
  },
};
export const WEAPONS: Record<
  Weapon,
  {
    name: string;
    blurb: string;
    damage: number;
    cost: Record<Resource, number>;
    ammo: Record<Resource, number>;
  }
> = {
  trebuchet: {
    name: "Trebuchet",
    blurb: "A strongly worded boulder.",
    damage: 90,
    cost: { gold: 80, wood: 65, stone: 25 },
    ammo: { gold: 10, wood: 0, stone: 20 },
  },
  ballista: {
    name: "Ballista",
    blurb: "For pointed conversations.",
    damage: 70,
    cost: { gold: 65, wood: 55, stone: 15 },
    ammo: { gold: 10, wood: 15, stone: 0 },
  },
  goatapult: {
    name: "Goatapult",
    blurb: "The goat has been consulted.",
    damage: 115,
    cost: { gold: 120, wood: 85, stone: 40 },
    ammo: { gold: 25, wood: 10, stone: 0 },
  },
  arcane: {
    name: "Hex Mortar",
    blurb: "An extremely impolite spell.",
    damage: 130,
    cost: { gold: 150, wood: 30, stone: 65 },
    ammo: { gold: 35, wood: 0, stone: 10 },
  },
};
export const GUESTS: Record<
  GuestKind,
  {
    title: string;
    role: string;
    quote: string;
    perk: string;
    quest: string;
    index: number;
  }
> = {
  scientist: {
    title: "Professor Fizzlewick",
    role: "Questionable scientist",
    quote: "Technically, the last explosion was a discovery.",
    perk: "+12 siege damage while in residence.",
    quest: "Sabotage: 60 damage that ignores ramparts.",
    index: 0,
  },
  builder: {
    title: "Brunhilde Brick",
    role: "Master of mortar",
    quote: "I can fix that. Your personality costs extra.",
    perk: "Repairs 35 health at the start of your turn.",
    quest: "Undermine: 40 damage and remove a wall level.",
    index: 1,
  },
  wrangler: {
    title: "Old Goat Garrick",
    role: "Animal whisperer",
    quote: "He bites because he cares. Mostly because he bites.",
    perk: "+15 timber each turn. Goatapult deals +20 damage.",
    quest: "Unleash goats: 45 damage and -18 morale.",
    index: 2,
  },
  bard: {
    title: "Percival the Loud",
    role: "Travelling nuisance",
    quote: "My last audience was moved. To another village.",
    perk: "+20 gold and +8 morale each turn.",
    quest: "A vicious ballad: steal 45 gold and 15 morale.",
    index: 3,
  },
};
export const WEATHER = [
  {
    name: "A suspiciously fine day",
    effect: "Clear skies. Excellent weather for grudges.",
    bonus: 0,
  },
  {
    name: "A most useful tailwind",
    effect: "Trebuchets and goatapults deal +15 damage.",
    bonus: 15,
  },
  {
    name: "A touch of medieval drizzle",
    effect: "Wet ropes: trebuchets and goatapults deal -10 damage.",
    bonus: -10,
  },
  {
    name: "The peasants are restless",
    effect: "Guest loyalty drops by 5 at the start of each turn.",
    bonus: 0,
  },
];
export const HOME_POSITIONS = [
  [-17, -12],
  [20, -7],
  [9, 24],
  [-23, 21],
];
export const CLEARINGS = [
  {
    name: "The Old Meadow",
    detail: "+15 morale. A cheerful patch of mud.",
    offset: [0, 0],
    bonus: "morale",
  },
  {
    name: "Bramble Ridge",
    detail: "+40 health. Rocks build character.",
    offset: [5, 2],
    bonus: "health",
  },
  {
    name: "Whispering Grove",
    detail: "+50 timber. The trees are judging you.",
    offset: [-3, 5],
    bonus: "wood",
  },
];
export function positionOf(p: Player, index: number) {
  const a = HOME_POSITIONS[index] ?? HOME_POSITIONS[0],
    b = CLEARINGS[p.plot ?? 0].offset;
  return { x: a[0] + b[0], z: a[1] + b[1] };
}
const uuid = () => crypto.randomUUID();
const clamp = (v: number, min: number, max: number) =>
  Math.max(min, Math.min(max, v));
export function guest(kind: GuestKind): Guest {
  return {
    id: uuid(),
    kind,
    loyalty: kind === "scientist" ? 62 : 74,
    name: GUESTS[kind].title,
  };
}
export function player(
  id: string,
  name: string,
  index: number,
  bot = false,
): Player {
  return {
    id,
    name,
    castle: [
      "Mossback Keep",
      "Fort Nuisance",
      "Dreadmere Hall",
      "Castle Excess",
    ][index],
    color: COLORS[index],
    bot,
    plot: bot ? 0 : null,
    hp: 260,
    maxHp: 260,
    gold: 280,
    wood: 200,
    stone: 180,
    morale: 72,
    orders: 3,
    shots: 0,
    buildings: { keep: 0, walls: 0, workshop: 0, tavern: 0, quarry: 0 },
    weapons: { trebuchet: 0, ballista: 0, goatapult: 0, arcane: 0 },
    guests: [],
    exposed: 0,
  };
}
export function createGame(
  id = "you",
  name = "Your Lordship",
  code = "PRACTICE",
  online = false,
): Game {
  const game: Game = {
    version: 1,
    code,
    mode: online ? "online" : "practice",
    phase: online ? "lobby" : "settling",
    players: [player(id, name, 0)],
    current: 0,
    round: 1,
    weather: 0,
    visitors: [
      guest("scientist"),
      guest("builder"),
      guest("wrangler"),
      guest("bard"),
    ],
    events: [],
    receipts: [],
    winner: null,
    deadline: Date.now() + 90000,
    seed: Math.floor(Math.random() * 2147483646) + 1,
  };
  if (!online) {
    game.players.push(
      player("bot-1", "Baron von Bother", 1, true),
      player("bot-2", "Lady Mildred", 2, true),
    );
    record(
      game,
      "A Borg Meister falls from the sky. The land is unclaimed. The neighbours are unimpressed.",
      "notice",
    );
  }
  return game;
}
function random(game: Game) {
  game.seed = (game.seed * 16807) % 2147483647;
  return (game.seed - 1) / 2147483646;
}
export function record(
  game: Game,
  text: string,
  kind: GameEvent["kind"],
  battle?: Battle,
) {
  game.events.unshift({
    id: uuid(),
    round: game.round,
    text,
    kind,
    ...(battle ? { battle } : {}),
  });
  game.events = game.events.slice(0, 60);
}
export function buildCost(p: Player, b: Building) {
  const c = BUILDINGS[b].cost,
    n = p.buildings[b] + 1;
  return { gold: c.gold * n, wood: c.wood * n, stone: c.stone * n };
}
export function craftCost(p: Player, w: Weapon) {
  const c = WEAPONS[w].cost,
    n = p.weapons[w] + 1;
  return { gold: c.gold * n, wood: c.wood * n, stone: c.stone * n };
}
export function canAfford(p: Player, c: Record<Resource, number>) {
  return p.gold >= c.gold && p.wood >= c.wood && p.stone >= c.stone;
}
function pay(p: Player, c: Record<Resource, number>) {
  if (!canAfford(p, c))
    throw new Error("Your treasury objects. You need more resources.");
  p.gold -= c.gold;
  p.wood -= c.wood;
  p.stone -= c.stone;
}
export function income(p: Player) {
  return {
    gold:
      65 +
      p.buildings.quarry * 20 +
      p.guests.filter((g) => g.kind === "bard").length * 20,
    wood:
      45 +
      p.buildings.quarry * 15 +
      p.guests.filter((g) => g.kind === "wrangler").length * 15,
    stone: 40 + p.buildings.quarry * 25,
  };
}
export function betrayalRisk(p: Player, g: Guest, target?: Player) {
  return clamp(
    Math.round(
      80 -
        g.loyalty +
        (target ? target.buildings.tavern * 6 : 0) -
        p.buildings.tavern * 4 +
        (p.morale < 35 ? 15 : 0),
    ),
    5,
    70,
  );
}
export function siegeDamage(game: Game, p: Player, target: Player, w: Weapon) {
  return Math.max(
    20,
    WEAPONS[w].damage +
      (p.weapons[w] - 1) * 22 +
      (p.buildings.workshop - 1) * 10 +
      p.guests.filter((g) => g.kind === "scientist").length * 12 +
      (w === "goatapult"
        ? p.guests.filter((g) => g.kind === "wrangler").length * 20
        : 0) +
      (w === "trebuchet" || w === "goatapult"
        ? WEATHER[game.weather].bonus
        : 0) -
      target.buildings.walls * (w === "arcane" ? 4 : 8) +
      (target.exposed > 0 ? 20 : 0),
  );
}
function checkVictory(game: Game) {
  const alive = game.players.filter((p) => p.hp > 0);
  if (alive.length <= 1 || game.round > 30) {
    const ranked = [...alive].sort(
      (a, b) =>
        b.hp +
        b.gold / 4 +
        b.guests.length * 50 -
        (a.hp + a.gold / 4 + a.guests.length * 50),
    );
    game.phase = "finished";
    game.winner = ranked[0]?.id ?? null;
    record(
      game,
      `${ranked[0]?.name ?? "Nobody"} wins the crown. The property market may take years to recover.`,
      "notice",
    );
  }
}
function damage(game: Game, t: Player, n: number) {
  t.hp = Math.max(0, t.hp - n);
  if (!t.hp)
    record(
      game,
      `${t.castle} has fallen. ${t.name} is considering a career in renting.`,
      "notice",
    );
  checkVictory(game);
}
function beginTurn(game: Game) {
  const p = game.players[game.current];
  p.orders = 3;
  p.shots = 0;
  const gains = income(p);
  p.gold = Math.min(3000, p.gold + gains.gold);
  p.wood = Math.min(3000, p.wood + gains.wood);
  p.stone = Math.min(3000, p.stone + gains.stone);
  p.morale = clamp(
    p.morale -
      3 +
      p.buildings.tavern * 8 +
      p.guests.filter((g) => g.kind === "bard").length * 8,
    0,
    100,
  );
  p.hp = Math.min(
    p.maxHp,
    p.hp + p.guests.filter((g) => g.kind === "builder").length * 35,
  );
  p.exposed = Math.max(0, p.exposed - 1);
  p.guests.forEach((g) => {
    g.loyalty = clamp(
      g.loyalty + p.buildings.tavern * 6 - 3 - (game.weather === 3 ? 5 : 0),
      5,
      100,
    );
  });
  game.deadline = Date.now() + 90000;
}
function nextTurn(game: Game) {
  if (game.phase !== "playing") return;
  for (let i = 0; i < game.players.length; i++) {
    game.current = (game.current + 1) % game.players.length;
    if (game.current === 0) {
      game.round++;
      game.weather = Math.floor(random(game) * WEATHER.length);
      if (game.visitors.length < 4) {
        const kinds: GuestKind[] = ["scientist", "builder", "wrangler", "bard"];
        const missing = kinds.find(
          (k) => !game.visitors.some((g) => g.kind === k),
        );
        if (missing) game.visitors.push(guest(missing));
      }
    }
    if (game.players[game.current].hp > 0) break;
  }
  checkVictory(game);
  if (game.phase === "playing") beginTurn(game);
}
function targetOf(game: Game, p: Player, id: string) {
  const t = game.players.find((v) => v.id === id);
  if (!t || t.id === p.id || t.hp <= 0)
    throw new Error("Choose a rival castle that is still standing.");
  return t;
}
export function applyAction(
  source: Game,
  actorId: string,
  action: Action,
  receipt = uuid(),
): Game {
  const game = structuredClone(source);
  if (game.receipts.includes(receipt)) return game;
  const p = game.players.find((v) => v.id === actorId);
  if (!p) throw new Error("You do not have a castle in this realm.");
  if (game.phase === "lobby") {
    if (
      !["start", "start-bots"].includes(action.type) ||
      game.players[0].id !== actorId
    )
      throw new Error("The host must open the battle.");
    if (action.type === "start-bots")
      while (game.players.length < 3) {
        const n = game.players.length;
        game.players.push(
          player(
            `bot-${n}`,
            ["Baron von Bother", "Lady Mildred", "Sir Taxalot"][n - 1],
            n,
            true,
          ),
        );
      }
    if (game.players.length < 2)
      throw new Error(
        "Invite a rival or fill the empty seats with computer players.",
      );
    game.phase = "settling";
    game.deadline = Date.now() + 180000;
    record(
      game,
      "The truce is over. Please keep all grudges inside the kingdom.",
      "notice",
    );
  } else if (game.phase === "settling") {
    if (action.type !== "settle" || p.plot !== null)
      throw new Error("Choose a clearing for your one and only castle.");
    if (
      !Number.isInteger(action.plot) ||
      action.plot < 0 ||
      action.plot >= CLEARINGS.length
    )
      throw new Error("That land is not suitable for a castle.");
    p.plot = action.plot;
    if (action.plot === 0) p.morale = Math.min(100, p.morale + 15);
    if (action.plot === 1) {
      p.hp += 40;
      p.maxHp += 40;
    }
    if (action.plot === 2) p.wood += 50;
    record(
      game,
      `${p.name} settles at ${CLEARINGS[action.plot].name}. A small shelter. Disproportionate ambition.`,
      "build",
    );
    if (game.players.every((v) => v.plot !== null)) {
      game.phase = "playing";
      game.deadline = Date.now() + 90000;
      record(
        game,
        "All Borg Meisters have settled. Build well. Neighbour responsibly.",
        "notice",
      );
    }
  } else {
    if (game.phase !== "playing")
      throw new Error("This battle has ended. A new realm awaits.");
    if (p.hp <= 0)
      throw new Error(
        "Your castle has fallen. You can watch the remaining siege.",
      );
    if (action.type === "surrender") {
      p.hp = 0;
      record(
        game,
        `${p.name} abdicates. The crown was chafing anyway.`,
        "notice",
      );
      checkVictory(game);
      if (game.current === game.players.indexOf(p)) nextTurn(game);
    } else {
      if (game.players[game.current].id !== actorId)
        throw new Error("It is another ruler’s turn. Plot patiently.");
      if (action.type === "end") {
        record(
          game,
          `${p.name} ends their turn. The neighbours look busy.`,
          "turn",
        );
        nextTurn(game);
      } else {
        if (p.orders < 1)
          throw new Error("No orders left. End your turn to collect income.");
        if (action.type === "build") {
          if (!(action.building in BUILDINGS))
            throw new Error("Unknown building.");
          if (p.buildings[action.building] >= 3)
            throw new Error("This building is already at its highest level.");
          pay(p, buildCost(p, action.building));
          p.buildings[action.building]++;
          if (action.building === "keep") {
            p.maxHp += 160;
            p.hp += 160;
          }
          record(
            game,
            `${p.name} ${p.buildings[action.building] === 1 ? "builds" : "upgrades"} ${action.building === "keep" ? ["Shelter", "Timber Hall", "Stone Keep", "Grand Citadel"][p.buildings.keep] : BUILDINGS[action.building].name}. The neighbours pretend not to notice.`,
            "build",
          );
        } else if (action.type === "craft") {
          if (p.buildings.workshop < 1)
            throw new Error("Build a siege workshop before crafting weapons.");
          if (!(action.weapon in WEAPONS))
            throw new Error("Unknown siege engine.");
          if (p.weapons[action.weapon] >= 3)
            throw new Error("This weapon is already at its highest level.");
          if (
            ["goatapult", "arcane"].includes(action.weapon) &&
            p.buildings.workshop < 2
          )
            throw new Error("That much chaos requires a level 2 workshop.");
          pay(p, craftCost(p, action.weapon));
          p.weapons[action.weapon]++;
          record(
            game,
            `${p.name} ${p.weapons[action.weapon] > 1 ? "upgrades" : "builds"} a ${WEAPONS[action.weapon].name.toLowerCase()}. ${WEAPONS[action.weapon].blurb}`,
            "build",
          );
        } else if (action.type === "attack") {
          if ((p.shots ?? 0) >= 1)
            throw new Error(
              "Your siege crews are reloading. Each castle can fire once per turn.",
            );
          if (!(action.weapon in WEAPONS) || !p.weapons[action.weapon])
            throw new Error("Build this siege engine first.");
          const t = targetOf(game, p, action.target);
          pay(p, WEAPONS[action.weapon].ammo);
          p.shots = (p.shots ?? 0) + 1;
          const n = siegeDamage(game, p, t, action.weapon);
          record(
            game,
            `${p.name} hits ${t.castle} for ${n} damage. ${action.weapon === "goatapult" ? "The goat demands a second take." : "Consider the message delivered."}`,
            "battle",
            {
              id: uuid(),
              from: p.id,
              to: t.id,
              weapon: action.weapon,
              damage: n,
            },
          );
          damage(game, t, n);
        } else if (action.type === "recruit") {
          const g = game.visitors.find((v) => v.id === action.guest);
          if (!g) throw new Error("That guest has already found another host.");
          if (p.guests.length >= 4)
            throw new Error(
              "Your court is full. Four eccentric personalities is quite enough.",
            );
          pay(p, { gold: 70, wood: 0, stone: 0 });
          game.visitors = game.visitors.filter((v) => v.id !== g.id);
          p.guests.push(g);
          record(
            game,
            `${g.name} joins ${p.castle}. Their references are almost certainly real.`,
            "guest",
          );
        } else if (action.type === "quest") {
          const g = p.guests.find((v) => v.id === action.guest);
          if (!g) throw new Error("This guest is not in your court.");
          const t = targetOf(game, p, action.target);
          const betrayed = random(game) * 100 < betrayalRisk(p, g, t);
          let n = 0;
          if (betrayed) {
            p.guests = p.guests.filter((v) => v.id !== g.id);
            g.loyalty = 80;
            if (t.guests.length < 4) t.guests.push(g);
            p.exposed = 2;
            record(
              game,
              `${g.name} defects to ${t.castle} and shares your weak points. You take +20 siege damage until your second following turn. Apparently, their soup is better.`,
              "guest",
            );
          } else {
            g.loyalty = Math.max(5, g.loyalty - 16);
            n =
              g.kind === "scientist"
                ? 60
                : g.kind === "builder"
                  ? 40
                  : g.kind === "wrangler"
                    ? 45
                    : 0;
            if (g.kind === "builder")
              t.buildings.walls = Math.max(0, t.buildings.walls - 1);
            if (g.kind === "wrangler") t.morale = Math.max(0, t.morale - 18);
            if (g.kind === "bard") {
              const stolen = Math.min(45, t.gold);
              t.gold -= stolen;
              p.gold += stolen;
              t.morale = Math.max(0, t.morale - 15);
            }
            record(
              game,
              `${g.name} ${g.kind === "bard" ? "steals gold and what remains of the audience’s good mood" : `causes ${n} damage`} at ${t.castle}.`,
              "guest",
            );
          }
          game.events[0].battle = {
            id: uuid(),
            from: p.id,
            to: t.id,
            weapon: g.kind,
            damage: n,
            betrayed,
          };
          if (n) damage(game, t, n);
        } else if (action.type === "feast") {
          pay(p, { gold: 45, wood: 0, stone: 0 });
          p.morale = Math.min(100, p.morale + 22);
          p.guests.forEach((g) => (g.loyalty = Math.min(100, g.loyalty + 18)));
          record(
            game,
            `${p.name} holds a feast. +22 morale, +18 guest loyalty. Nobody asks what is in the stew.`,
            "guest",
          );
        } else if (action.type === "repair") {
          if (p.hp === p.maxHp)
            throw new Error("Your castle is already in excellent condition.");
          pay(p, { gold: 30, wood: 0, stone: 30 });
          p.hp = Math.min(p.maxHp, p.hp + 120);
          record(
            game,
            `${p.name} repairs 120 castle health. The cracks were character, apparently.`,
            "build",
          );
        } else throw new Error("Unknown royal order.");
        p.orders--;
      }
    }
  }
  game.receipts.push(receipt);
  game.receipts = game.receipts.slice(-80);
  return game;
}
export function runBots(source: Game): Game {
  let game = source;
  for (
    let count = 0;
    count < 16 && game.phase === "playing" && game.players[game.current].bot;
    count++
  ) {
    const p = game.players[game.current],
      rivals = game.players.filter((v) => v.id !== p.id && v.hp > 0);
    if (!rivals.length) break;
    if (p.orders <= 0) {
      game = applyAction(game, p.id, { type: "end" });
      continue;
    }
    const t = rivals[Math.floor(random(game) * rivals.length)];
    let a: Action;
    if (p.hp < p.maxHp * 0.4 && p.stone >= 30 && p.gold >= 30)
      a = { type: "repair" };
    else if (p.buildings.keep === 0 && canAfford(p, buildCost(p, "keep")))
      a = { type: "build", building: "keep" };
    else if (
      p.buildings.workshop === 0 &&
      canAfford(p, buildCost(p, "workshop"))
    )
      a = { type: "build", building: "workshop" };
    else if (
      p.buildings.workshop > 0 &&
      p.weapons.trebuchet === 0 &&
      canAfford(p, craftCost(p, "trebuchet"))
    )
      a = { type: "craft", weapon: "trebuchet" };
    else if (
      p.orders === 3 &&
      game.round > 2 &&
      p.buildings.keep < 3 &&
      canAfford(p, buildCost(p, "keep")) &&
      random(game) > 0.35
    )
      a = { type: "build", building: "keep" };
    else if (
      p.orders === 3 &&
      p.buildings.walls < 2 &&
      game.round > 2 &&
      canAfford(p, buildCost(p, "walls"))
    )
      a = { type: "build", building: "walls" };
    else if (
      p.orders === 3 &&
      p.buildings.quarry === 0 &&
      canAfford(p, buildCost(p, "quarry"))
    )
      a = { type: "build", building: "quarry" };
    else if (
      p.orders === 3 &&
      p.guests.length < 2 &&
      game.visitors.length &&
      p.gold >= 70
    )
      a = { type: "recruit", guest: game.visitors[0].id };
    else if (p.guests.length && p.guests[0].loyalty < 45 && p.gold >= 45)
      a = { type: "feast" };
    else if (p.orders === 2 && p.guests.length && random(game) > 0.5)
      a = { type: "quest", guest: p.guests[0].id, target: t.id };
    else if (
      (p.shots ?? 0) < 1 &&
      p.weapons.trebuchet > 0 &&
      canAfford(p, WEAPONS.trebuchet.ammo)
    )
      a = { type: "attack", target: t.id, weapon: "trebuchet" };
    else a = { type: "end" };
    game = applyAction(game, p.id, a);
  }
  return game;
}
export function expireTurn(source: Game) {
  if (source.mode !== "online" || source.deadline >= Date.now()) return source;
  if (source.phase === "settling") {
    let g = source;
    for (const p of source.players) {
      if (p.plot === null) {
        g = applyAction(g, p.id, { type: "settle", plot: 0 });
        record(
          g,
          `${p.name} missed the settling bell. Their steward pitched a shelter in the meadow.`,
          "notice",
        );
      }
    }
    return runBots(g);
  }
  if (source.phase === "playing") {
    const p = source.players[source.current];
    const g = applyAction(source, p.id, { type: "end" });
    record(
      g,
      `${p.name} missed the council bell. Their turn has been passed.`,
      "turn",
    );
    return runBots(g);
  }
  return source;
}
