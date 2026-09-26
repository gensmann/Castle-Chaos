import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { playSound } from "@/lib/game-audio";
import { projectIsometric } from "@/lib/isometric-view";
import { inIsometricView, type DetailLevel } from "@/lib/isometric-view";
import type { MapPoint } from "@/lib/isometric-view";

export function createCharacterSprites(scene: Scene) {
  const texture = new Texture(
    "/art/isometric-characters.webp",
    scene,
    false,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  const material = new StandardMaterial("Painted characters", scene);
  material.diffuseTexture = material.emissiveTexture = texture;
  material.emissiveColor = Color3.White();
  material.disableLighting = true;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = 0.35;
  material.backFaceCulling = false;
  let level: DetailLevel = "near";
  let target: MapPoint = { x: 0, y: 0, z: 0 };
  let span = 30,
    aspect = 1;
  return {
    setView(
      detail: DetailLevel,
      center: MapPoint,
      viewSpan: number,
      viewAspect: number,
    ) {
      level = detail;
      target = center;
      span = viewSpan;
      aspect = viewAspect;
    },
    character(
      name: string,
      _color: string,
      royal = false,
      parent?: TransformNode,
      activity: "none" | "carry" | "hammer" = "none",
    ) {
      const root = new TransformNode(name, scene);
      root.parent = parent ?? null;
      const mesh = new Mesh(`${name} sprite`, scene);
      mesh.parent = root;
      mesh.material = material;
      mesh.isPickable = false;
      const data = new VertexData();
      data.positions = [-0.5, -0.03, 0.5, -0.03, 0.5, 0.97, -0.5, 0.97].reduce<
        number[]
      >((out, _, i, xy) => {
        if (i % 2) return out;
        const x = xy[i] * 2.7,
          y = xy[i + 1] * 2.7;
        out.push(
          x * Math.SQRT1_2 - y / Math.sqrt(6),
          y * Math.sqrt(2 / 3),
          x * Math.SQRT1_2 + y / Math.sqrt(6),
        );
        return out;
      }, []);
      data.indices = [0, 1, 2, 0, 2, 3];
      data.uvs = [0, 0, 1, 0, 1, 1, 0, 1];
      data.applyToMesh(mesh, true);
      const row = royal ? 0 : activity === "hammer" ? 2 : 1;
      let stride = 0,
        lastFrame = -1,
        lastFacing = false,
        nextFrame = 0;
      const uv = new Float32Array(8);
      return {
        root,
        tick(time: number, dt: number, speed: number, landing = 0) {
          // Simulation continues independently of visibility/animation frequency.
          stride += speed * dt * 2.2;
          root.computeWorldMatrix(true);
          const visible =
            (royal || level !== "far") &&
            inIsometricView(root.getAbsolutePosition(), target, span, aspect);
          mesh.setEnabled(visible);
          if (!visible) return;
          // The parent yaw still describes travel. Cancel it on the painted plane.
          mesh.rotation.y = -root.rotation.y;
          mesh.scaling.y = 1 - landing * 0.12;
          const facingLeft =
            -Math.sin(root.rotation.y) - Math.cos(root.rotation.y) < 0;
          if (time < nextFrame && facingLeft === lastFacing && lastFrame >= 0)
            return;
          nextFrame =
            time +
            (level === "near" ? 1 / 12 : level === "middle" ? 1 / 6 : 1 / 2);
          const frame =
            dt === 0 || level === "far"
              ? 1
              : activity === "hammer"
                ? Math.floor(time * 5) % 4
                : speed > 0.08
                  ? Math.floor(stride) % 4
                  : 1;
          if (frame === lastFrame && facingLeft === lastFacing) return;
          if (
            frame !== lastFrame &&
            lastFrame >= 0 &&
            dt > 0 &&
            level !== "far"
          ) {
            const position = projectIsometric(root.getAbsolutePosition());
            const focus = projectIsometric(target);
            const pan = (position.x - focus.x) / ((span * aspect) / 2);
            const distance = Math.min(
              1,
              Math.hypot(position.x - focus.x, position.y - focus.y) /
                (span * 0.65),
            );
            const strength = (royal ? 0.5 : 0.2) * (1 - distance * 0.7);
            if (activity === "hammer" && frame === 2)
              playSound("hammer", strength, pan);
            else if (speed > 0.08 && frame % 2 === 0)
              playSound("step", strength, pan);
          }
          lastFrame = frame;
          lastFacing = facingLeft;
          const left = (frame + 0.003) / 4,
            right = (frame + 0.997) / 4;
          const bottom = (2 - row + 0.003) / 3,
            top = (3 - row - 0.003) / 3;
          const u0 = facingLeft ? right : left,
            u1 = facingLeft ? left : right;
          uv.set([u0, bottom, u1, bottom, u1, top, u0, top]);
          mesh.updateVerticesData(VertexBuffer.UVKind, uv);
        },
      };
    },
  };
}
