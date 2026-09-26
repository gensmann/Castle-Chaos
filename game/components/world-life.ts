import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import type { Scene } from "@babylonjs/core/scene";
import type { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";

/** Small articulated rigs; static body details are merged, only joints animate. */
export function createWorldLife(
  scene: Scene,
  shadows: ShadowGenerator,
  high: boolean,
) {
  const material = (name: string, color: string) => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(color);
    m.specularColor = Color3.Black();
    return m;
  };
  const skin = material("Warm skin", "#ddb289");
  const boots = material("Leather boots", "#383f35");
  const linen = material("Linen trousers", "#a69973");
  const brass = material("Crown brass", "#e4c66e");
  const hair = material("Chestnut hair", "#624634");
  const ivory = material("Eye ivory", "#ece3c9");
  const cloaks = new Map<string, StandardMaterial>();
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
  function character(
    name: string,
    color: string,
    royal = false,
    parent?: TransformNode,
    activity: "none" | "carry" | "hammer" = "none",
  ) {
    const root = new TransformNode(name, scene);
    root.parent = parent ?? null;
    const body = joint("Spine", root, 0, 0.9, 0);
    const head = joint("Neck", body, 0, 0.65, 0);
    if (!cloaks.has(color))
      cloaks.set(color, material(`Cloth ${color}`, color));
    const cloth = cloaks.get(color)!;
    part("Tunic", body, 0, 0.12, 0, 0.62, 0.82, 0.38, cloth, true);
    part("Belt", body, 0, -0.13, 0, 0.62, 0.09, 0.4, boots);
    part("Buckle", body, 0, -0.13, -0.22, 0.13, 0.13, 0.06, brass);
    part("Head", head, 0, 0, 0, 0.52, 0.6, 0.48, skin, true);
    part("Hair", head, 0, 0.18, 0.03, 0.55, 0.26, 0.47, hair, true);
    for (const side of [-1, 1]) {
      part(
        "Eye",
        head,
        side * 0.12,
        0.04,
        -0.23,
        0.12,
        0.13,
        0.07,
        ivory,
        true,
      );
      part(
        "Pupil",
        head,
        side * 0.12,
        0.04,
        -0.27,
        0.052,
        0.067,
        0.03,
        boots,
        true,
      );
    }
    part("Nose", head, 0, -0.06, -0.27, 0.15, 0.16, 0.16, skin, true);
    if (royal) {
      part("Moustache", head, 0, -0.17, -0.24, 0.34, 0.09, 0.1, hair, true);
      const crown = MeshBuilder.CreateCylinder(
        "Crown",
        { diameter: 0.59, height: 0.18, tessellation: 10 },
        scene,
      );
      crown.parent = head;
      crown.position.y = 0.3;
      crown.material = brass;
      crown.isPickable = false;
      for (let i = 0; i < 5; i++) {
        const a = (i * Math.PI * 2) / 5;
        part(
          "Crown point",
          head,
          Math.sin(a) * 0.25,
          0.46,
          Math.cos(a) * 0.25,
          0.085,
          0.23,
          0.085,
          brass,
        );
      }
    }
    const arms: TransformNode[] = [],
      elbows: TransformNode[] = [],
      hips: TransformNode[] = [],
      knees: TransformNode[] = [];
    for (const side of [-1, 1]) {
      const arm = joint("Shoulder", body, side * 0.4, 0.42, 0);
      part("Sleeve", arm, 0, -0.18, 0, 0.22, 0.42, 0.25, cloth, true);
      const elbow = joint("Elbow", arm, 0, -0.35, 0);
      part("Forearm", elbow, 0, -0.15, 0, 0.17, 0.3, 0.19, cloth, true);
      part("Hand", elbow, 0, -0.32, -0.01, 0.18, 0.2, 0.19, skin, true);
      arm.rotation.z = side * 0.13;
      const hip = joint("Hip", root, side * 0.18, 0.77, 0);
      part("Thigh", hip, 0, -0.16, 0, 0.24, 0.37, 0.26, linen, true);
      const knee = joint("Knee", hip, 0, -0.32, 0);
      part("Shin", knee, 0, -0.15, 0, 0.18, 0.34, 0.2, linen, true);
      part("Boot", knee, 0, -0.34, -0.075, 0.25, 0.23, 0.4, boots);
      arms.push(arm);
      elbows.push(elbow);
      hips.push(hip);
      knees.push(knee);
    }
    if (activity === "carry") {
      part("Supply crate", body, 0, -0.05, -0.54, 0.56, 0.42, 0.45, hair);
      part("Crate strap", body, 0, -0.05, -0.78, 0.07, 0.42, 0.025, brass);
    } else if (activity === "hammer") {
      part("Hammer haft", elbows[1], 0, -0.47, -0.1, 0.08, 0.4, 0.08, hair);
      part("Hammer head", elbows[1], 0, -0.67, -0.1, 0.35, 0.17, 0.19, boots);
    }
    // Merge each rigid part separately, retaining the articulated joint hierarchy.
    for (const node of [body, head, ...arms, ...elbows, ...hips, ...knees]) {
      const pieces = node.getChildMeshes(true) as Mesh[];
      if (pieces.length < 2) continue;
      root.computeWorldMatrix(true);
      pieces.forEach((p) => p.computeWorldMatrix(true));
      const merged = Mesh.MergeMeshes(
        pieces,
        true,
        true,
        undefined,
        false,
        true,
      )!;
      merged.setParent(node);
      merged.isPickable = false;
    }
    if (royal || high)
      root.getChildMeshes().forEach((m) => {
        shadows.addShadowCaster(m);
        m.onDisposeObservable.addOnce(() => shadows.removeShadowCaster(m));
      });
    let stride = 0;
    let walking = 0;
    return {
      root,
      tick(time: number, dt: number, speed: number, landing = 0) {
        // Stride follows distance travelled so feet don't cycle while stationary.
        stride += speed * dt * 4.4;
        walking += (Math.min(1, speed / 2.2) - walking) * Math.min(1, dt * 12);
        const gait = Math.sin(stride);
        body.position.y =
          0.9 + Math.abs(Math.cos(stride)) * 0.035 * walking - landing * 0.2;
        body.rotation.x = -walking * 0.06 + landing * 0.2;
        body.rotation.z = gait * 0.035 * walking;
        body.scaling.y = 1 + Math.sin(time * 2.2) * 0.008 * (1 - walking);
        head.rotation.y = Math.sin(time * 0.6) * 0.1 * (1 - walking);
        head.rotation.x = Math.sin(time * 1.5) * 0.025;
        hips.forEach((hip, i) => {
          const phase = stride + i * Math.PI;
          hip.rotation.x = Math.sin(phase) * 0.55 * walking - landing * 0.22;
          knees[i].rotation.x =
            -Math.max(0, Math.cos(phase)) * 0.8 * walking + landing * 0.55;
          arms[i].rotation.x = -Math.sin(phase) * 0.4 * walking - 0.04;
          elbows[i].rotation.x =
            -0.2 - Math.max(0, -Math.sin(phase)) * 0.22 * walking;
          if (activity === "carry") {
            arms[i].rotation.x = 0.85;
            elbows[i].rotation.x = 0.8;
          }
        });
        if (activity === "hammer") {
          const stroke = Math.max(0, Math.sin(time * 3.4));
          arms[1].rotation.x = 0.65 + stroke * 1.6;
          elbows[1].rotation.x = 0.4 + stroke * 0.4;
          body.rotation.x = -stroke * 0.08;
        }
      },
    };
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
    for (let i = 0; i < (high ? 2 : 1); i++) {
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
    update(time: number, dt: number, reduced: boolean) {
      for (let i = emitters.length - 1; i >= 0; i--) {
        const e = emitters[i];
        if (e.parent.isDisposed()) {
          emitters.splice(i, 1);
          continue;
        }
        e.puffs.forEach((puff, j) => {
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
        bird.root.setEnabled(!reduced);
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
