import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import { createCharacterSprites } from "./character-sprites";
import { inIsometricView, type DetailLevel } from "@/lib/isometric-view";
import type { MapPoint } from "@/lib/isometric-view";

/** Painted characters plus lightweight ambient effects, culled and throttled by LOD. */
export function createWorldLife(scene: Scene, high: boolean) {
  const material = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = Color3.Black();
    return m;
  };
  const boots = material("Swallow feathers", "#383f35");
  const characters = createCharacterSprites(scene);
  const character = characters.character;
  let level: DetailLevel = "near";
  let center: MapPoint = { x: 0, y: 0, z: 0 };
  let span = 30,
    aspect = 1,
    ambientTime = 0;
  const smokeMat = material("Hearth smoke", "#bdc2b1");
  smokeMat.alpha = 0.13;
  smokeMat.disableLighting = true;
  smokeMat.emissiveColor = smokeMat.diffuseColor;
  const smokeSource = MeshBuilder.CreateIcoSphere(
    "Smoke pool",
    { radius: 0.32, subdivisions: 1 },
    scene,
  );
  smokeSource.material = smokeMat;
  smokeSource.isVisible = false;
  smokeSource.isPickable = false;
  const emitters: {
    parent: TransformNode;
    puffs: ReturnType<Mesh["createInstance"]>[];
    offset: number;
    x: number;
    y: number;
    z: number;
  }[] = [];
  const walkers: {
    rig: ReturnType<typeof character>;
    offset: number;
    working: boolean;
  }[] = [];
  const birds: {
    root: TransformNode;
    wings: TransformNode[];
    phase: number;
  }[] = [];
  function part(
    name: string,
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: StandardMaterial,
    round = false,
  ) {
    const mesh = round
      ? MeshBuilder.CreateSphere(name, { diameter: 1, segments: 8 }, scene)
      : MeshBuilder.CreateBox(name, { size: 1 }, scene);
    mesh.scaling.set(w, h, d);
    mesh.position.set(x, y, z);
    mesh.parent = parent;
    mesh.material = mat;
    mesh.isPickable = false;
    return mesh;
  }
  function joint(
    name: string,
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
  ) {
    const node = new TransformNode(name, scene);
    node.parent = parent;
    node.position.set(x, y, z);
    return node;
  }
  function smoke(parent: TransformNode, x: number, y: number, z: number) {
    const puffs = Array.from({ length: high ? 5 : 3 }, (_, i) => {
      const puff = smokeSource.createInstance(`Hearth puff ${i}`);
      puff.parent = parent;
      puff.isPickable = false;
      return puff;
    });
    emitters.push({ parent, puffs, x, y, z, offset: emitters.length * 0.37 });
  }
  function village(parent: TransformNode, color: string, workshop: boolean) {
    for (let i = 0; i < (high || workshop ? 2 : 1); i++) {
      const rig = character(
        "Courtyard villager",
        i ? "#77928a" : color,
        false,
        parent,
        i === 1 && workshop ? "hammer" : "carry",
      );
      rig.root.scaling.setAll(0.8);
      walkers.push({
        rig,
        offset: i * Math.PI + walkers.length * 0.9,
        working: i === 1 && workshop,
      });
    }
  }
  for (let i = 0; i < (high ? 6 : 3); i++) {
    const root = new TransformNode("Brambleland swallow", scene);
    part("Bird body", root, 0, 0, 0, 0.13, 0.12, 0.36, boots, true);
    const wings = [-1, 1].map((side) => {
      const wing = joint("Wing", root, side * 0.06, 0, 0);
      const m = part(
        "Feathers",
        wing,
        side * 0.25,
        0,
        0.03,
        0.52,
        0.045,
        0.25,
        boots,
      );
      m.rotation.y = side * 0.35;
      return wing;
    });
    birds.push({ root, wings, phase: i * 1.7 });
  }
  return {
    character,
    smoke,
    village,
    setView(
      detail: DetailLevel,
      target: MapPoint,
      viewSpan: number,
      viewAspect: number,
    ) {
      level = detail;
      center = target;
      span = viewSpan;
      aspect = viewAspect;
      characters.setView(detail, target, viewSpan, viewAspect);
    },
    update(time: number, dt: number, reduced: boolean) {
      ambientTime += dt;
      const refreshAmbient = ambientTime >= (level === "near" ? 1 / 20 : 1 / 8);
      if (refreshAmbient) ambientTime = 0;
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i];
        if (e.parent.isDisposed()) {
          emitters.splice(i, 1);
          continue;
        }
        const visible =
          level !== "far" &&
          inIsometricView(
            e.parent.getAbsolutePosition(),
            center,
            span,
            aspect,
            8,
          );
        e.puffs.forEach((puff, j) => {
          puff.setEnabled(visible && (level === "near" || j === 0));
          if (!visible || !refreshAmbient) return;
          const age =
            ((reduced ? 0 : time * 0.16) + j / e.puffs.length + e.offset) % 1;
          puff.position.set(
            e.x + age * 1.2 + Math.sin(age * 8 + e.offset) * 0.15,
            e.y + age * 3.1,
            e.z + age * 0.5,
          );
          puff.scaling.setAll(Math.sin(age * Math.PI) * 1.65);
        });
      }
      for (let i = walkers.length - 1; i >= 0; i--) {
        const w = walkers[i];
        if (w.rig.root.isDisposed()) {
          walkers.splice(i, 1);
          continue;
        }
        if (w.working) {
          w.rig.root.position.set(7.2, 0.03, -1.35);
          w.rig.root.rotation.y = Math.PI;
          w.rig.tick(time + w.offset, reduced ? 0 : dt, 0);
          continue;
        }
        const phase = time * 0.32 + w.offset;
        w.rig.root.position.set(
          Math.sin(phase) * 1.8,
          0.03,
          -3.5 + Math.cos(phase) * 0.55,
        );
        const dx = Math.cos(phase) * 1.8 * 0.32,
          dz = -Math.sin(phase) * 0.55 * 0.32;
        w.rig.root.rotation.y = Math.atan2(-dx, -dz);
        w.rig.tick(
          time,
          reduced ? 0 : dt,
          reduced ? 0 : Math.hypot(dx, dz) / 0.8,
        );
      }
      birds.forEach((bird) => {
        bird.root.setEnabled(!reduced && level === "near");
        if (reduced || level !== "near" || !refreshAmbient) return;
        const phase = time * 0.085 + bird.phase;
        bird.root.position.set(
          Math.cos(phase) * 30,
          10 + Math.sin(phase * 2) * 1.5,
          Math.sin(phase) * 24,
        );
        bird.root.rotation.y = Math.atan2(
          Math.sin(phase) * 30,
          -Math.cos(phase) * 24,
        );
        bird.root.rotation.z = -0.15;
        bird.wings.forEach((wing, i) => {
          wing.rotation.z =
            Math.sin(time * 7 + bird.phase) * 0.38 * (i ? 1 : -1);
        });
      });
    },
  };
}
