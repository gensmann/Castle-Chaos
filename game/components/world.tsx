"use client";
import { useEffect, useRef, useState } from "react";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import type { Game, Battle, Player, Building, Weapon } from "@/lib/game";
import { HOME_POSITIONS, CLEARINGS, positionOf } from "@/lib/game";
import { createTapTracker } from "@/lib/pointer-tap";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Culling/ray";
import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Vector3, Matrix } from "@babylonjs/core/Maths/math.vector";
import { Color3, Color4 } from "@babylonjs/core/Maths/math.color";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { DirectionalLight } from "@babylonjs/core/Lights/directionalLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { ShadowGenerator } from "@babylonjs/core/Lights/Shadows/shadowGenerator";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import "@babylonjs/core/Meshes/instancedMesh";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { GlowLayer } from "@babylonjs/core/Layers/glowLayer";
import { HavokPlugin } from "@babylonjs/core/Physics/v2/Plugins/havokPlugin";
import { PhysicsAggregate } from "@babylonjs/core/Physics/v2/physicsAggregate";
import { PhysicsShapeType } from "@babylonjs/core/Physics/v2/IPhysicsEnginePlugin";
import "@babylonjs/core/Physics/physicsEngineComponent";
import "@babylonjs/core/Physics/v2/physicsEngineComponent";
import "@babylonjs/core/Meshes/thinInstanceMesh";

export type WorldCommand = {
  kind: "home" | "realm" | "zoom-in" | "zoom-out" | "focus";
  id?: string;
  nonce: number;
};
type Props = {
  game: Game;
  me: string;
  selection: number;
  onSelectPlot: (n: number) => void;
  onSelectPlayer: (id: string) => void;
  battle: Battle | null;
  onBattleEnd: () => void;
  command: WorldCommand | null;
  quality: "high" | "low";
};
type Runtime = {
  update: (g: Game, me: string, plot: number) => void;
  command: (c: WorldCommand) => void;
  attack: (b: Battle | null) => void;
  dispose: () => void;
};
const rgb = (s: string) => Color3.FromHexString(s);

