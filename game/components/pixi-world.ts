import { Application, Container, Graphics, Sprite, VERSION } from "pixi.js";
import type { RefObject } from "react";
import type { Battle, Game, Player } from "@/lib/game";
import { HOME_POSITIONS, CLEARINGS, positionOf } from "@/lib/game";
import {
  detailLevel,
  inIsometricView,
  projectIsometric,
  type DetailLevel,
  type MapPoint,
} from "@/lib/isometric-view";
import {
  stepDebris,
  type DebrisBody,
  type Obstacle,
} from "@/lib/debris-physics";
import { playSound, siegeSound } from "@/lib/game-audio";
import { createIsometricCamera } from "./isometric-camera";
import { createCharacterSprites } from "./character-sprites";
import {
  createGroundTexture,
  loadWorldArt,
  point,
  depth,
  painted,
  prism,
  seededRandom,
  onLand,
  riverX,
  type VillageKind,
} from "./pixi-art";
import type { WorldProps, WorldCommand, WorldRuntime } from "./world";

type Prop = {
  node: Container;
  p: MapPoint;
  size: number;
  detail: number;
  owner?: string;
  piece?: boolean;
  kind?: VillageKind;
};
type Actor = ReturnType<ReturnType<typeof createCharacterSprites>["character"]>;
type Castle = {
  key: string;
  props: Prop[];
  workers: { actor: Actor; offset: number; home: MapPoint }[];
  obstacles: Obstacle[];
  smoke: { sprite: Sprite; p: MapPoint; phase: number }[];
  flag?: Prop;
  engines: Prop[];
  label: HTMLButtonElement;
  title: HTMLSpanElement;
  health: HTMLSpanElement;
  p: MapPoint;
};

