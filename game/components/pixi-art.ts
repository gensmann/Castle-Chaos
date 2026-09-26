import { Assets, Graphics, Rectangle, Sprite, Texture } from "pixi.js";
import { projectIsometric, type MapPoint } from "@/lib/isometric-view";
import { HOME_POSITIONS } from "@/lib/game";

export const point = (x: number, z: number, y = 0) => {
  const p = projectIsometric({ x, y, z });
  return { x: p.x, y: -p.y };
};
export const depth = (p: MapPoint) => point(p.x, p.z).y;
export type VillageKind =
  | "oak"
  | "spruce"
  | "birch"
  | "rocks"
  | "cottage"
  | "workshop"
  | "tavern"
  | "keep";
export function seededRandom(seed = 428) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}
export async function loadWorldArt() {
  const [village, people] = await Promise.all([
    Assets.load<Texture>("/art/isometric-village-atlas.webp"),
    Assets.load<Texture>("/art/isometric-characters.webp"),
  ]);
  const frames: Texture[] = [];
  const crop = (
    atlas: Texture,
    col: number,
    row: number,
    columns: number,
    rows: number,
    extraTop = 0,
  ) => {
    const w = atlas.width / columns,
      h = atlas.height / rows;
    const texture = new Texture({
      source: atlas.source,
      frame: new Rectangle(
        col * w + 1,
        row * h + 1 - extraTop,
        w - 2,
        h - 2 + extraTop,
      ),
    });
    frames.push(texture);
    return texture;
  };
  const names: VillageKind[] = [
    "oak",
    "spruce",
    "birch",
    "rocks",
    "cottage",
    "workshop",
    "tavern",
    "keep",
  ];
  const props = Object.fromEntries(
    names.map((kind, i) => [
      kind,
      crop(
        village,
        i % 4,
        Math.floor(i / 4),
        4,
        2,
        kind === "keep" ? village.height * 0.023 : 0,
      ),
    ]),
  ) as Record<VillageKind, Texture>;
  const characters = Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: 4 }, (_, col) => crop(people, col, row, 4, 3)),
  );
  return {
    props,
    characters,
    dispose: () => frames.forEach((t) => t.destroy(false)),
  };
}
export function painted(texture: Texture, size: number, anchorY = 0.94) {
  const sprite = new Sprite(texture);
  sprite.anchor.set(0.5, anchorY);
  sprite.width = size;
  sprite.height = (size * texture.height) / texture.width;
  sprite.eventMode = "none";
  return sprite;
}
/** A shaded isometric prism drawn once; it is 2D geometry, with no light/shadow pass. */
export function prism(
  width: number,
  length: number,
  height: number,
  color = 0xb8b9a0,
) {
  const g = new Graphics();
  const p = (x: number, z: number, y: number) => point(x, z, y);
  const a = p(-width / 2, -length / 2, 0),
    b = p(width / 2, -length / 2, 0),
    c = p(width / 2, length / 2, 0);
  const A = p(-width / 2, -length / 2, height),
    B = p(width / 2, -length / 2, height),
    C = p(width / 2, length / 2, height),
    D = p(-width / 2, length / 2, height);
  const shade = (factor: number) =>
    (Math.round(((color >> 16) & 255) * factor) << 16) |
    (Math.round(((color >> 8) & 255) * factor) << 8) |
    Math.round((color & 255) * factor);
  g.poly([a.x, a.y, b.x, b.y, B.x, B.y, A.x, A.y]).fill(shade(0.75));
  g.poly([b.x, b.y, c.x, c.y, C.x, C.y, B.x, B.y]).fill(shade(0.9));
  g.poly([A.x, A.y, B.x, B.y, C.x, C.y, D.x, D.y]).fill(color);
  g.eventMode = "none";
  return g;
}
export const riverX = (z: number) => 3 + Math.sin(z * 0.075) * 8;
export function onLand(x: number, z: number) {
  return (x / 61) ** 2 + (z / 53) ** 2 < 1 && Math.abs(x - riverX(z)) > 2.3;
}

/** One baked ground texture replaces terrain meshes, lighting and material shaders. */
export function createGroundTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1408;
  const ctx = canvas.getContext("2d")!;
  const scale = canvas.width / 160;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(scale, scale);
  const rnd = seededRandom();
  const island = new Path2D();
  for (let n = 0; n <= 160; n++) {
    const angle = (n / 160) * Math.PI * 2;
    const r = 1 + Math.sin(angle * 5) * 0.025 + Math.cos(angle * 9) * 0.015;
    const p = point(Math.cos(angle) * 62 * r, Math.sin(angle) * 54 * r);
    if (n === 0) island.moveTo(p.x, p.y);
    else island.lineTo(p.x, p.y);
  }
  island.closePath();
  ctx.strokeStyle = "#94b9a1";
  ctx.lineWidth = 2.8;
  ctx.stroke(island);
  ctx.strokeStyle = "#c4bd86";
  ctx.lineWidth = 1.1;
  ctx.stroke(island);
  const green = ctx.createLinearGradient(-30, -30, 35, 40);
  green.addColorStop(0, "#91ad60");
  green.addColorStop(0.5, "#a0b973");
  green.addColorStop(1, "#7f9c55");
  ctx.fillStyle = green;
  ctx.fill(island);
  ctx.save();
  ctx.clip(island);
  for (let i = 0; i < 13000; i++) {
    const p = point((rnd() - 0.5) * 128, (rnd() - 0.5) * 114);
    ctx.fillStyle = i % 3 === 0 ? "#cfcd8430" : "#526e3412";
    ctx.beginPath();
    ctx.ellipse(
      p.x,
      p.y,
      0.06 + rnd() * 0.28,
      0.02 + rnd() * 0.1,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  const river = new Path2D();
  for (let z = -65; z <= 65; z++) {
    const p = point(riverX(z), z);
    if (z === -65) river.moveTo(p.x, p.y);
    else river.lineTo(p.x, p.y);
  }
  ctx.lineCap = "round";
  ctx.strokeStyle = "#c4ba80";
  ctx.lineWidth = 3.8;
  ctx.stroke(river);
  ctx.strokeStyle = "#659989";
  ctx.lineWidth = 3.1;
  ctx.stroke(river);
  ctx.strokeStyle = "#6d9fa0";
  ctx.lineWidth = 2.3;
  ctx.stroke(river);
  for (const [x, z] of HOME_POSITIONS) {
    const start = point(x, z - 5),
      end = point(riverX(z) + (x < riverX(z) ? -2 : 2), z - 5);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo((start.x + end.x) / 2, start.y + 2, end.x, end.y);
    ctx.strokeStyle = "#c2bb92";
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.strokeStyle = "#ddd3a63d";
    ctx.lineWidth = 0.32;
    ctx.stroke();
  }
  // Old bridge and weathered farmland are baked into the static ground layer.
  const bridgeZ = -21,
    bx = riverX(bridgeZ);
  for (let i = -5; i <= 5; i++) {
    const a = point(bx + i * 0.5, bridgeZ - 1),
      b = point(bx + i * 0.5, bridgeZ + 1);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = i % 2 ? "#ad8c58" : "#9b794a";
    ctx.lineWidth = 0.38;
    ctx.stroke();
  }
  ctx.restore();
  return Texture.from(canvas);
}