function createWorld(
  canvas: HTMLCanvasElement,
  propsRef: React.RefObject<Props>,
  ready: () => void,
): Runtime {
  const engine = new Engine(
    canvas,
    true,
    {
      preserveDrawingBuffer: false,
      stencil: true,
      powerPreference: "high-performance",
      antialias: true,
    },
    false,
  );
  engine.setHardwareScalingLevel(
    Math.max(
      1,
      window.devicePixelRatio / (window.innerWidth < 700 ? 1.25 : 1.6),
    ),
  );
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.19, 0.28, 0.28, 0);
  scene.ambientColor = rgb("#253427");
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = 1;
  scene.imageProcessingConfiguration.exposure = 1.15;
  scene.imageProcessingConfiguration.contrast = 1.12;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = rgb("#668480");
  scene.fogDensity = 0.009;
  const camera = new ArcRotateCamera(
    "Royal survey",
    -Math.PI / 2.8,
    1.03,
    38,
    new Vector3(-17, 2, -12),
    scene,
  );
  camera.attachControl(canvas, false);
  camera.useNaturalPinchZoom = true;
  camera.lowerRadiusLimit = 17;
  camera.upperRadiusLimit = 105;
  camera.lowerBetaLimit = 0.35;
  camera.upperBetaLimit = 1.38;
  camera.wheelPrecision = 18;
  camera.panningSensibility = 65;
  camera.inertia = 0.75;
  camera.minZ = 0.2;
  camera.maxZ = 300;
  camera.inputs.attached.keyboard?.detachControl();
  const hemi = new HemisphericLight("Sky", new Vector3(0.3, 1, 0.4), scene);
  hemi.intensity = 0.72;
  hemi.diffuse = rgb("#ccd9c2");
  hemi.groundColor = rgb("#384c40");
  const sun = new DirectionalLight(
    "Late afternoon",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  sun.position = new Vector3(30, 65, -30);
  sun.intensity = 1.4;
  sun.diffuse = rgb("#fff0cd");
  const shadows = new ShadowGenerator(
    propsRef.current.quality === "low" ? 1024 : 2048,
    sun,
  );
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_MEDIUM;
  shadows.bias = 0.001;
  shadows.normalBias = 0.035;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 150;
  const glow = new GlowLayer("Torchglow", scene, { blurKernelSize: 32 });
  glow.intensity = 0.36;
  let serial = 0;
  let randomSeed = 428;
  const rnd = () => {
    randomSeed = (randomSeed * 16807) % 2147483647;
    return (randomSeed - 1) / 2147483646;
  };
  const mats = new Map<string, StandardMaterial>();
  function mat(name: string, color: string, emissive = false) {
    if (mats.has(name)) return mats.get(name)!;
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = rgb(color);
    m.specularColor = rgb("#20251b");
    if (emissive) {
      m.emissiveColor = rgb(color);
      m.disableLighting = true;
    }
    mats.set(name, m);
    return m;
  }
  const grass = mat("Grass", "#73925a"),
    rock = mat("Cliff", "#626f69"),
    wood = mat("Timber", "#665037"),
    woodLight = mat("Cut wood", "#a18050"),
    dark = mat("Dark iron", "#313b37"),
    stone = mat("Limestone", "#b3b6a0"),
    roof = mat("Copper roof", "#438f89"),
    clay = mat("Clay roof", "#b36d4b"),
    gold = mat("Aged brass", "#d4b45f"),
    windowMat = mat("Lamplight", "#ffc36b", true),
    bark = mat("Old oak bark", "#d1c5a7"),
    leaf = [
      mat("Leaf pine", "#9bbcaf"),
      mat("Leaf fern", "#b8cfaa"),
      mat("Leaf bright", "#d0d9a9"),
      mat("Leaf gold", "#e2cc8d"),
    ];
  const barkTexture = new Texture("/art/tree-bark.webp", scene);
  barkTexture.uScale = 1.5;
  barkTexture.vScale = 2;
  bark.diffuseTexture = barkTexture;
  bark.specularColor = Color3.Black();
  const timberTexture = barkTexture.clone();
  if (timberTexture) {
    timberTexture.uScale = 1;
    timberTexture.vScale = 2;
    wood.diffuseTexture = timberTexture;
    woodLight.diffuseTexture = timberTexture;
    wood.diffuseColor = rgb("#aa8e6e");
    woodLight.diffuseColor = rgb("#e5c398");
  }
  const leafTexture = new Texture("/art/tree-leaves.webp", scene);
  leafTexture.uScale = 2;
  leafTexture.vScale = 1.5;
  leaf.forEach((material) => {
    material.diffuseTexture = leafTexture;
    material.specularColor = Color3.Black();
  });
  const stoneTexture = new Texture("/art/castle-stone.webp", scene);
  stoneTexture.uScale = 2;
  stoneTexture.vScale = 2;
  stone.diffuseTexture = stoneTexture;
  const fieldstoneTexture = new Texture("/art/fieldstone.webp", scene);
  fieldstoneTexture.uScale = 1.5;
  fieldstoneTexture.vScale = 1;
  rock.diffuseTexture = fieldstoneTexture;
  rock.diffuseColor = rgb("#bcc6a7");
  rock.specularColor = Color3.Black();
  const roofTexture = new Texture("/art/roof-copper.webp", scene);
  roofTexture.uScale = 1;
  roofTexture.vScale = 1;
  roof.diffuseTexture = roofTexture;
  roof.diffuseColor = rgb("#c5e3db");
  function meshSetup(
    m: Mesh,
    material: StandardMaterial,
    parent?: TransformNode,
    shadow = true,
  ) {
    m.material = material;
    m.receiveShadows = true;
    m.parent = parent ?? null;
    if (shadow) shadows.addShadowCaster(m);
    return m;
  }
  function box(
    name: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: StandardMaterial,
    parent?: TransformNode,
    shadow = true,
  ) {
    const a = MeshBuilder.CreateBox(
      `${name}-${serial++}`,
      { width: w, height: h, depth: d },
      scene,
    );
    a.position.set(x, y, z);
    return meshSetup(a, m, parent, shadow);
  }
  function cyl(
    name: string,
    x: number,
    y: number,
    z: number,
    diameter: number,
    height: number,
    m: StandardMaterial,
    parent?: TransformNode,
    top?: number,
    segments = 10,
  ) {
    const a = MeshBuilder.CreateCylinder(
      `${name}-${serial++}`,
      {
        height,
        diameterBottom: diameter,
        diameterTop: top ?? diameter,
        tessellation: segments,
      },
      scene,
    );
    a.position.set(x, y, z);
    return meshSetup(a, m, parent);
  }
  function sphere(
    name: string,
    x: number,
    y: number,
    z: number,
    size: number,
    m: StandardMaterial,
    parent?: TransformNode,
  ) {
    const a = MeshBuilder.CreateIcoSphere(
      `${name}-${serial++}`,
      { radius: size, subdivisions: 2, flat: false },
      scene,
    );
    a.position.set(x, y, z);
    return meshSetup(a, m, parent);
  }
  function beam(
    a: Vector3,
    b: Vector3,
    thickness: number,
    m: StandardMaterial,
    parent: TransformNode,
  ) {
    const c = cyl(
      "beam",
      0,
      0,
      0,
      thickness,
      Vector3.Distance(a, b),
      m,
      parent,
      undefined,
      6,
    );
    c.position = Vector3.Center(a, b);
    c.setDirection(b.subtract(a));
    c.rotate(new Vector3(1, 0, 0), Math.PI / 2);
    return c;
  }
  function landHeight(x: number, z: number) {
    const r = Math.sqrt((x / 63) ** 2 + (z / 57) ** 2);
    const edge = Math.max(0, r - 0.72);
    let y =
      0.6 + Math.sin(x * 0.12) * Math.cos(z * 0.16) * 1.3 - edge * edge * 38;
    for (const pos of HOME_POSITIONS) {
      const d = Math.hypot(x - pos[0], z - pos[1]);
      if (d < 14)
        y = y * (Math.max(0, d - 9) / 5) + 0.65 * (1 - Math.max(0, d - 9) / 5);
    }
    return y;
  }
  const terrain = MeshBuilder.CreateGround(
    "The Unreasonable Isles",
    { width: 150, height: 140, subdivisions: 75, updatable: true },
    scene,
  );
  const vertices = terrain.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i],
      z = vertices[i + 2];
    vertices[i + 1] = landHeight(x, z);
    const color = rgb(
      vertices[i + 1] < -0.7
        ? "#b2a079"
        : vertices[i + 1] < 0.2
          ? "#839376"
          : Math.sin(x * 0.32) * Math.cos(z * 0.4) > 0.1
            ? "#d2deb2"
            : "#b8c99f",
    );
    colors.push(color.r, color.g, color.b, 1);
  }
  terrain.updateVerticesData(VertexBuffer.PositionKind, vertices);
  const normals: number[] = [];
  VertexData.ComputeNormals(vertices, terrain.getIndices()!, normals);
  terrain.updateVerticesData(VertexBuffer.NormalKind, normals);
  terrain.setVerticesData(VertexBuffer.ColorKind, colors);
  const meadowTexture = new Texture("/art/ground-meadow.webp", scene);
  meadowTexture.uScale = 26;
  meadowTexture.vScale = 24;
  const terrainMat = mat("Living terrain", "#ffffff");
  terrainMat.diffuseTexture = meadowTexture;
  terrain.material = terrainMat;
  terrain.receiveShadows = true;
  terrain.metadata = { ground: true };
  const waterMaterial = mat("Still waters", "#547f7c");
  waterMaterial.alpha = 0.91;
  waterMaterial.specularColor = rgb("#abccc0");
  waterMaterial.specularPower = 60;
  const water = MeshBuilder.CreateGround(
    "The Inconvenient Sea",
    { width: 500, height: 500 },
    scene,
  );
  water.position.y = -1.65;
  water.material = waterMaterial;
  water.isPickable = false;
  // A narrow stream loops around the meadows. Its banks are real scene geometry.
  const riverPoints: Vector3[] = [];
  for (let i = 0; i < 45; i++) {
    const z = -62 + i * 2.8;
    const x = 3 + Math.sin(z * 0.075) * 8;
    riverPoints.push(new Vector3(x, 0.72, z));
  }
  const riverMat = mat("River", "#619994");
  const stream = MeshBuilder.CreateTube(
    "Silverbrook",
    { path: riverPoints, radius: 1.1, tessellation: 8 },
    scene,
  );
  stream.material = riverMat;
  stream.scaling.y = 0.09;
  stream.position.y = 0.68;
  stream.isPickable = false;
  let physicsReady = false;
  const physicsBodies: PhysicsAggregate[] = [];
  HavokPhysics({ locateFile: () => havokWasmUrl })
    .then((havok) => {
      if (scene.isDisposed) return;
      scene.enablePhysics(
        new Vector3(0, -9.81, 0),
        new HavokPlugin(true, havok),
      );
      scene.getPhysicsEngine()?.setTimeStep(1 / 60);
      scene.getPhysicsEngine()?.setSubTimeStep(1000 / 120);
      physicsBodies.push(
        new PhysicsAggregate(
          terrain,
          PhysicsShapeType.MESH,
          { mass: 0, friction: 0.85, restitution: 0.06 },
          scene,
        ),
      );
      physicsReady = true;
      canvas.dataset.physics = "havok";
    })
    .catch((e) => {
      console.error("Havok initialization failed", e);
      canvas.dataset.physics = "unavailable";
    });
  const staticColliders: {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    age: number;
  }[] = [];
  const physicalRubble: {
    mesh: Mesh;
    aggregate: PhysicsAggregate;
    age: number;
  }[] = [];
  const brickTemplates = new Map<string, Mesh>();
  function masonry(
    parent: TransformNode,
    x: number,
    z: number,
    width: number,
    height: number,
    depth: number,
  ) {
    const rows = Math.ceil(height / 0.48),
      cols = Math.ceil(width / 0.78),
      bw = width / cols,
      bh = height / rows;
    const key = [bw.toFixed(3), bh.toFixed(3), depth.toFixed(3)].join("-");
    let template = brickTemplates.get(key);
    if (!template) {
      template = MeshBuilder.CreateBox(
        "masonry-template",
        { width: bw - 0.025, height: bh - 0.022, depth },
        scene,
      );
      template.material = stone;
      template.isVisible = false;
      template.isPickable = false;
      brickTemplates.set(key, template);
    }
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const m = template.createInstance("Masonry brick");
        m.parent = parent;
        m.position.set(x - width / 2 + bw * (col + 0.5), bh * (row + 0.5), z);
        m.receiveShadows = true;
        m.metadata = {
          destructible: true,
          dimensions: [bw - 0.025, bh - 0.022, depth],
        };
        shadows.addShadowCaster(m);
      }
  }
  function shatter(targetId: string, point: Vector3, magic: boolean) {
    const root = castleRoots.get(targetId);
    const candidates = (root?.getChildMeshes() ?? [])
      .filter(
        (m) =>
          m.isEnabled() &&
          !m.isDisposed() &&
          (m.metadata?.destructible ||
            /Shelter|Vertical frame|Roof|Merlon|Tower tooth|Cross frame/.test(
              m.name,
            )),
      )
      .sort(
        (a, b) =>
          Vector3.DistanceSquared(a.getAbsolutePosition(), point) -
          Vector3.DistanceSquared(b.getAbsolutePosition(), point),
      );
    const cap = propsRef.current.quality === "low" ? 28 : 54;
    const pieces = candidates.slice(0, cap);
    // Chunks are detached from the actual rendered structure; each becomes a rigid body.
    for (let n = 0; n < Math.max(pieces.length, 18); n++) {
      const original = pieces[n];
      const pos = original
        ? original.getAbsolutePosition().clone()
        : point.add(
            new Vector3(
              (Math.random() - 0.5) * 2,
              Math.random() * 1.7,
              (Math.random() - 0.5) * 1.2,
            ),
          );
      const dims = original?.metadata?.dimensions as number[] | undefined;
      const ext = original
        ? original.getBoundingInfo().boundingBox.extendSizeWorld.scale(2)
        : new Vector3(
            0.38 + Math.random() * 0.3,
            0.22 + Math.random() * 0.2,
            0.3 + Math.random() * 0.2,
          );
      const chunk = MeshBuilder.CreateBox(
        "Physics rubble",
        {
          width: dims?.[0] ?? Math.min(ext.x, 1.5),
          height: dims?.[1] ?? Math.min(ext.y, 0.6),
          depth: dims?.[2] ?? Math.min(ext.z, 1.2),
        },
        scene,
      );
      chunk.position = pos;
      chunk.material = original?.material ?? stone;
      chunk.isPickable = false;
      chunk.receiveShadows = true;
      shadows.addShadowCaster(chunk);
      original?.setEnabled(false);
      const outward = pos.subtract(point);
      if (outward.length() < 0.1)
        outward.set(Math.random() - 0.5, 0.2, Math.random() - 0.5);
      outward.normalize();
      // Estimate density from the real chunk volume. Havok applies an off-centre
      // impact impulse, so mass and the contact point determine its motion/spin.
      const size = chunk.getBoundingInfo().boundingBox.extendSize.scale(2);
      const density = original?.metadata?.destructible ? 1800 : 650;
      const mass = Math.max(1, size.x * size.y * size.z * density);
      if (physicsReady) {
        const aggregate = new PhysicsAggregate(
          chunk,
          PhysicsShapeType.BOX,
          { mass, friction: 0.78, restitution: 0.12 },
          scene,
        );
        aggregate.body.setLinearDamping(0.1);
        aggregate.body.setAngularDamping(0.32);
        const distance = Vector3.Distance(pos, point);
        const pressure = (magic ? 9000 : 7000) / (1 + distance * 0.7);
        const area = Math.max(
          size.x * size.y,
          size.y * size.z,
          size.x * size.z,
        );
        const impulse = Math.min(mass * 11, pressure * area);
        aggregate.body.applyImpulse(
          new Vector3(
            outward.x,
            Math.max(0.28, outward.y * 0.6 + 0.35),
            outward.z,
          )
            .normalize()
            .scale(impulse),
          pos.add(new Vector3(size.x * 0.12, -size.y * 0.13, size.z * 0.08)),
        );
        physicalRubble.push({ mesh: chunk, aggregate, age: 0 });
      } else
        debris.push({
          m: chunk,
          v: new Vector3(outward.x * 6, 3 + Math.random() * 5, outward.z * 6),
          life: 4,
        });
    }
    // Surviving nearby masonry remains a collision surface during the burst.
    if (physicsReady && root) {
      const remaining = root
        .getChildMeshes()
        .filter(
          (m) =>
            m.isEnabled() &&
            !m.isDisposed() &&
            m.material !== windowMat &&
            Vector3.DistanceSquared(m.getAbsolutePosition(), point) < 40,
        )
        .slice(0, 36);
      for (const m of remaining) {
        const extent = m.getBoundingInfo().boundingBox.extendSizeWorld.scale(2);
        if (extent.y < 0.05 || extent.x < 0.05 || extent.z < 0.05) continue;
        const collider = MeshBuilder.CreateBox(
          "Remaining structure collider",
          { width: extent.x, height: extent.y, depth: extent.z },
          scene,
        );
        collider.position = m.getAbsolutePosition().clone();
        collider.isVisible = false;
        collider.isPickable = false;
        const aggregate = new PhysicsAggregate(
          collider,
          PhysicsShapeType.BOX,
          { mass: 0, friction: 0.8, restitution: 0.08 },
          scene,
        );
        staticColliders.push({ mesh: collider, aggregate, age: 0 });
      }
    }
    while (physicalRubble.length > 150) {
      const old = physicalRubble.shift()!;
      old.aggregate?.dispose();
      old.mesh.dispose();
    }
    for (let n = 0; n < 24; n++) {
      const puff = sphere(
        "Impact dust",
        point.x,
        point.y,
        point.z,
        0.07 + Math.random() * 0.1,
        magic
          ? mat("Magic dust", "#b79cff", true)
          : n % 3 === 0
            ? windowMat
            : rock,
      );
      puff.isPickable = false;
      debris.push({
        m: puff,
        v: new Vector3(
          (Math.random() - 0.5) * 8,
          Math.random() * 4 + 1,
          (Math.random() - 0.5) * 8,
        ),
        life: 0.7 + Math.random(),
      });
    }
    canvas.dataset.rubble = String(physicalRubble.length);
  }
  const staticMeshes: Mesh[] = [];
  // Batched vegetation: thousands of leaves, a handful of draw calls.
  const treeTemplates: Mesh[] = [];
  for (let k = 0; k < 4; k++) {
    const parts: Mesh[] = [];
    const trunk = cyl(
      "tree-trunk",
      0,
      1.2,
      0,
      0.38,
      2.4,
      bark,
      undefined,
      0.19,
      8,
    );
    parts.push(trunk);
    // Root flares and forked limbs give the silhouettes the same irregularity
    // as the bark. All parts are merged once before instancing the forest.
    for (let n = 0; n < 3; n++) {
      const angle = (n / 3) * Math.PI * 2;
      const root = cyl(
        "Root flare",
        Math.sin(angle) * 0.19,
        0.3,
        Math.cos(angle) * 0.19,
        0.24,
        0.85,
        bark,
        undefined,
        0.1,
        6,
      );
      root.rotation.z = Math.cos(angle) * 0.6;
      root.rotation.x = Math.sin(angle) * 0.6;
      parts.push(root);
    }
    if (k < 3) {
      for (let l = 0; l < 4; l++) {
        const crown = cyl(
          "pine",
          Math.sin(l * 2.7) * 0.09,
          1.45 + l * 0.68,
          Math.cos(l * 3.1) * 0.07,
          2.2 - l * 0.4,
          1.55,
          leaf[k],
          undefined,
          0.02,
          16,
        );
        const positions = crown.getVerticesData(VertexBuffer.PositionKind)!;
        for (let v = 0; v < positions.length; v += 3) {
          const angle = Math.atan2(positions[v + 2], positions[v]);
          const scale =
            1 + Math.sin(angle * 7 + l) * 0.11 + Math.cos(angle * 11) * 0.06;
          positions[v] *= scale;
          positions[v + 2] *= scale;
          if (positions[v + 1] < 0)
            positions[v + 1] += Math.sin(angle * 9 + l) * 0.1;
        }
        crown.setVerticesData(VertexBuffer.PositionKind, positions);
        const normals: number[] = [];
        VertexData.ComputeNormals(positions, crown.getIndices()!, normals);
        crown.setVerticesData(VertexBuffer.NormalKind, normals);
        parts.push(crown);
      }
    } else {
      for (let n = 0; n < 4; n++) {
        const angle = n * 2.4;
        const branch = cyl(
          "Oak branch",
          Math.sin(angle) * 0.38,
          1.9,
          Math.cos(angle) * 0.38,
          0.18,
          1.7,
          bark,
          undefined,
          0.09,
          7,
        );
        branch.rotation.x = Math.cos(angle) * 0.55;
        branch.rotation.z = Math.sin(angle) * 0.55;
        parts.push(branch);
      }
      for (let n = 0; n < 12; n++) {
        const a = sphere(
          "oak",
          Math.sin(n * 2.4) * (n < 8 ? 0.95 : 0.4),
          2.3 + (n % 4) * 0.34,
          Math.cos(n * 2.4) * (n < 8 ? 0.9 : 0.4),
          0.64 + (n % 3) * 0.1,
          leaf[n % 3 === 0 ? 2 : k],
        );
        a.scaling.y = 0.85 + (n % 3) * 0.17;
        parts.push(a);
      }
    }
    const merged = Mesh.MergeMeshes(parts, true, true, undefined, false, true)!;
    merged.name = `forest-${k}`;
    merged.isVisible = false;
    treeTemplates.push(merged);
  }
  for (let k = 0; k < 4; k++) {
    const transforms: Matrix[] = [];
    for (let i = 0; i < 105; i++) {
      const x = (rnd() - 0.5) * 115,
        z = (rnd() - 0.5) * 100,
        y = landHeight(x, z);
      if (
        y < 0.3 ||
        HOME_POSITIONS.some((p) => Math.hypot(x - p[0], z - p[1]) < 12) ||
        Math.abs(x - (3 + Math.sin(z * 0.075) * 8)) < 2.6
      )
        continue;
      const scale = 0.85 + rnd() * 1.1;
      transforms.push(
        Matrix.Scaling(scale, scale * (0.85 + rnd() * 0.3), scale)
          .multiply(Matrix.RotationY(rnd() * 6.28))
          .multiply(Matrix.Translation(x, y, z)),
      );
    }
    const template = treeTemplates[k];
    if (transforms.length) {
      template.isVisible = true;
      template.thinInstanceAdd(transforms);
      template.thinInstanceRefreshBoundingInfo(true);
      shadows.addShadowCaster(template);
    }
  }
  // Rocks, wildflowers, mushrooms and forgotten ruins.
  for (let i = 0; i < 90; i++) {
    const x = (rnd() - 0.5) * 120,
      z = (rnd() - 0.5) * 100,
      y = landHeight(x, z);
    if (
      y < -0.9 ||
      HOME_POSITIONS.some((p) => Math.hypot(x - p[0], z - p[1]) < 9)
    )
      continue;
    const r = sphere("mossy rock", x, y, z, 0.5 + rnd() * 1.3, rock);
    r.scaling.y = 0.65;
    staticMeshes.push(r);
  }
  const flowerMats = [
    mat("Foxglove", "#b8a5d0"),
    mat("Buttercup", "#edc46f"),
    mat("Poppy", "#dd957d"),
  ];
  for (let i = 0; i < 85; i++) {
    const x = -35 + rnd() * 34,
      z = -30 + rnd() * 35;
    if (Math.abs(x + 17) < 7 && Math.abs(z + 12) < 7) continue;
    const y = landHeight(x, z);
    if (y < 0.1) continue;
    sphere("wildflower", x, y + 0.2, z, 0.13, flowerMats[i % 3]);
  }
  // Footbridge, signpost, supplies, a generous quantity of mushrooms.
  for (let i = 0; i < 15; i++)
    box("Bridge plank", -2 + i * 0.48, 1, -21, 0.43, 0.2, 2.4, woodLight);
  for (const z of [-22.3, -19.7]) {
    box("Bridge handrail", 1.4, 2, z, 7.6, 0.12, 0.12, wood);
    for (let x = -2; x < 6; x += 2)
      box("Bridge post", x, 1.5, z, 0.17, 1.6, 0.17, wood);
  }
  const mushroom = mat("Mushroom", "#cb7163");
  for (let i = 0; i < 14; i++) {
    let x = -29 + rnd() * 6,
      z = -12 + rnd() * 12;
    const y = landHeight(x, z);
    cyl("Mushroom stalk", x, y + 0.25, z, 0.1, 0.5, stone);
    const cap = sphere("Mushroom cap", x, y + 0.48, z, 0.3, mushroom);
    cap.scaling.y = 0.45;
  }
  for (let n = 0; n < 7; n++) {
    const x = -38 + n * 0.8;
    box("Old wall", x, 0.9, 4, 0.7, 1.3 + rnd(), 0.6, stone);
  }
  const tuftPositions: number[] = [],
    tuftIndices: number[] = [],
    tuftNormals: number[] = [];
  for (let n = 0; n < 5; n++) {
    const a = n * 2.4,
      x = Math.sin(a) * 0.14,
      z = Math.cos(a) * 0.14,
      start = tuftPositions.length / 3;
    tuftPositions.push(
      x - 0.055,
      0,
      z,
      x + 0.055,
      0,
      z,
      x + Math.sin(a) * 0.09,
      0.25 + (n % 2) * 0.11,
      z + Math.cos(a) * 0.09,
    );
    tuftIndices.push(start, start + 1, start + 2);
  }
  VertexData.ComputeNormals(tuftPositions, tuftIndices, tuftNormals);
  const tuft = new Mesh("Meadow tufts", scene);
  const tuftData = new VertexData();
  tuftData.positions = tuftPositions;
  tuftData.indices = tuftIndices;
  tuftData.normals = tuftNormals;
  tuftData.applyToMesh(tuft);
  tuft.material = mat("Wild grass", "#566c36");
  (tuft.material as StandardMaterial).backFaceCulling = false;
  tuft.isPickable = false;
  const grassMatrices: Matrix[] = [];
  for (let n = 0; n < 1400; n++) {
    const x = -50 + rnd() * 100,
      z = -45 + rnd() * 90,
      y = landHeight(x, z);
    if (
      y < 0.2 ||
      HOME_POSITIONS.some((p) => Math.hypot(x - p[0], z - p[1]) < 4)
    )
      continue;
    const scale = 0.6 + rnd() * 0.7;
    grassMatrices.push(
      Matrix.Scaling(scale, scale, scale)
        .multiply(Matrix.RotationY(rnd() * 6.3))
        .multiply(Matrix.Translation(x, y + 0.04, z)),
    );
  }
  tuft.thinInstanceAdd(grassMatrices);
  tuft.thinInstanceRefreshBoundingInfo(true);
  tuft.receiveShadows = true;
  // Weathered fence marks an old farm, long before anyone thought to wear a crown.
  for (let n = 0; n < 13; n++) {
    const x = -32 + n * 0.65,
      z = -21 + Math.sin(n * 0.2) * 0.8,
      y = landHeight(x, z);
    const post = box(
      "Crooked fence",
      x,
      y + 0.52,
      z,
      0.1,
      1.04,
      0.13,
      woodLight,
    );
    post.rotation.z = Math.sin(n * 3) * 0.08;
    if (n < 12) {
      box("Fence rail", x + 0.3, y + 0.68, z, 0.8, 0.09, 0.09, wood);
      box("Fence rail", x + 0.3, y + 0.3, z, 0.8, 0.08, 0.09, wood);
    }
  }
  const banners: { mesh: Mesh; offset: number }[] = [];
  const fires: { mesh: Mesh; base: number }[] = [];
  function flag(
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
    color: string,
    scale = 1,
  ) {
    cyl(
      "Flagpole",
      x,
      y + 1.2 * scale,
      z,
      0.065 * scale,
      2.8 * scale,
      gold,
      parent,
      undefined,
      5,
    );
    const m = box(
      "Pennant",
      x + 0.45 * scale,
      y + 1.9 * scale,
      z,
      0.95 * scale,
      0.58 * scale,
      0.035,
      mat(`Banner${color}`, color),
      parent,
      false,
    );
    banners.push({ mesh: m, offset: rnd() * 10 });
  }
  function torch(parent: TransformNode, x: number, y: number, z: number) {
    box("Torch iron", x, y, z, 0.12, 0.55, 0.14, dark, parent);
    const m = sphere("Flame", x, y + 0.35, z, 0.17, windowMat, parent);
    m.scaling.y = 1.7;
    fires.push({ mesh: m, base: y + 0.35 });
  }
  function gable(
    parent: TransformNode,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    m: StandardMaterial,
  ) {
    const a = cyl("Gabled roof", x, y, z, w, h, m, parent, 0, 4);
    a.rotation.y = Math.PI / 4;
    a.scaling.z = d / w;
    return a;
  }
  function cottage(
    parent: TransformNode,
    x: number,
    z: number,
    style: number,
    scale = 1,
  ) {
    const grp = new TransformNode("Timber building", scene);
    grp.parent = parent;
    grp.position.set(x, 0, z);
    grp.scaling.setAll(scale);
    box("Plaster", 0, 1.3, 0, 3.7, 2.6, 3, mat("Warm plaster", "#d6b993"), grp);
    box("Timber base", 0, 0.2, 0, 3.85, 0.4, 3.15, wood, grp);
    for (const xx of [-1.72, 0, 1.72])
      box("Vertical frame", xx, 1.3, -1.55, 0.16, 2.65, 0.12, wood, grp);
    box("Cross frame", 0, 1.25, -1.56, 3.6, 0.15, 0.14, wood, grp);
    for (const xx of [-1.65, 1.65])
      box("Side frame", xx, 1.3, 0, 0.15, 2.65, 3.2, wood, grp);
    const a = box(
      "Roof left",
      -0.98,
      3.15,
      0,
      2.6,
      0.25,
      3.9,
      style ? clay : roof,
      grp,
    );
    a.rotation.z = 0.55;
    const b = box(
      "Roof right",
      0.98,
      3.15,
      0,
      2.6,
      0.25,
      3.9,
      style ? clay : roof,
      grp,
    );
    b.rotation.z = -0.55;
    box("Door", 0.55, 0.75, -1.57, 0.75, 1.5, 0.1, wood, grp);
    box("Cottage window", -0.8, 1.65, -1.58, 0.62, 0.65, 0.11, windowMat, grp);
    box("Window bar", -0.8, 1.65, -1.65, 0.07, 0.7, 0.05, wood, grp);
    box("Chimney", 1.2, 3.6, 0.65, 0.56, 1.9, 0.6, stone, grp);
    box("Chimney cap", 1.2, 4.55, 0.65, 0.75, 0.15, 0.77, woodLight, grp);
    for (const side of [-1, 1]) {
      const trim = box(
        "Gable trim",
        side * 0.98,
        3.16,
        -2.03,
        2.65,
        0.16,
        0.13,
        woodLight,
        grp,
      );
      trim.rotation.z = side < 0 ? 0.55 : -0.55;
      box("Roof eave", side * 2.06, 2.5, 0, 0.13, 0.2, 4.1, woodLight, grp);
    }
    for (const xx of [-1.3, -0.5, 0.3, 1.1])
      box(
        "Door plank",
        0.55 + xx * 0.22,
        0.75,
        -1.64,
        0.07,
        1.45,
        0.03,
        woodLight,
        grp,
      );
    sphere("Doorknob", 0.8, 0.78, -1.7, 0.055, gold, grp);
    return grp;
  }
  const castleRoots = new Map<string, TransformNode>();
  const castleKeys = new Map<string, string>();
  const castleHealth = new Map<string, number>();
  function buildCastle(p: Player, index: number) {
    const parent = new TransformNode(`castle-${p.id}`, scene);
    const pos = positionOf(p, index);
    parent.position.set(pos.x, 0.75, pos.z);
    castleRoots.set(p.id, parent);
    const manor = p.buildings.keep;
    const team = mat(`Team ${p.color}`, p.color);
    parent.metadata = { player: p.id };
    if (p.plot === null) return;
    const soil = mat("Trodden earth", "#747957");
    const patch = cyl(
      "Settlement earth",
      0,
      -0.045,
      0,
      manor > 1 ? 15 : 8,
      0.06,
      soil,
      parent,
      undefined,
      16,
    );
    patch.scaling.z = 0.82;
    for (let n = 0; n < 9; n++) {
      const step = box(
        "Path cobble",
        Math.sin(n * 1.6) * 0.2,
        0.015,
        -2.5 - n * 0.6,
        0.65,
        0.08,
        0.48,
        rock,
        parent,
        false,
      );
      step.rotation.y = Math.sin(n) * 0.3;
    }

    // One stronghold grows from a ragged shelter into a fully walled castle.
    if (manor === 0) {
      const tarp = mat("Weathered canvas", "#c3aa7e");
      const left = box(
        "Shelter canvas",
        -0.65,
        1,
        0,
        1.75,
        0.09,
        2.8,
        tarp,
        parent,
      );
      left.rotation.z = 0.85;
      const right = box(
        "Shelter canvas",
        0.65,
        1,
        0,
        1.75,
        0.09,
        2.8,
        tarp,
        parent,
      );
      right.rotation.z = -0.85;
      box("Shelter ridge", 0, 1.65, 0, 0.14, 0.15, 3.2, wood, parent);
      for (const z of [-1.6, 1.6])
        box("Shelter support", 0, 0.9, z, 0.14, 1.8, 0.14, wood, parent);
      box("Bedroll", 0.1, 0.1, 0.4, 0.75, 0.17, 1.6, team, parent);
      for (const x of [-1.4, 1.4])
        for (const z of [-1.5, 1.5])
          box("Tent peg", x, 0.1, z, 0.09, 0.3, 0.09, wood, parent);
      flag(parent, -1.7, 0, 1.1, p.color, 0.85);
    } else if (manor === 1) {
      cottage(parent, 0, 0, 0, 1.2);
      flag(parent, -1.9, 3.6, 0, p.color);
    } else {
      const height = manor === 3 ? 7 : 5.8;
      box("Keep foundation", 0, 0.25, 0, 7.2, 0.5, 6.1, stone, parent);
      masonry(parent, 0, -2.5, 6.3, height, 0.55);
      masonry(parent, 0, 2.5, 6.3, height, 0.55);
      box("Keep side", -3, height / 2, 0, 0.5, height, 4.8, stone, parent);
      box("Keep side", 3, height / 2, 0, 0.5, height, 4.8, stone, parent);
      box(
        "Upper cornice",
        0,
        height - 0.35,
        0,
        6.7,
        0.35,
        5.6,
        woodLight,
        parent,
      );
      for (let floor = 0; floor < 2; floor++)
        for (const x of [-1.9, 0, 1.9]) {
          box(
            "Window recess",
            x,
            1.8 + floor * 2.05,
            -2.63,
            0.66,
            1.15,
            0.1,
            dark,
            parent,
          );
          box(
            "Window glow",
            x,
            1.8 + floor * 2.05,
            -2.7,
            0.4,
            0.88,
            0.03,
            windowMat,
            parent,
          );
          box(
            "Window mullion",
            x,
            1.8 + floor * 2.05,
            -2.74,
            0.08,
            1,
            0.05,
            stone,
            parent,
          );
        }
      gable(parent, 0, height + 1.35, 0, 8, 2.8, 7, roof);
      box("Royal doorway", 0, 1, -2.8, 1.2, 2.1, 0.2, wood, parent);
      flag(parent, 0, height + 2.3, 0, p.color, 1.1);
      for (const [x, z] of [
        [-3.2, 2.6],
        [3.2, 2.6],
      ]) {
        cyl("Keep turret", x, height * 0.52, z, 2, height + 1.2, stone, parent);
        cyl("Turret hat", x, height + 1.6, z, 2.8, 2, roof, parent, 0);
        flag(parent, x, height + 2.4, z, p.color, 0.65);
      }
      torch(parent, -1.2, 1.7, -2.9);
      torch(parent, 1.2, 1.7, -2.9);
    }
    if (p.buildings.walls) {
      const h = 1.6 + p.buildings.walls * 0.65;
      for (const z of [-5.4, 5.4]) {
        for (const x of [-4, 4]) masonry(parent, x, z, 3.8, h, 0.65);
        if (z > 0) masonry(parent, 0, z, 4.4, h, 0.65);
        for (let x = -5.8; x <= 5.8; x += 0.95) {
          if (z < 0 && Math.abs(x) < 1.5) continue;
          box("Merlon", x, h + 0.25, z, 0.5, 0.6, 0.8, stone, parent);
        }
      }
      for (const x of [-5.8, 5.8]) {
        box("Side wall", x, h / 2, 0, 0.65, h, 11, stone, parent);
        for (let z = -5; z < 5.5; z += 0.95)
          box("Side merlon", x, h + 0.25, z, 0.8, 0.6, 0.5, stone, parent);
      }
      for (const x of [-5.8, 5.8])
        for (const z of [-5.4, 5.4]) {
          const th = h + 1.1;
          cyl("Corner tower", x, th / 2, z, 2.1, th, stone, parent);
          cyl("Tower lip", x, th, z, 2.35, 0.4, stone, parent);
          for (let n = 0; n < 8; n++) {
            const a = (n * Math.PI) / 4;
            box(
              "Tower tooth",
              x + Math.cos(a) * 0.95,
              th + 0.4,
              z + Math.sin(a) * 0.95,
              0.45,
              0.5,
              0.45,
              stone,
              parent,
            );
          }
          if (z > 0 && p.buildings.walls > 1) {
            cyl("Tower roof", x, th + 1.3, z, 2.8, 2, roof, parent, 0);
            flag(parent, x, th + 2, z, p.color, 0.7);
          }
        }
      box("Gate lintel", 0, h - 0.25, -5.4, 2.1, 0.65, 0.7, stone, parent);
      for (const x of [-1, 1])
        box("Gate post", x, h / 2, -5.4, 0.35, h, 0.8, stone, parent);
    }
    if (p.buildings.tavern) {
      cottage(parent, -7.8, -0.5, 1, 0.75);
      box("Tavern sign", -6.3, 1.7, -2, 0.55, 0.65, 0.08, gold, parent);
    }
    if (p.buildings.workshop) {
      cottage(parent, 6.6, 2, 0, 0.7);
      box("Workbench", 7.2, 0.7, -0.5, 1.8, 0.15, 0.8, wood, parent);
    }
    if (p.buildings.quarry) {
      for (let n = 0; n < 9; n++)
        sphere(
          "Quarry stone",
          -7 + (n % 3) * 0.65,
          0.5 + Math.floor(n / 3) * 0.35,
          4 + (n % 2),
          0.5,
          stone,
          parent,
        );
    }
    for (const [w, n] of Object.entries(p.weapons)) {
      if (!n) continue;
      const wp = new TransformNode(w, scene);
      wp.parent = parent;
      wp.position.set(
        w === "ballista" ? 4 : w === "goatapult" ? -4 : 0,
        0,
        -7.7,
      );
      if (w === "arcane") {
        cyl("Arcane plinth", 0, 0.35, 0, 1.5, 0.7, stone, wp);
        const gem = sphere(
          "Arcane crystal",
          0,
          1.4,
          0,
          0.65,
          mat("Arcane amethyst", "#b298ff", true),
          wp,
        );
        gem.scaling.y = 1.4;
        const ring = MeshBuilder.CreateTorus(
          "Spell ring",
          { diameter: 2, thickness: 0.08, tessellation: 24 },
          scene,
        );
        ring.parent = wp;
        ring.position.y = 1.5;
        ring.material = gold;
      } else {
        box("Siege frame", 0, 0.4, 0, 1.5, 0.24, 2, wood, wp);
        for (const x of [-0.9, 0.9])
          for (const z of [-0.7, 0.7]) {
            const wh = cyl("Wheel", x, 0.35, z, 0.7, 0.2, woodLight, wp);
            wh.rotation.z = Math.PI / 2;
          }
        beam(new Vector3(-0.6, 0.5, 0), new Vector3(0, 2, 0), 0.18, wood, wp);
        beam(new Vector3(0.6, 0.5, 0), new Vector3(0, 2, 0), 0.18, wood, wp);
        const arm = box(
          "Throwing arm",
          0,
          2.1,
          -0.35,
          0.16,
          0.16,
          3,
          woodLight,
          wp,
        );
        arm.rotation.x = -0.65;
        box("Counterweight", 0, 1.55, 1, 0.6, 0.7, 0.5, stone, wp);
        if (w === "goatapult") {
          sphere("Goat payload", 0, 3, -1.4, 0.38, stone, wp);
        }
      }
    }
    // Stacks and warm campfire keep even the first shelter full of life.
    for (let i = 0; i < 3; i++) {
      const log = cyl(
        "Logs",
        2.5,
        0.22 + i * 0.18,
        0.8,
        0.28,
        1.7,
        woodLight,
        parent,
      );
      log.rotation.z = Math.PI / 2;
    }
    box("Crate", -2.2, 0.4, -2, 0.7, 0.8, 0.7, woodLight, parent);
    box("Crate strap", -2.2, 0.4, -2.37, 0.75, 0.14, 0.04, dark, parent);
    const fire = sphere("Campfire", -2.6, 0.3, -3.6, 0.25, windowMat, parent);
    fires.push({ mesh: fire, base: 0.3 });
    for (let n = 0; n < 8; n++) {
      const a = (n * Math.PI) / 4;
      sphere(
        "Fire ring",
        -2.6 + Math.sin(a) * 0.42,
        0.08,
        -3.6 + Math.cos(a) * 0.42,
        0.13,
        rock,
        parent,
      );
    }
    if (p.hp < p.maxHp * 0.45) {
      for (let n = 0; n < 5; n++)
        sphere("Rubble", -3 + n * 1.2, 0.2, -3.3, 0.35, stone, parent);
    }
    parent.getChildMeshes().forEach((m) => {
      m.metadata = { ...m.metadata, player: p.id };
    });
    if (p.hp <= 0) {
      parent.scaling.y = 0.22;
      parent.rotation.z = 0.07;
    }
  }
  const hero = new TransformNode("Borg Meister", scene);
  const cloak = mat("Royal cloak", "#b77840");
  cyl("Coat", 0, 0.55, 0, 0.68, 1.1, cloak, hero, 0.38, 8);
  sphere("Face", 0, 1.32, 0, 0.31, mat("Skin", "#e1ba8e"), hero);
  cyl("Crown", 0, 1.65, 0, 0.65, 0.24, gold, hero, 0.68, 7);
  for (let n = 0; n < 5; n++) {
    const a = n * 1.256;
    sphere(
      "Crown point",
      Math.sin(a) * 0.25,
      1.87,
      Math.cos(a) * 0.25,
      0.07,
      gold,
      hero,
    );
  }
  box("Backpack", 0, 0.8, 0.35, 0.5, 0.65, 0.27, wood, hero);
  for (const x of [-0.45, 0.45]) {
    const arm = cyl(
      "Sleeve",
      x,
      0.85,
      0,
      0.26,
      0.65,
      cloak,
      hero,
      undefined,
      8,
    );
    arm.rotation.z = x > 0 ? -0.22 : 0.22;
    sphere("Hand", x, 0.52, -0.05, 0.14, mat("Skin", "#e1ba8e"), hero);
  }
  for (const x of [-0.12, 0.12]) {
    sphere("Eye white", x, 1.4, -0.25, 0.095, stone, hero);
    sphere("Pupil", x, 1.4, -0.33, 0.043, dark, hero);
  }
  sphere("Royal nose", 0, 1.26, -0.31, 0.12, mat("Skin", "#e1ba8e"), hero);
  const beard = sphere("Improbable moustache", 0, 1.17, -0.3, 0.15, wood, hero);
  beard.scaling.x = 1.45;
  beard.scaling.y = 0.42;
  hero.scaling.setAll(1.3);
  for (const x of [-0.19, 0.19])
    box("Boot", x, 0.1, -0.04, 0.22, 0.25, 0.42, dark, hero);
  const rings: Mesh[] = [];
  for (let n = 0; n < 3; n++) {
    const r = MeshBuilder.CreateTorus(
      `Clearing ${n}`,
      { diameter: 3.8, thickness: 0.07, tessellation: 48 },
      scene,
    );
    r.material = mat(
      n === 0 ? "Selected clearing" : `Other clearing${n}`,
      n === 0 ? "#dbea9f" : "#bcd3b6",
      true,
    );
    r.metadata = { plot: n };
    rings.push(r);
  }
  const fireflies: Mesh[] = [];
  for (let n = 0; n < 14; n++) {
    const m = sphere(
      "Firefly",
      -30 + rnd() * 30,
      1 + rnd() * 4,
      -25 + rnd() * 30,
      0.025,
      windowMat,
    );
    m.isPickable = false;
    fireflies.push(m);
  }
  let data = propsRef.current.game;
  let me = propsRef.current.me;
  let chosen = propsRef.current.selection;
  let first = true;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  let landingTime = reduceMotion ? 2 : 0;
  let heroTarget = new Vector3(-17, 0.8, -12);
  let cameraGoal: Vector3 | null = null;
  let radiusGoal: number | null = null;
  let battleState: {
    event: Battle;
    time: number;
    projectile: Mesh;
    start: Vector3;
    end: Vector3;
    hit: boolean;
  } | null = null;
  const debris: { m: Mesh; v: Vector3; life: number }[] = [];
  function update(g: Game, myId: string, plot: number) {
    data = g;
    me = myId;
    chosen = plot;
    const index = Math.max(
      0,
      g.players.findIndex((p) => p.id === myId),
    );
    const mine = g.players[index];
    g.players.forEach((p, i) => {
      const key = JSON.stringify([
        p.plot,
        p.buildings,
        p.weapons,
        p.hp <= 0,
        p.hp < p.maxHp * 0.45,
      ]);
      const repaired = p.hp > (castleHealth.get(p.id) ?? p.hp);
      if (castleKeys.get(p.id) !== key || repaired) {
        castleRoots.get(p.id)?.dispose(false, false);
        buildCastle(p, i);
        castleKeys.set(p.id, key);
      }
      castleHealth.set(p.id, p.hp);
    });
    for (const [id, node] of castleRoots)
      if (!g.players.some((p) => p.id === id)) {
        node.dispose(false, false);
        castleRoots.delete(id);
        castleKeys.delete(id);
        castleHealth.delete(id);
      }
    const base = HOME_POSITIONS[index];
    heroTarget = new Vector3(
      base[0] + CLEARINGS[plot].offset[0],
      0.8,
      base[1] + CLEARINGS[plot].offset[1],
    );
    const settling = g.phase === "settling" && mine.plot === null;
    rings.forEach((r, n) => {
      r.setEnabled(settling);
      r.position.set(
        base[0] + CLEARINGS[n].offset[0],
        0.86,
        base[1] + CLEARINGS[n].offset[1],
      );
      r.scaling.setAll(n === plot ? 1.15 : 0.8);
    });
    if (first) {
      first = false;
      hero.position = heroTarget.clone();
      hero.position.y = 24;
      landingTime = reduceMotion ? 2 : 0;
      camera.setTarget(new Vector3(base[0] + 1, 1.7, base[1]));
      camera.radius = 27;
    }
    if (!settling) {
      const pos = positionOf(mine, index);
      heroTarget = new Vector3(pos.x - 2, 0.8, pos.z - 2);
    }
  }
  function command(c: WorldCommand) {
    if (c.kind === "zoom-in") radiusGoal = Math.max(17, camera.radius - 8);
    else if (c.kind === "zoom-out")
      radiusGoal = Math.min(105, camera.radius + 10);
    else if (c.kind === "realm") {
      cameraGoal = new Vector3(0, 1, 5);
      radiusGoal = 100;
    } else {
      const idx = Math.max(
        0,
        data.players.findIndex((p) => p.id === (c.id ?? me)),
      );
      const pos = positionOf(data.players[idx], idx);
      cameraGoal = new Vector3(pos.x, 2, pos.z);
      radiusGoal = c.kind === "home" ? 27 : 30;
    }
  }
  function attack(b: Battle | null) {
    if (battleState) {
      battleState.projectile.dispose();
      battleState = null;
    }
    if (!b) return;
    const f = data.players.findIndex((p) => p.id === b.from),
      t = data.players.findIndex((p) => p.id === b.to);
    if (f < 0 || t < 0) {
      propsRef.current.onBattleEnd();
      return;
    }
    const from = positionOf(data.players[f], f),
      to = positionOf(data.players[t], t);
    const start = new Vector3(from.x, 3, from.z - 7),
      end = new Vector3(
        to.x,
        2.4,
        to.z -
          (data.players[t].buildings.walls
            ? 5.4
            : data.players[t].buildings.keep > 1
              ? 2.5
              : 0),
      );
    const magic = ["arcane", "scientist", "bard"].includes(b.weapon);
    const projectile = sphere(
      "Royal correspondence",
      start.x,
      start.y,
      start.z,
      b.weapon === "ballista" ? 0.25 : 0.55,
      magic
        ? mat("Projectile spell", "#bd9dff", true)
        : b.weapon === "goatapult" || b.weapon === "wrangler"
          ? stone
          : rock,
    );
    battleState = { event: b, time: 0, projectile, start, end, hit: false };
    cameraGoal = Vector3.Center(start, end).add(new Vector3(0, 2, 0));
    radiusGoal = Math.min(65, Vector3.Distance(start, end) * 1.05 + 12);
  }
  const taps = createTapTracker();
  const onDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    taps.down(e.pointerId, e.clientX, e.clientY);
    // Touch takes over immediately from a camera-button transition.
    if (!battleState) {
      cameraGoal = null;
      radiusGoal = null;
    }
  };
  const onMove = (e: PointerEvent) =>
    taps.move(e.pointerId, e.clientX, e.clientY);
  const onCancel = (e: PointerEvent) => taps.cancel(e.pointerId);
  const onUp = (e: PointerEvent) => {
    if (!taps.up(e.pointerId, e.clientX, e.clientY) || battleState) return;
    const rect = canvas.getBoundingClientRect();
    const picked = scene.pick(e.clientX - rect.left, e.clientY - rect.top);
    if (!picked?.hit) return;
    const meta = picked.pickedMesh?.metadata;
    if (meta?.plot !== undefined) {
      propsRef.current.onSelectPlot(meta.plot);
      return;
    }
    const idx = Math.max(
      0,
      data.players.findIndex((p) => p.id === me),
    );
    if (
      data.phase === "settling" &&
      data.players[idx].plot === null &&
      picked.pickedPoint
    ) {
      const pt = picked.pickedPoint;
      const base = HOME_POSITIONS[idx];
      const distances = CLEARINGS.map((p) =>
        Math.hypot(pt.x - base[0] - p.offset[0], pt.z - base[1] - p.offset[1]),
      );
      const n = distances.indexOf(Math.min(...distances));
      if (distances[n] < 16) propsRef.current.onSelectPlot(n);
    } else if (meta?.player) {
      propsRef.current.onSelectPlayer(meta.player);
    }
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointercancel", onCancel);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("blur", taps.reset);
  const resize = () => engine.resize();
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  let time = 0;
  let disposed = false;
  engine.runRenderLoop(() => {
    if (document.hidden) return;
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    if (!reduceMotion) time += dt;
    landingTime += dt;
    if (cameraGoal) {
      camera.target = Vector3.Lerp(
        camera.target,
        cameraGoal,
        Math.min(1, dt * 3),
      );
      if (Vector3.Distance(camera.target, cameraGoal) < 0.06) cameraGoal = null;
    }
    if (radiusGoal !== null) {
      camera.radius += (radiusGoal - camera.radius) * Math.min(1, dt * 3);
      if (Math.abs(camera.radius - radiusGoal) < 0.1) radiusGoal = null;
    }
    if (landingTime < 1.65) {
      hero.position.y = 0.8 + Math.max(0, 24 - 16 * landingTime * landingTime);
      hero.rotation.y = time * 3;
    } else {
      const delta = heroTarget.subtract(hero.position);
      delta.y = 0;
      if (delta.length() > 0.07) {
        hero.rotation.y = Math.atan2(delta.x, delta.z);
        const distance = delta.length();
        hero.position.addInPlace(
          delta.normalize().scale(Math.min(distance, dt * 4)),
        );
        hero.position.y = 0.8 + Math.abs(Math.sin(time * 12)) * 0.15;
      } else hero.position.y = 0.8 + Math.sin(time * 2) * 0.02;
    }
    banners.forEach((b) => {
      if (!b.mesh.isDisposed()) {
        b.mesh.rotation.y = Math.sin(time * 2 + b.offset) * 0.18;
        b.mesh.rotation.x = Math.sin(time * 2.8 + b.offset) * 0.05;
      }
    });
    fires.forEach((f) => {
      if (!f.mesh.isDisposed()) {
        f.mesh.scaling.y = 1.5 + Math.sin(time * 17 + f.base) * 0.3;
        f.mesh.scaling.x = 0.85 + Math.sin(time * 11) * 0.1;
      }
    });
    fireflies.forEach((m, n) => {
      m.position.y += Math.sin(time + n) * 0.002;
      m.position.x += Math.sin(time * 0.7 + n) * 0.003;
    });
    if (battleState) {
      const b = battleState;
      b.time += dt;
      const progress = Math.min(1, b.time / 3.4);
      b.projectile.position = Vector3.Lerp(b.start, b.end, progress);
      b.projectile.position.y +=
        0.5 * 9.81 * 3.4 * 3.4 * progress * (1 - progress);
      b.projectile.rotation.x += dt * 5;
      b.projectile.rotation.z += dt * 3;
      if (progress > 0.58 && progress < 0.62) {
        cameraGoal = b.end.add(new Vector3(0, 1, 0));
        radiusGoal = 23;
      }
      if (progress >= 1 && !b.hit) {
        b.hit = true;
        b.projectile.setEnabled(false);
        const magic = ["arcane", "scientist"].includes(b.event.weapon);
        if (b.event.damage > 0) shatter(b.event.to, b.end, magic);
        canvas.dispatchEvent(
          new CustomEvent("siege-impact", { detail: b.event }),
        );
      }
      if (b.time > 5.3) {
        b.projectile.dispose();
        battleState = null;
        propsRef.current.onBattleEnd();
      }
    }
    for (let n = staticColliders.length - 1; n >= 0; n--) {
      const c = staticColliders[n];
      c.age += dt;
      if (c.age > 9) {
        c.aggregate.dispose();
        c.mesh.dispose();
        staticColliders.splice(n, 1);
      }
    }
    for (const r of physicalRubble) {
      r.age += dt;
      if (r.age > 10 && r.aggregate) {
        r.aggregate.dispose();
        r.aggregate = null as unknown as PhysicsAggregate;
        r.mesh.freezeWorldMatrix();
      }
    }
    for (let i = debris.length - 1; i >= 0; i--) {
      const d = debris[i];
      d.life -= dt;
      d.v.y -= 10 * dt;
      d.m.position.addInPlace(d.v.scale(dt));
      d.m.rotation.x += dt * 3;
      if (d.life < 0 || d.m.position.y < 0) {
        d.m.dispose();
        debris.splice(i, 1);
      }
    }
    scene.render();
  });
  update(
    propsRef.current.game,
    propsRef.current.me,
    propsRef.current.selection,
  );
  scene.executeWhenReady(() => {
    if (!disposed) ready();
  });
  return {
    update,
    command,
    attack,
    dispose: () => {
      disposed = true;
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("blur", taps.reset);
      engine.stopRenderLoop();
      physicalRubble.forEach((r) => r.aggregate?.dispose());
      staticColliders.forEach((c) => c.aggregate.dispose());
      physicsBodies.forEach((b) => b.dispose());
      scene.dispose();
      engine.dispose();
    },
  };
}
export default function World(props: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!canvas.current) return;
    try {
      runtime.current = createWorld(canvas.current, propsRef, () =>
        setLoaded(true),
      );
    } catch (e) {
      console.error("3D world failed", e);
      setError(true);
    }
    return () => runtime.current?.dispose();
  }, [props.quality]);
  useEffect(
    () => runtime.current?.update(props.game, props.me, props.selection),
    [props.game, props.me, props.selection],
  );
  useEffect(() => {
    if (props.command) runtime.current?.command(props.command);
  }, [props.command]);
  useEffect(() => {
    runtime.current?.attack(props.battle);
  }, [props.battle]);
  return (
    <div className="world">
      <canvas
        ref={canvas}
        aria-label="Interactive 3D kingdom. Drag to orbit, pinch or scroll to zoom; tap clearings or rival castles. Camera buttons are also available."
        tabIndex={0}
      />
      {!loaded && !error && (
        <div className="world-loading">
          <div className="loading-sigil">♜</div>
          <span>Raising a little trouble…</span>
        </div>
      )}
      {error && (
        <div className="world-loading">
          <b>The kingdom needs 3D graphics.</b>
          <p>
            Enable hardware acceleration, or try a recent Chrome, Safari or
            Firefox.
          </p>
        </div>
      )}
    </div>
  );
}
