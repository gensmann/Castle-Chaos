import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Material } from "@babylonjs/core/Materials/material";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { TransformNode } from "@babylonjs/core/Meshes/transformNode";

export type VillageSprite =
  | "oak"
  | "spruce"
  | "birch"
  | "rocks"
  | "cottage"
  | "workshop"
  | "tavern"
  | "keep";
const cells: VillageSprite[] = [
  "oak",
  "spruce",
  "birch",
  "rocks",
  "cottage",
  "workshop",
  "tavern",
  "keep",
];

/** Painted 2.5D art: one alpha-tested atlas, two triangles per prop, stable depth. */
export function createVillageSprites(scene: Scene) {
  const texture = new Texture(
    "/art/isometric-village-atlas.webp",
    scene,
    false,
    true,
    Texture.TRILINEAR_SAMPLINGMODE,
  );
  texture.hasAlpha = true;
  texture.wrapU = texture.wrapV = Texture.CLAMP_ADDRESSMODE;
  texture.anisotropicFilteringLevel = 2;
  const material = new StandardMaterial("Painted village atlas", scene);
  material.diffuseTexture = texture;
  material.emissiveTexture = texture;
  material.emissiveColor = Color3.White();
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.useAlphaFromDiffuseTexture = true;
  material.transparencyMode = Material.MATERIAL_ALPHATEST;
  material.alphaCutOff = 0.35;
  material.backFaceCulling = false;
  const templates = new Map<VillageSprite, Mesh>();
  function template(kind: VillageSprite) {
    if (templates.has(kind)) return templates.get(kind)!;
    const index = cells.indexOf(kind);
    const col = index % 4,
      row = Math.floor(index / 4);
    // Insets avoid atlas bleeding. The keep's highest pennant needs a little more headroom.
    const u0 = col / 4 + 0.001,
      u1 = (col + 1) / 4 - 0.001;
    const v0 = (1 - row) / 2 + 0.001;
    const v1 = (2 - row) / 2 - (kind === "keep" ? -0.023 : 0.001);
    const data = new VertexData();
    const positions: number[] = [];
    // Camera-right and camera-up are fixed for the orthographic isometric view.
    for (const [x, y] of [
      [-0.5, -0.06],
      [0.5, -0.06],
      [0.5, 0.94],
      [-0.5, 0.94],
    ]) {
      positions.push(
        x * Math.SQRT1_2 - y / Math.sqrt(6),
        y * Math.sqrt(2 / 3),
        x * Math.SQRT1_2 + y / Math.sqrt(6),
      );
    }
    data.positions = positions;
    data.indices = [0, 1, 2, 0, 2, 3];
    data.uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    data.normals = Array.from({ length: 4 }, () => [
      1 / Math.sqrt(3),
      1 / Math.sqrt(3),
      -1 / Math.sqrt(3),
    ]).flat();
    const mesh = new Mesh(`Sprite ${kind}`, scene);
    data.applyToMesh(mesh);
    mesh.material = material;
    mesh.isVisible = false;
    mesh.isPickable = false;
    templates.set(kind, mesh);
    return mesh;
  }
  return {
    material,
    template,
    place(
      kind: VillageSprite,
      parent: TransformNode,
      x: number,
      y: number,
      z: number,
      size: number,
    ) {
      const sprite = template(kind).createInstance(`Painted ${kind}`);
      sprite.parent = parent;
      sprite.position.set(x, y, z);
      sprite.scaling.setAll(size);
      sprite.isPickable = true;
      sprite.metadata = { sprite: kind };
      return sprite;
    },
  };
}
