import { Container, Sprite, Texture } from "pixi.js";
import {
  inIsometricView,
  projectIsometric,
  type DetailLevel,
  type MapPoint,
} from "@/lib/isometric-view";
import { playSound } from "@/lib/game-audio";
import { painted, point, depth } from "./pixi-art";

export function createCharacterSprites(frames: Texture[][], layer: Container) {
  function character(royal = false, activity: "carry" | "hammer" = "carry") {
    const row = royal ? 0 : activity === "hammer" ? 2 : 1;
    const sprite: Sprite = painted(frames[row][1], royal ? 3.4 : 2.2, 0.97);
    layer.addChild(sprite);
    const p = { x: 0, y: 0, z: 0 };
    let stride = 0,
      lastFrame = 1,
      nextFrame = 0;
    const actor = {
      sprite,
      p,
      royal,
      activity,
      facing: 1,
      tick(
        time: number,
        dt: number,
        speed: number,
        lod: DetailLevel,
        target: MapPoint,
        span: number,
        aspect: number,
        reduced: boolean,
      ) {
        stride += speed * dt * 2.2;
        sprite.visible =
          (royal || lod !== "far") && inIsometricView(p, target, span, aspect);
        if (!sprite.visible) return;
        const pos = point(p.x, p.z, p.y);
        sprite.position.set(pos.x, pos.y);
        sprite.zIndex = depth(p) + 0.03;
        sprite.scale.x = Math.abs(sprite.scale.x) * actor.facing;
        if (time < nextFrame) return;
        nextFrame = time + (lod === "near" ? 1 / 12 : 1 / 6);
        const frame =
          reduced || lod === "far"
            ? 1
            : activity === "hammer" && !royal
              ? Math.floor(time * 5) % 4
              : speed > 0.08
                ? Math.floor(stride) % 4
                : 1;
        if (frame === lastFrame) return;
        lastFrame = frame;
        sprite.texture = frames[row][frame];
        if (!reduced && lod !== "far") {
          const screen = projectIsometric(p),
            focus = projectIsometric(target);
          const pan = (screen.x - focus.x) / ((span * aspect) / 2);
          const strength =
            (royal ? 0.5 : 0.2) *
            (1 -
              Math.min(
                1,
                Math.hypot(screen.x - focus.x, screen.y - focus.y) /
                  (span * 0.65),
              ) *
                0.7);
          if (activity === "hammer" && !royal && frame === 2)
            playSound("hammer", strength, pan);
          else if (speed > 0.08 && frame % 2 === 0)
            playSound("step", strength, pan);
        }
      },
      destroy() {
        sprite.destroy();
      },
    };
    return actor;
  }
  return { character };
}
