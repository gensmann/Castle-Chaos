import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { Scene } from "@babylonjs/core/scene";

/** Small deterministic painted surfaces, shared across the entire village. */
export function villageTexture(
  scene: Scene,
  kind: "stone" | "timber" | "slate" | "clay" | "thatch" | "road",
) {
  const texture = new DynamicTexture(
    `Painted village ${kind}`,
    256,
    scene,
    true,
  );
  const ctx = texture.getContext();
  let seed = 9041;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  if (kind === "clay" || kind === "slate" || kind === "stone") {
    const stone = kind === "stone";
    const palette = stone
      ? ["#d6cbb2", "#c4b99f", "#e0d5bc", "#ccc1ab"]
      : kind === "clay"
        ? ["#c66b3c", "#b95833", "#d77b46", "#bf623b"]
        : ["#638697", "#527787", "#7192a0", "#60818f"];
    const width = stone ? 64 : 32,
      height = stone ? 32 : 42.6667;
    ctx.fillStyle = stone ? "#8c8068" : "#3e4944";
    ctx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++)
      for (let column = -1; column < 9; column++) {
        const x = column * width + ((row % 2) * width) / 2,
          y = row * height;
        ctx.fillStyle = palette[Math.floor(random() * palette.length)];
        ctx.fillRect(x + 1, y + 1, width - 2, height - 2);
        ctx.fillStyle = "rgba(255,239,192,.2)";
        ctx.fillRect(x + 2, y + 2, width - 4, 2);
        ctx.fillStyle = "rgba(37,35,26,.18)";
        ctx.fillRect(x + 2, y + height - 4, width - 4, 2);
      }
  } else {
    ctx.fillStyle =
      kind === "timber" ? "#c69a65" : kind === "thatch" ? "#d7ae5c" : "#cdb989";
    ctx.fillRect(0, 0, 256, 256);
    const count = kind === "road" ? 2800 : 600;
    for (let i = 0; i < count; i++) {
      ctx.fillStyle = i % 2 ? "rgba(72,51,27,.13)" : "rgba(255,239,187,.18)";
      const x = random() * 256,
        y = random() * 256;
      ctx.fillRect(
        x,
        y,
        kind === "road" ? 1 + random() * 3 : 0.5 + random(),
        kind === "road" ? 1.5 : 12 + random() * 40,
      );
    }
    if (kind === "timber")
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = "rgba(63,42,24,.22)";
        ctx.fillRect(i * 64, 0, 2, 256);
      }
  }
  texture.update(false);
  return texture;
}