export async function createPixiWorld(
  canvas: HTMLCanvasElement,
  propsRef: RefObject<WorldProps>,
  landmarks: HTMLDivElement,
  signal: AbortSignal,
): Promise<WorldRuntime | null> {
  const art = await loadWorldArt();
  if (signal.aborted) {
    art.dispose();
    return null;
  }
  const high = propsRef.current.quality === "high";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const app = new Application();
  try {
    await app.init({
      canvas,
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
      autoStart: false,
      preference: "webgl",
      resolution: Math.min(window.devicePixelRatio || 1, high ? 1.6 : 1),
      autoDensity: false,
      antialias: true,
      background: 0x6eaaa9,
      powerPreference: high ? "high-performance" : "low-power",
    });
  } catch (error) {
    art.dispose();
    throw error;
  }
  if (signal.aborted) {
    app.destroy(false, { children: true });
    art.dispose();
    return null;
  }
  let disposed = false;
  const root = new Container();
  const floor = new Container();
  const objects = new Container({ sortableChildren: true });
  root.addChild(floor, objects);
  app.stage.addChild(root);
  root.eventMode = "none";
  const groundTexture = createGroundTexture();
  const ground = painted(groundTexture, 160, 0.5);
  floor.addChild(ground);
  const shadowGraphic = new Graphics()
    .ellipse(0, 0, 1, 0.45)
    .fill({ color: 0x293b28, alpha: 0.2 });
  const shadowTexture = app.renderer.generateTexture({
    target: shadowGraphic,
    resolution: 24,
  });
  shadowGraphic.destroy();
  const puffGraphic = new Graphics().circle(0, 0, 1).fill(0xf3e7cb);
  const puffTexture = app.renderer.generateTexture({
    target: puffGraphic,
    resolution: 20,
  });
  puffGraphic.destroy();
  const sharedShapes = new Map<string, Graphics>();
  const shape = (w: number, d: number, h: number, color = 0xc1bea0) => {
    const key = `${w}:${d}:${h}:${color}`;
    let base = sharedShapes.get(key);
    if (!base) {
      base = prism(w, d, h, color);
      sharedShapes.set(key, base);
    }
    return new Graphics(base.context);
  };
  const all: Prop[] = [];
  const actors = createCharacterSprites(art.characters, objects);
  const hero = actors.character(true);
  const castles = new Map<string, Castle>();
  let data = propsRef.current.game,
    me = propsRef.current.me,
    selected = propsRef.current.selection;
  let lod: DetailLevel = "near",
    time = 0,
    diagnostic = 0,
    stepClock = 0,
    landing = 0;
  let heroTarget: MapPoint = { x: -17, y: 0, z: -12 };
  let first = true;
  let battle: {
    event: Battle;
    from: MapPoint;
    to: MapPoint;
    time: number;
    hit: boolean;
    node: Graphics;
    shadow: Sprite;
    engine?: Prop;
  } | null = null;
  const rubble: { body: DebrisBody; node: Container; spin: number }[] = [];
  const waves: { node: Graphics; age: number; p: MapPoint }[] = [];
  const view = createIsometricCamera(canvas, reduced, selectAt, (overview) =>
    propsRef.current.onViewChange(overview),
  );
  const rnd = seededRandom();
  const add = (
    node: Container,
    p: MapPoint,
    size: number,
    detail = 0,
    castle?: Castle,
    piece = false,
    kind?: VillageKind,
  ) => {
    const pos = point(p.x, p.z, p.y);
    node.position.set(pos.x, pos.y);
    node.zIndex = depth(p) + p.y * 0.001;
    objects.addChild(node);
    const prop = { node, p, size, detail, piece, kind };
    all.push(prop);
    castle?.props.push(prop);
    return prop;
  };
  const propSprite = (
    kind: VillageKind,
    p: MapPoint,
    size: number,
    castle?: Castle,
  ) => add(painted(art.props[kind], size), p, size, 0, castle, false, kind);
  const rings = CLEARINGS.map(() => {
    const ring = new Graphics()
      .ellipse(0, 0, 1.7, 0.94)
      .stroke({ color: 0xe1eca9, width: 0.1 });
    floor.addChild(ring);
    return ring;
  });
  for (let i = 0; i < (high ? 390 : 260); i++) {
    const x = (rnd() - 0.5) * 116,
      z = (rnd() - 0.5) * 102;
    if (
      !onLand(x, z) ||
      HOME_POSITIONS.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 13)
    )
      continue;
    const kind: VillageKind =
      i % 7 === 0
        ? "rocks"
        : (["oak", "spruce", "birch"] as VillageKind[])[i % 3];
    const size = kind === "rocks" ? 1.8 + rnd() * 1.4 : 4.6 + rnd() * 2.6;
    propSprite(kind, { x, y: 0, z }, size);
  }
  // One shared geometry for tiny flowers, hidden at middle/far LOD.
  const flower = new Graphics()
    .circle(0, -0.15, 0.07)
    .fill(0xe2c56e)
    .moveTo(0, 0)
    .lineTo(0, -0.15)
    .stroke({ color: 0x648348, width: 0.03 });
  for (let i = 0; i < (high ? 380 : 150); i++) {
    const x = (rnd() - 0.5) * 100,
      z = (rnd() - 0.5) * 86;
    if (
      onLand(x, z) &&
      !HOME_POSITIONS.some(([hx, hz]) => Math.hypot(x - hx, z - hz) < 6)
    )
      add(new Graphics(flower.context), { x, y: 0, z }, 0.4, 2);
  }
  const ripples = Array.from({ length: high ? 34 : 18 }, (_, i) => {
    const z = -49 + (i * 98) / (high ? 34 : 18),
      p = { x: riverX(z), y: 0, z };
    const g = new Graphics()
      .moveTo(-0.45, 0)
      .lineTo(0.4, 0)
      .stroke({ color: 0xb5d7bc, width: 0.045, alpha: 0.6 });
    floor.addChild(g);
    return { g, p, phase: i * 0.7 };
  });
  const birds = Array.from({ length: high ? 5 : 2 }, (_, i) => {
    const g = new Graphics();
    objects.addChild(g);
    return { g, phase: i * 2.2 };
  });

  function destroyCastle(c: Castle) {
    for (const p of c.props) {
      p.node.destroy({ children: true, context: false });
      const i = all.indexOf(p);
      if (i >= 0) all.splice(i, 1);
    }
    c.workers.forEach((w) => w.actor.destroy());
    c.smoke.forEach((s) => s.sprite.destroy());
    c.label.remove();
  }
  function buildCastle(p: Player, index: number, key: string) {
    const location = positionOf(p, index),
      home = { ...location, y: 0 };
    const label = document.createElement("button"),
      title = document.createElement("span"),
      track = document.createElement("span"),
      health = document.createElement("span");
    label.className = "realm-landmark";
    track.className = "landmark-track";
    track.appendChild(health);
    label.appendChild(title);
    label.appendChild(track);
    label.addEventListener("click", () =>
      propsRef.current.onSelectPlayer(p.id),
    );
    landmarks.appendChild(label);
    const c: Castle = {
      key,
      props: [],
      workers: [],
      obstacles: [],
      smoke: [],
      engines: [],
      label,
      title,
      health,
      p: home,
    };
    castles.set(p.id, c);
    const local = (x: number, z: number, y = 0) => ({
      x: home.x + x,
      y,
      z: home.z + z,
    });
    const solid = (x: number, z: number, w: number, d: number, h: number) =>
      c.obstacles.push({
        x: home.x + x,
        z: home.z + z,
        halfX: w / 2,
        halfZ: d / 2,
        height: h,
      });
    if (p.plot === null) {
      label.hidden = true;
      return;
    }
    const foundation = new Graphics()
      .ellipse(0, 0, 6, 3.4)
      .fill({ color: 0xc7bb87, alpha: 0.8 });
    add(foundation, local(0, 0), 8, 0, c).node.zIndex = depth(home) - 10;
    const main = p.buildings.keep > 1 ? "keep" : "cottage";
    if (p.buildings.keep > 0)
      propSprite(
        main,
        local(0.7, -0.6),
        main === "keep" ? 9.6 + (p.buildings.keep - 2) * 1.1 : 6.2,
        c,
      );
    else {
      const shelter = new Graphics()
        .poly([-2, 0, 0, -2.5, 2, 0])
        .fill(0xb79051)
        .poly([0, -2.5, 1.7, -1.4, 3, 1, 2, 0])
        .fill(0x826b43)
        .poly([-0.6, 0, 0, -1.6, 0.6, 0])
        .fill(0x544e35);
      add(shelter, local(0, 0), 4, 0, c);
    }
    solid(
      0,
      0,
      p.buildings.keep > 1 ? 5 : 3.6,
      3.4,
      p.buildings.keep > 1 ? 5 : 3.5,
    );
    const chimney = (x: number, z: number, y: number) => {
      for (let i = 0; i < (high ? 5 : 3); i++) {
        const sprite = painted(puffTexture, 0.5, 0.5);
        sprite.alpha = 0.13;
        objects.addChild(sprite);
        c.smoke.push({
          sprite,
          p: local(x, z, y),
          phase: i / (high ? 5 : 3) + index * 0.19,
        });
      }
    };
    if (p.buildings.keep > 0) chimney(0.9, 0.4, 4);
    if (p.buildings.tavern) {
      propSprite("tavern", local(-7.2, -1), 5.6, c);
      solid(-7.2, -1, 3.5, 3, 3);
      chimney(-6.8, -0.4, 3.4);
    }
    if (p.buildings.workshop) {
      propSprite("workshop", local(6.8, 1.5), 4.8, c);
      solid(6.8, 1.5, 3.2, 2.8, 2.6);
      chimney(7.1, 2, 2.8);
    }
    if (p.buildings.quarry) {
      for (let i = 0; i < 4; i++)
        propSprite("rocks", local(-7 + i * 0.7, 5.2 + (i % 2) * 0.8), 2.4, c);
    }
    if (p.buildings.keep && p.hp > 0) {
      for (let i = 0; i < (p.buildings.workshop || high ? 2 : 1); i++) {
        const actor = actors.character(
          false,
          i === 1 && p.buildings.workshop ? "hammer" : "carry",
        );
        c.workers.push({ actor, home, offset: i * Math.PI + index * 0.9 });
      }
    }
    if (p.buildings.walls && p.hp > 0) {
      const height = 2 + p.buildings.walls * 0.5;
      const blockHeight = high ? 0.65 : 0.9,
        blockWidth = high ? 1 : 1.6;
      const wall = (x: number, z: number, length: number, alongX: boolean) => {
        solid(x, z, alongX ? length : 0.65, alongX ? 0.65 : length, height);
        const count = Math.ceil(length / blockWidth),
          rows = Math.ceil(height / blockHeight);
        for (let row = 0; row < rows; row++)
          for (let i = 0; i < count; i++) {
            const t = ((i + 0.5) * length) / count - length / 2;
            const pos = local(
              x + (alongX ? t : 0),
              z + (alongX ? 0 : t),
              (row * height) / rows,
            );
            add(
              shape(
                alongX ? length / count - 0.03 : 0.65,
                alongX ? 0.65 : length / count - 0.03,
                height / rows - 0.035,
              ),
              pos,
              2,
              0,
              c,
              true,
            );
          }
        for (let i = 0; i < count; i += 2) {
          const t = ((i + 0.5) * length) / count - length / 2;
          add(
            shape(alongX ? 0.8 : 0.72, alongX ? 0.72 : 0.8, 0.5),
            local(x + (alongX ? t : 0), z + (alongX ? 0 : t), height),
            2,
            0,
            c,
            true,
          );
        }
      };
      wall(-5.5, 0, 10.8, false);
      wall(5.5, 0, 10.8, false);
      wall(0, 5.4, 11, true);
      wall(-3.5, -5.4, 4, true);
      wall(3.5, -5.4, 4, true);
      for (const x of [-5.5, 5.5])
        for (const z of [-5.4, 5.4]) {
          add(shape(1.9, 1.9, height + 1), local(x, z), 4, 0, c, true);
          solid(x, z, 1.9, 1.9, height + 1);
          for (const dx of [-0.65, 0.65])
            for (const dz of [-0.65, 0.65])
              add(
                shape(0.55, 0.55, 0.6),
                local(x + dx, z + dz, height + 1),
                2,
                0,
                c,
                true,
              );
        }
    }
    const flag = new Graphics()
      .moveTo(0, 0)
      .lineTo(0, -3.7)
      .stroke({ color: 0x675039, width: 0.1 })
      .poly([0, -3.7, 1.2, -3.4, 0.9, -2.8, 0, -3])
      .fill(p.color);
    c.flag = add(flag, local(-2.6, 1.3), 4, 0, c);
    if (p.buildings.keep > 0) {
      for (let i = 0; i < 5; i++)
        add(
          shape(0.4, 0.45, 0.38, 0x957345),
          local(-2.5 + (i % 3) * 0.5, -2.6 + Math.floor(i / 3) * 0.5),
          1,
          1,
          c,
        );
      const field = new Graphics()
        .poly([-2, 0, 0, -1.1, 2, 0, 0, 1.1])
        .fill(0x9e8c57);
      for (let i = 0; i < 12; i++) {
        const x = (i % 4) * 0.7 - 1,
          z = Math.floor(i / 4) * 0.5 - 0.5;
        field.ellipse(x, z, 0.16, 0.08).fill(i % 3 ? 0x8baf53 : 0xccac6a);
      }
      add(field, local(-7.6, 3.5), 4, 1, c);
    }
    const weapons = Object.entries(p.weapons).filter(([, level]) => level > 0);
    weapons.forEach(([kind], i) => {
      const engine = new Container();
      const body = shape(1.6, 2, 0.7, 0x8f7048);
      engine.addChild(body);
      const rig = new Graphics()
        .moveTo(-0.8, 0)
        .lineTo(0, -2.5)
        .lineTo(0.9, 0)
        .stroke({ color: 0x775537, width: 0.25 });
      rig
        .moveTo(0, -2.4)
        .lineTo(1.8, -3.6)
        .stroke({ color: kind === "arcane" ? 0x9c7eb5 : 0xc09c62, width: 0.2 });
      if (kind === "ballista")
        rig
          .moveTo(-1.3, -1.6)
          .quadraticCurveTo(0, -2.6, 1.4, -1.6)
          .stroke({ color: 0x685038, width: 0.16 });
      if (kind === "arcane") rig.circle(0.3, -1.4, 0.6).fill(0x9e83ba);
      for (const x of [-0.85, 0.85])
        rig
          .circle(x, 0.1, 0.36)
          .fill(0x5d4935)
          .circle(x, 0.1, 0.12)
          .fill(0xb49b65);
      engine.addChild(rig);
      c.engines.push(add(engine, local(-3 + i * 2.1, -7.1), 5, 0, c));
    });
    if (p.hp <= 0) {
      c.props.forEach((o) => {
        o.node.alpha = 0.4;
        if (o.kind) o.node.rotation = 0.1;
      });
      c.obstacles = [];
    }
  }
  function update(g: Game, id: string, plot: number) {
    data = g;
    me = id;
    selected = plot;
    g.players.forEach((p, i) => {
      const key = JSON.stringify([p.plot, p.buildings, p.weapons, p.hp <= 0]);
      const old = castles.get(p.id);
      if (old?.key !== key) {
        if (old) destroyCastle(old);
        buildCastle(p, i, key);
      }
      const c = castles.get(p.id)!;
      c.title.textContent = p.castle;
      c.label.style.setProperty("--team-color", p.color);
      c.label.setAttribute(
        "aria-label",
        `${p.castle}, ${p.hp} of ${p.maxHp} health. Focus stronghold`,
      );
      c.health.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    });
    for (const [id, c] of castles)
      if (!g.players.some((p) => p.id === id)) {
        destroyCastle(c);
        castles.delete(id);
      }
    const index = Math.max(
        0,
        g.players.findIndex((p) => p.id === me),
      ),
      mine = g.players[index],
      base = HOME_POSITIONS[index] ?? HOME_POSITIONS[0];
    const settling = g.phase === "settling" && mine.plot === null;
    const pos = positionOf(mine, index);
    heroTarget = settling
      ? {
          x: base[0] + CLEARINGS[plot].offset[0],
          z: base[1] + CLEARINGS[plot].offset[1],
          y: 0,
        }
      : { x: pos.x - 2, z: pos.z - 2, y: 0 };
    rings.forEach((r, i) => {
      const p = point(
        base[0] + CLEARINGS[i].offset[0],
        base[1] + CLEARINGS[i].offset[1],
      );
      r.position.set(p.x, p.y);
      r.visible = settling;
      r.alpha = i === plot ? 1 : 0.4;
      r.scale.set(i === plot ? 1.12 : 0.8);
    });
    if (first) {
      first = false;
      Object.assign(hero.p, heroTarget);
      hero.p.y = reduced ? 0 : 20;
      landing = reduced ? 2 : 0;
      view.focus({ ...pos, y: 2 }, true);
    }
  }
  function command(c: WorldCommand) {
    if (battle) return;
    if (c.kind === "zoom-in") view.zoom(1 / 1.25);
    else if (c.kind === "zoom-out") view.zoom(1.25);
    else if (c.kind === "realm")
      view.frame(
        data.players.map((p, i) => ({ ...positionOf(p, i), y: 3 })),
        14,
        true,
      );
    else {
      const i = Math.max(
        0,
        data.players.findIndex((p) => p.id === (c.id ?? me)),
      );
      view.focus({ ...positionOf(data.players[i], i), y: 2 });
    }
  }
  function attack(event: Battle | null) {
    if (battle) {
      battle.node.destroy();
      battle.shadow.destroy();
      if (battle.engine) battle.engine.node.rotation = 0;
      battle = null;
    }
    view.lock(false);
    if (!event) return;
    const f = data.players.findIndex((p) => p.id === event.from),
      t = data.players.findIndex((p) => p.id === event.to);
    if (f < 0 || t < 0) {
      queueMicrotask(() => {
        if (!disposed) propsRef.current.onBattleEnd();
      });
      return;
    }
    const from = { ...positionOf(data.players[f], f), y: 2 },
      to = { ...positionOf(data.players[t], t), y: 1 };
    from.z -= 7;
    to.z -= data.players[t].buildings.walls ? 5.4 : 1;
    const node = new Graphics()
      .circle(0, 0, event.weapon === "ballista" ? 0.18 : 0.42)
      .fill(event.weapon === "arcane" ? 0xc199ef : 0xb0a185)
      .stroke({ color: 0x716951, width: 0.06 });
    objects.addChild(node);
    const shadow = painted(shadowTexture, 1, 0.5);
    floor.addChild(shadow);
    battle = {
      event,
      from,
      to,
      time: 0,
      hit: false,
      node,
      shadow,
      engine: castles.get(event.from)?.engines[0],
    };
    view.lock(true);
    view.frame(
      [from, to, { x: (from.x + to.x) / 2, y: 16, z: (from.z + to.z) / 2 }],
      10,
    );
    playSound(siegeSound(event.weapon));
  }
  function selectAt(x: number, y: number) {
    if (battle) return;
    const index = Math.max(
        0,
        data.players.findIndex((p) => p.id === me),
      ),
      mine = data.players[index];
    if (data.phase === "settling" && mine.plot === null) {
      const base = HOME_POSITIONS[index] ?? HOME_POSITIONS[0],
        world = view.ground(x, y);
      const distances = CLEARINGS.map((p) =>
        Math.hypot(
          world.x - base[0] - p.offset[0],
          world.z - base[1] - p.offset[1],
        ),
      );
      const nearest = distances.indexOf(Math.min(...distances));
      if (distances[nearest] < 9) propsRef.current.onSelectPlot(nearest);
      return;
    }
    const rect = canvas.getBoundingClientRect();
    // Test the actually rendered sprite silhouettes' bounds, front to back.
    for (const c of [...castles.values()].sort(
      (a, b) => depth(b.p) - depth(a.p),
    )) {
      if (!c.props.length) continue;
      for (const prop of c.props) {
        if (
          !prop.kind ||
          !["cottage", "keep", "workshop", "tavern"].includes(prop.kind)
        )
          continue;
        const bounds = prop.node.getBounds();
        if (
          x - rect.left >= bounds.x &&
          x - rect.left <= bounds.x + bounds.width &&
          y - rect.top >= bounds.y &&
          y - rect.top <= bounds.y + bounds.height
        ) {
          const owner = [...castles].find(([, v]) => v === c)?.[0];
          if (owner) propsRef.current.onSelectPlayer(owner);
          return;
        }
      }
      const world = view.ground(x, y);
      if (Math.hypot(world.x - c.p.x, world.z - c.p.z) < 7) {
        const owner = [...castles].find(([, v]) => v === c)?.[0];
        if (owner) propsRef.current.onSelectPlayer(owner);
        return;
      }
    }
  }
  function impact(event: Battle, p: MapPoint) {
    const c = castles.get(event.to);
    if (event.damage > 0) {
      const pieces =
        c?.props
          .filter((o) => o.piece)
          .sort(
            (a, b) =>
              Math.hypot(a.p.x - p.x, a.p.z - p.z) -
              Math.hypot(b.p.x - p.x, b.p.z - p.z),
          ) ?? [];
      const count = Math.min(
        high ? 34 : 22,
        Math.max(8, Math.round(event.damage / 5)),
      );
      for (let i = 0; i < count; i++) {
        const piece = pieces[i];
        let node: Container;
        const start = piece
          ? { ...piece.p }
          : {
              x: p.x + (rnd() - 0.5) * 3,
              y: 1 + rnd() * 2,
              z: p.z + (rnd() - 0.5) * 2,
            };
        if (piece) {
          node = piece.node;
          const idx = all.indexOf(piece);
          if (idx >= 0) all.splice(idx, 1);
          c!.props.splice(c!.props.indexOf(piece), 1);
        } else {
          node = shape(0.35 + rnd() * 0.4, 0.4, 0.4);
          objects.addChild(node);
        }
        const angle = rnd() * Math.PI * 2;
        rubble.push({
          node,
          spin: (rnd() - 0.5) * 5,
          body: {
            ...start,
            y: Math.max(0.4, start.y),
            vx: Math.cos(angle) * (1 + rnd() * 4),
            vy: 3 + rnd() * 5,
            vz: Math.sin(angle) * (1 + rnd() * 4),
            radius: 0.25,
            age: 0,
            sleeping: false,
          },
        });
      }
      while (rubble.length > (high ? 100 : 60)) {
        rubble.shift()!.node.destroy({ children: true, context: false });
      }
    }
    const node = new Graphics().ellipse(0, 0, 1, 0.5).stroke({
      color: event.weapon === "arcane" ? 0xdcb2ee : 0xe8dbb2,
      width: 0.12,
    });
    floor.addChild(node);
    waves.push({ node, age: 0, p });
    playSound("impact", Math.min(1, 0.5 + event.damage / 180));
  }
  const resize = () => {
    app.renderer.resize(
      Math.max(1, canvas.clientWidth),
      Math.max(1, canvas.clientHeight),
    );
    view.resize();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  const visibility = () => {
    if (document.hidden) app.stop();
    else if (!disposed) app.start();
  };
  document.addEventListener("visibilitychange", visibility);
  app.ticker.maxFPS = high ? 60 : 30;
  app.ticker.add((ticker) => {
    const dt = Math.min(0.05, ticker.deltaMS / 1000);
    if (!reduced) time += dt;
    landing += dt;
    view.update(dt);
    const scale = canvas.clientHeight / view.span,
      center = projectIsometric(view.camera.target),
      aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight);
    root.scale.set(scale);
    root.position.set(
      canvas.clientWidth / 2 - center.x * scale,
      canvas.clientHeight / 2 + center.y * scale,
    );
    lod = detailLevel(scale, lod);
    for (const o of all)
      o.node.visible =
        (o.detail === 0 || (o.detail === 1 ? lod !== "far" : lod === "near")) &&
        inIsometricView(o.p, view.camera.target, view.span, aspect, o.size);
    const dx = heroTarget.x - hero.p.x,
      dz = heroTarget.z - hero.p.z,
      distance = Math.hypot(dx, dz),
      speed = landing < 1.7 ? 0 : Math.min(4, distance * 5);
    if (distance > 0.02 && speed > 0) {
      const step = Math.min(distance, speed * dt);
      hero.p.x += (dx / distance) * step;
      hero.p.z += (dz / distance) * step;
      hero.facing = dx + dz < 0 ? -1 : 1;
    }
    hero.p.y = landing < 1.7 ? Math.max(0, 20 - 14 * landing * landing) : 0;
    hero.tick(
      time,
      dt,
      speed / 1.3,
      lod,
      view.camera.target,
      view.span,
      aspect,
      reduced,
    );
    for (const c of castles.values()) {
      for (const w of c.workers) {
        const phase = time * 0.32 + w.offset,
          working = w.actor.activity === "hammer";
        w.actor.p.x = w.home.x + (working ? 7.2 : Math.sin(phase) * 1.8);
        w.actor.p.z =
          w.home.z + (working ? -1.3 : -3.5 + Math.cos(phase) * 0.55);
        w.actor.facing = working
          ? 1
          : Math.cos(phase) * 1.8 - Math.sin(phase) * 0.55 < 0
            ? -1
            : 1;
        w.actor.tick(
          time + w.offset,
          reduced ? 0 : dt,
          working || reduced ? 0 : 0.65,
          lod,
          view.camera.target,
          view.span,
          aspect,
          reduced,
        );
      }
      c.smoke.forEach((s, i) => {
        s.sprite.visible =
          lod !== "far" &&
          (lod === "near" || i % 3 === 0) &&
          inIsometricView(s.p, view.camera.target, view.span, aspect, 5);
        if (!s.sprite.visible) return;
        const age = (time * 0.16 + s.phase) % 1,
          p = point(s.p.x + age, s.p.z + age * 0.5, s.p.y + age * 3);
        s.sprite.position.set(p.x, p.y);
        s.sprite.width = s.sprite.height = 0.25 + age * 0.9;
        s.sprite.alpha = Math.sin(age * Math.PI) * 0.16;
        s.sprite.zIndex = depth(s.p) + 2;
      });
      if (c.flag && !reduced && lod !== "far")
        c.flag.node.skew.x = Math.sin(time * 2.5 + c.p.x) * 0.03;
      const position = view.screen({ ...c.p, y: 6 });
      c.label.hidden =
        !!battle ||
        !(view.overview || view.span > 52) ||
        !c.props.length ||
        position.x < 30 ||
        position.x > canvas.clientWidth - 30 ||
        position.y < 25 ||
        position.y > canvas.clientHeight - 20;
      if (!c.label.hidden)
        c.label.style.transform = `translate(${position.x}px,${position.y}px) translate(-50%,-100%)`;
    }
    for (const r of ripples) {
      const p = point(
        r.p.x + Math.sin(time * 0.5 + r.phase) * 0.4,
        r.p.z + ((time * 0.5 + r.phase) % 2),
      );
      r.g.position.set(p.x, p.y);
      r.g.alpha = 0.3 + Math.sin(time + r.phase) * 0.15;
    }
    birds.forEach((b) => {
      b.g.visible = !reduced && lod === "near";
      if (!b.g.visible) return;
      const phase = time * 0.085 + b.phase,
        pos = point(Math.cos(phase) * 30, Math.sin(phase) * 24, 10);
      b.g.position.set(pos.x, pos.y);
      b.g.zIndex = 100;
      const flap = Math.sin(time * 7 + b.phase) * 0.2;
      b.g
        .clear()
        .moveTo(-0.35, flap)
        .lineTo(0, 0)
        .lineTo(0.35, flap)
        .stroke({ color: 0x38483a, width: 0.055 });
    });
    if (battle) {
      const b = battle;
      b.time += dt;
      const t = Math.min(1, b.time / 3.4);
      const pos = {
        x: b.from.x + (b.to.x - b.from.x) * t,
        z: b.from.z + (b.to.z - b.from.z) * t,
        y: b.from.y + (b.to.y - b.from.y) * t + 56 * t * (1 - t),
      };
      const screen = point(pos.x, pos.z, pos.y),
        groundPos = point(pos.x, pos.z);
      b.node.position.set(screen.x, screen.y);
      b.node.zIndex = depth(pos) + 20;
      b.node.rotation += dt * 4;
      b.shadow.position.set(groundPos.x, groundPos.y);
      b.shadow.alpha = 0.6;
      if (b.engine)
        b.engine.node.rotation =
          -Math.sin(Math.min(1, b.time / 0.35) * Math.PI) * 0.18;
      if (b.time >= 2.2 && b.time - dt < 2.2) view.focus(b.to);
      if (t >= 1 && !b.hit) {
        b.hit = true;
        b.node.visible = false;
        b.shadow.visible = false;
        impact(b.event, b.to);
      }
      if (b.time > 5.3) {
        b.node.destroy();
        b.shadow.destroy();
        if (b.engine) b.engine.node.rotation = 0;
        battle = null;
        view.lock(false);
        propsRef.current.onBattleEnd();
      }
    }
    if (rubble.some((r) => !r.body.sleeping)) {
      stepClock += dt;
      const bodies = rubble.map((r) => r.body),
        obstacles = [...castles.values()].flatMap((c) => c.obstacles);
      while (stepClock >= 1 / 60) {
        stepDebris(bodies, obstacles, 1 / 60);
        stepClock -= 1 / 60;
      }
    } else stepClock = 0;
    for (const r of rubble) {
      const p = point(r.body.x, r.body.z, r.body.y);
      r.node.position.set(p.x, p.y);
      r.node.zIndex = depth(r.body) + 0.1;
      if (!r.body.sleeping) r.node.rotation += r.spin * dt;
      r.node.visible = inIsometricView(
        r.body,
        view.camera.target,
        view.span,
        aspect,
        2,
      );
    }
    for (let i = waves.length - 1; i >= 0; i--) {
      const w = waves[i];
      w.age += dt;
      const p = point(w.p.x, w.p.z);
      w.node.position.set(p.x, p.y);
      w.node.scale.set(1 + w.age * 8);
      w.node.alpha = Math.max(0, 1 - w.age);
      if (w.age > 1) {
        w.node.destroy();
        waves.splice(i, 1);
      }
    }
    app.ticker.maxFPS =
      high ||
      battle ||
      view.moving ||
      rubble.some((r) => !r.body.sleeping) ||
      speed > 0.1
        ? 60
        : 30;
    // A small weather tint is a cheap substitute for a dynamic lighting pass.
    root.tint = data.weather === 2 ? 0xc1cdd0 : 0xffffff;
    diagnostic += dt;
    if (diagnostic >= 0.5) {
      diagnostic = 0;
      Object.assign(canvas.dataset, {
        engine: `PixiJS ${VERSION}`,
        renderer: "webgl",
        physics: "fixed-step-2.5d",
        lod,
        characters: "sprites",
        quality: high ? "high" : "low",
        frameBudget: String(app.ticker.maxFPS),
        fps: String(Math.round(ticker.FPS)),
        activeSprites: String(objects.children.filter((c) => c.visible).length),
        rubble: String(rubble.length),
        cameraTarget: `${view.camera.target.x.toFixed(2)},${view.camera.target.z.toFixed(2)}`,
      });
    }
  });
  update(data, me, selected);
  if (propsRef.current.command) command(propsRef.current.command);
  if (propsRef.current.battle) attack(propsRef.current.battle);
  if (!document.hidden) app.start();
  return {
    update,
    command,
    attack,
    dispose() {
      disposed = true;
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      view.dispose();
      landmarks.replaceChildren();
      app.stop();
      app.destroy(false, {
        children: true,
        context: false,
        texture: false,
        textureSource: false,
      });
      groundTexture.destroy(true);
      shadowTexture.destroy(true);
      puffTexture.destroy(true);
      art.dispose();
      flower.destroy({ context: true });
      sharedShapes.forEach((g) => g.destroy({ context: true }));
    },
  };
}
