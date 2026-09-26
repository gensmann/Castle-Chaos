"use client";
import { useEffect, useRef, useState } from "react";
import HavokPhysics from "@babylonjs/havok";
import havokWasmUrl from "@babylonjs/havok/lib/esm/HavokPhysics.wasm?url";
import type { Game, Battle, Player } from "@/lib/game";
import { HOME_POSITIONS, CLEARINGS, positionOf } from "@/lib/game";
import { createWaterMaterial } from "./world-atmosphere";
import { createIsometricCamera } from "./isometric-camera";
import { createWorldLife } from "./world-life";
import { detailLevel, type DetailLevel } from "@/lib/isometric-view";
import { villageTexture } from "./world-materials";
import { createVillageSprites, type VillageSprite } from "./world-sprites";
import "@babylonjs/core/Engines/Extensions/engine.dynamicTexture";
import { Engine } from "@babylonjs/core/Engines/engine";
import { Scene } from "@babylonjs/core/scene";
import "@babylonjs/core/Culling/ray";
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
import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
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
  onViewChange: (overview: boolean) => void;
  command: WorldCommand | null;
  quality: "high" | "low";
};
type Runtime = {
  update: (g: Game, me: string, plot: number) => void;
  command: (c: WorldCommand) => void;
  attack: (b: Battle | null) => void;
  dispose: () => void;
};
let havokRuntime: ReturnType<typeof HavokPhysics> | undefined;
const rgb = (s: string) => Color3.FromHexString(s);

function createWorld(
  canvas: HTMLCanvasElement,
  propsRef: React.RefObject<Props>,
  landmarks: HTMLDivElement,
  ready: () => void,
): Runtime {
  const highQuality = propsRef.current.quality === "high";
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
  // Engine adaptToDeviceRatio is off: scale is relative to CSS pixels, not DPR.
  const resizeResolution = () =>
    engine.setHardwareScalingLevel(
      1 / Math.min(window.devicePixelRatio || 1, highQuality ? 1.6 : 1),
    );
  resizeResolution();
  engine.maxFPS = highQuality ? 60 : 30;
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.64, 0.75, 0.71, 1);
  scene.ambientColor = rgb("#253427");
  scene.imageProcessingConfiguration.toneMappingEnabled = true;
  scene.imageProcessingConfiguration.toneMappingType = 1;
  scene.imageProcessingConfiguration.exposure = 1.12;
  scene.imageProcessingConfiguration.contrast = 1.04;
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogColor = rgb("#a3bfb5");
  scene.fogDensity = 0.0012;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const view = createIsometricCamera(
    scene,
    canvas,
    reduceMotion,
    selectAt,
    (overview) => propsRef.current.onViewChange(overview),
  );
  const camera = view.camera;
  const hemi = new HemisphericLight("Sky", new Vector3(0.3, 1, 0.4), scene);
  hemi.intensity = 0.85;
  hemi.diffuse = rgb("#ccd9c2");
  hemi.groundColor = rgb("#6d795e");
  const sun = new DirectionalLight(
    "Late afternoon",
    new Vector3(-0.6, -1, 0.45),
    scene,
  );
  sun.position = new Vector3(30, 65, -30);
  sun.intensity = 1.2;
  sun.diffuse = rgb("#fff0cd");
  const shadows = new ShadowGenerator(
    propsRef.current.quality === "low" ? 1024 : 2048,
    sun,
  );
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = highQuality
    ? ShadowGenerator.QUALITY_MEDIUM
    : ShadowGenerator.QUALITY_LOW;
  const shadowMap = shadows.getShadowMap()!;
  shadowMap.refreshRate = highQuality ? 1 : 4;
  shadows.setDarkness(0.32);
  shadows.bias = 0.001;
  shadows.normalBias = 0.035;
  sun.shadowMinZ = 1;
  sun.shadowMaxZ = 150;
  const life = createWorldLife(scene, highQuality);
  let lod: DetailLevel = "near";
  const closeDetails: Mesh[] = [];
  const mediumDetails: Mesh[] = [];
  const sprites = createVillageSprites(scene);
  if (highQuality) {
    const glow = new GlowLayer("Torchglow", scene, {
      blurKernelSize: 24,
      mainTextureRatio: 0.35,
    });
    glow.intensity = 0.25;
  }
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
  const rock = mat("Cliff", "#626f69"),
    wood = mat("Timber", "#665037"),
    woodLight = mat("Cut wood", "#a18050"),
    dark = mat("Dark iron", "#313b37"),
    stone = mat("Limestone", "#b3b6a0"),
    roof = mat("Slate roof", "#ffffff"),
    clay = mat("Clay roof", "#ffffff"),
    gold = mat("Aged brass", "#d4b45f"),
    windowMat = mat("Lamplight", "#ffc36b", true),
    leaf = [
      mat("Leaf pine", "#477949"),
      mat("Leaf fern", "#658f45"),
      mat("Leaf bright", "#8ca84a"),
      mat("Leaf gold", "#9fa957"),
    ];
  const timberTexture = villageTexture(scene, "timber");
  wood.diffuseTexture = timberTexture;
  woodLight.diffuseTexture = timberTexture;
  wood.diffuseColor = rgb("#a38158");
  woodLight.diffuseColor = rgb("#f4d39a");
  // Low-frequency painted textures keep silhouettes readable at strategy-camera distance.
  function paintedTexture(name: string, base: string, foliage = false) {
    const texture = new DynamicTexture(name, 256, scene, true);
    const ctx = texture.getContext();
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2200; i++) {
      const light = rnd() > 0.48;
      ctx.fillStyle = light ? "rgba(239,229,174,0.085)" : "rgba(35,65,47,0.07)";
      const x = rnd() * 256,
        y = rnd() * 256,
        size = foliage ? 3 + rnd() * 9 : 1 + rnd() * 3;
      ctx.fillRect(x, y, size, size * (foliage ? 0.7 : 0.3));
    }
    texture.update(false);
    return texture;
  }
  const leafTexture = paintedTexture("Painted foliage", "#e4eccd", true);
  leaf.forEach((material) => {
    material.diffuseTexture = leafTexture;
    material.specularColor = Color3.Black();
  });
  const stoneTexture = villageTexture(scene, "stone");
  stoneTexture.uScale = 2;
  stoneTexture.vScale = 2;
  stone.diffuseTexture = stoneTexture;
  stone.diffuseColor = rgb("#c7c4b6");
  stone.emissiveColor = rgb("#10130f");
  const fieldstoneTexture = new Texture("/art/fieldstone.webp", scene);
  fieldstoneTexture.uScale = 1.5;
  fieldstoneTexture.vScale = 1;
  rock.diffuseTexture = fieldstoneTexture;
  rock.diffuseColor = rgb("#a3b1a3");
  rock.specularColor = Color3.Black();
  roof.diffuseTexture = villageTexture(scene, "slate");
  clay.diffuseTexture = villageTexture(scene, "clay");
  roof.specularColor = clay.specularColor = Color3.Black();
  function meshSetup(
    m: Mesh,
    material: StandardMaterial,
    parent?: TransformNode,
    shadow = true,
  ) {
    m.material = material;
    m.receiveShadows = true;
    m.parent = parent ?? null;
    if (shadow) {
      shadows.addShadowCaster(m);
      m.onDisposeObservable.addOnce(() => shadows.removeShadowCaster(m));
    }
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
      { radius: size, subdivisions: highQuality ? 2 : 1, flat: false },
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
    // Carve a real river bed so the water follows the land instead of floating over it.
    const riverDistance = Math.abs(x - (3 + Math.sin(z * 0.075) * 8));
    if (r < 0.94 && riverDistance < 2.3) {
      const bank = Math.min(1, Math.max(0, (riverDistance - 0.95) / 1.35));
      y = -0.6 + (y + 0.6) * bank * bank * (3 - 2 * bank);
    }
    return y;
  }
  const terrain = MeshBuilder.CreateGround(
    "The Unreasonable Isles",
    {
      width: 150,
      height: 140,
      subdivisions: highQuality ? 120 : 80,
      updatable: true,
    },
    scene,
  );
  const vertices = terrain.getVerticesData(VertexBuffer.PositionKind)!;
  const colors: number[] = [];
  for (let i = 0; i < vertices.length; i += 3) {
    const x = vertices[i],
      z = vertices[i + 2];
    vertices[i + 1] = landHeight(x, z);
    const elevation = vertices[i + 1];
    const meadowBlend = Math.max(0, Math.min(1, (elevation + 0.4) / 2.8));
    const color = Color3.Lerp(rgb("#d9ecc7"), rgb("#f0efc8"), meadowBlend);
    // Continuous beach and valley colors avoid hard bands that resemble shadow artifacts.
    if (elevation < -0.3)
      Color3.LerpToRef(
        color,
        rgb("#c6b58a"),
        Math.min(1, (-elevation - 0.3) / 0.9),
        color,
      );
    colors.push(color.r, color.g, color.b, 1);
  }
  terrain.updateVerticesData(VertexBuffer.PositionKind, vertices);
  const normals: number[] = [];
  VertexData.ComputeNormals(vertices, terrain.getIndices()!, normals);
  terrain.updateVerticesData(VertexBuffer.NormalKind, normals);
  terrain.setVerticesData(VertexBuffer.ColorKind, colors);
  const meadowTexture = paintedTexture("Painted meadow", "#98b96a");
  meadowTexture.uScale = 15;
  meadowTexture.vScale = 14;
  const terrainMat = mat("Living terrain", "#ffffff");
  terrainMat.diffuseTexture = meadowTexture;
  terrainMat.emissiveColor = rgb("#182313");
  terrainMat.specularColor = Color3.Black();
  terrain.material = terrainMat;
  terrain.receiveShadows = true;
  terrain.metadata = { ground: true };
  const waterMaterial = createWaterMaterial(scene);
  const water = MeshBuilder.CreateGround(
    "The Inconvenient Sea",
    { width: 500, height: 500 },
    scene,
  );
  water.position.y = -1.65;
  water.material = waterMaterial;
  water.isPickable = false;
  water.freezeWorldMatrix();
  const riverBanks: Vector3[][] = [[], []];
  for (let i = 0; i <= 100; i++) {
    const z = -53 + i * 1.06;
    const x = 3 + Math.sin(z * 0.075) * 8;
    for (let bank = 0; bank < 2; bank++)
      riverBanks[bank].push(new Vector3(x + (bank ? 1 : -1) * 1.45, 0.13, z));
  }
  const stream = MeshBuilder.CreateRibbon(
    "Silverbrook",
    { pathArray: riverBanks },
    scene,
  );
  stream.material = waterMaterial;
  stream.isPickable = false;
  stream.freezeWorldMatrix();
  let physicsReady = false;
  const physicsBodies: PhysicsAggregate[] = [];
  (havokRuntime ??= HavokPhysics({ locateFile: () => havokWasmUrl }))
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
      havokRuntime = undefined;
      if (scene.isDisposed) return;
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
    aggregate: PhysicsAggregate | null;
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
    const rows = Math.ceil(height / (highQuality ? 0.48 : 0.9)),
      cols = Math.ceil(width / (highQuality ? 0.78 : 1.4)),
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
      template.receiveShadows = true;
      template.isVisible = false;
      template.isPickable = false;
      brickTemplates.set(key, template);
    }
    for (let row = 0; row < rows; row++)
      for (let col = 0; col < cols; col++) {
        const m = template.createInstance("Masonry brick");
        m.parent = parent;
        m.position.set(x - width / 2 + bw * (col + 0.5), bh * (row + 0.5), z);
        m.metadata = {
          destructible: true,
          dimensions: [bw - 0.025, bh - 0.022, depth],
        };
        shadows.addShadowCaster(m);
        m.onDisposeObservable.addOnce(() => shadows.removeShadowCaster(m));
      }
  }
  const impactWaves: { mesh: Mesh; material: StandardMaterial; age: number }[] =
    [];
  function impactWave(point: Vector3, magic: boolean) {
    const material = new StandardMaterial("Impact light", scene);
    material.emissiveColor = rgb(magic ? "#c5a2ff" : "#efcd8b");
    material.disableLighting = true;
    material.alpha = 0.65;
    const ring = MeshBuilder.CreateTorus(
      "Impact wave",
      { diameter: 1, thickness: 0.045, tessellation: 48 },
      scene,
    );
    ring.position.set(point.x, 0.88, point.z);
    ring.material = material;
    ring.isPickable = false;
    impactWaves.push({ mesh: ring, material, age: 0 });
  }
  function shatter(targetId: string, point: Vector3, magic: boolean) {
    impactWave(point, magic);
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
      chunk.onDisposeObservable.addOnce(() =>
        shadows.removeShadowCaster(chunk),
      );
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
            !m.name.startsWith("Castle detail /") &&
            (m.isPickable || m.metadata?.collider) &&
            Vector3.DistanceSquared(
              m.getBoundingInfo().boundingBox.centerWorld,
              point,
            ) < 40,
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
        collider.position = m.getBoundingInfo().boundingBox.centerWorld.clone();
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
  const sceneryStart = scene.meshes.length;
  // Each painted landscape element is only two triangles. Thin instances keep
  // the entire forest to one draw per species, even with hundreds of trees.
  for (const [k, kind] of (
    ["oak", "spruce", "birch", "rocks"] as VillageSprite[]
  ).entries()) {
    const transforms: Matrix[] = [];
    const count = kind === "rocks" ? 65 : highQuality ? 100 : 65;
    for (let i = 0; i < count; i++) {
      const x = (rnd() - 0.5) * 115;
      const z = (rnd() - 0.5) * 100;
      const y = landHeight(x, z);
      if (
        y < 0.25 ||
        HOME_POSITIONS.some((p) => Math.hypot(x - p[0], z - p[1]) < 12) ||
        Math.abs(x - (3 + Math.sin(z * 0.075) * 8)) < 2.8
      )
        continue;
      const size = kind === "rocks" ? 1.8 + rnd() * 1.6 : 4.5 + rnd() * 3;
      transforms.push(
        Matrix.Scaling(size, size, size).multiply(
          Matrix.Translation(x, y + 0.03, z),
        ),
      );
    }
    const source = sprites.template(kind);
    if (transforms.length) {
      source.isVisible = true;
      source.thinInstanceAdd(transforms);
      source.thinInstanceRefreshBoundingInfo(true);
      source.freezeWorldMatrix();
    }
    // Sparse flowers below make the silhouette edges sit naturally on the meadow.
    source.metadata = { landscape: k };
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
  const bridgeX = 3 + Math.sin(-21 * 0.075) * 8;
  for (let i = 0; i < 15; i++)
    box(
      "Bridge plank",
      bridgeX - 3.6 + i * 0.48,
      1,
      -21,
      0.43,
      0.2,
      2.4,
      woodLight,
    );
  for (const z of [-22.3, -19.7]) {
    box("Bridge handrail", bridgeX - 0.2, 2, z, 7.6, 0.12, 0.12, wood);
    for (let x = bridgeX - 3.6; x < bridgeX + 3.7; x += 1.8)
      box("Bridge post", x, 1.5, z, 0.17, 1.6, 0.17, wood);
  }
  const mushroom = mat("Mushroom", "#cb7163");
  for (let i = 0; i < 14; i++) {
    const x = -29 + rnd() * 6,
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
  for (let n = 0; n < (highQuality ? 3000 : 900); n++) {
    const x = -50 + rnd() * 100,
      z = -45 + rnd() * 90,
      y = landHeight(x, z);
    if (
      y < 0.2 ||
      Math.abs(x - (3 + Math.sin(z * 0.075) * 8)) < 2.2 ||
      HOME_POSITIONS.some((p) => Math.hypot(x - p[0], z - p[1]) < 5)
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
  closeDetails.push(tuft);
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
  // Worn lanes connect the settlements to the crossing and give the meadow scale.
  const pathMaterial = mat("Old trade road", "#a5a17b");
  pathMaterial.diffuseTexture = villageTexture(scene, "road");
  pathMaterial.diffuseColor = rgb("#eddfb7");
  pathMaterial.specularColor = Color3.Black();
  for (const [homeX, homeZ] of HOME_POSITIONS) {
    const banks: Vector3[][] = [[], []];
    const riverX = 3 + Math.sin(homeZ * 0.075) * 8;
    const destinationX = riverX + (homeX < riverX ? -2.6 : 2.6);
    for (let step = 0; step <= 30; step++) {
      const t = step / 30;
      const x = homeX + (destinationX - homeX) * t;
      const z = homeZ - 8 + Math.sin(t * Math.PI) * 2;
      for (let side = 0; side < 2; side++) {
        const edgeZ = z + (side ? 1 : -1) * (0.38 + Math.sin(t * 16) * 0.06);
        banks[side].push(new Vector3(x, landHeight(x, edgeZ) + 0.035, edgeZ));
      }
    }
    const lane = MeshBuilder.CreateRibbon(
      "Worn lane",
      { pathArray: banks, sideOrientation: Mesh.DOUBLESIDE },
      scene,
    );
    lane.material = pathMaterial;
    lane.receiveShadows = true;
    lane.isPickable = false;
  }

  // Static scenery is batched once. Castle masonry stays individually destructible.
  const sceneryGroups = new Map<StandardMaterial, Mesh[]>();
  for (const mesh of scene.meshes.slice(sceneryStart)) {
    if (
      !(mesh instanceof Mesh) ||
      mesh.thinInstanceCount ||
      !mesh.material ||
      !mesh.isVisible
    )
      continue;
    const material = mesh.material as StandardMaterial;
    const group = sceneryGroups.get(material) ?? [];
    group.push(mesh);
    sceneryGroups.set(material, group);
    shadows.removeShadowCaster(mesh);
  }
  for (const [material, meshes] of sceneryGroups) {
    const merged = Mesh.MergeMeshes(meshes, true, true);
    if (!merged) continue;
    merged.name = `Scenery / ${material.name}`;
    if (flowerMats.includes(material) || material === mushroom)
      closeDetails.push(merged);
    merged.isPickable = false;
    merged.receiveShadows = true;
    merged.freezeWorldMatrix();
    if (material !== pathMaterial) shadows.addShadowCaster(merged);
  }
  terrain.freezeWorldMatrix();
  scene.skipPointerMovePicking = true;

  const banners: {
    mesh: Mesh;
    offset: number;
    rest: number[];
    positions: number[];
  }[] = [];
  const siegeRigs = new Map<
    string,
    { pivot: TransformNode; rest: number; fired: number }
  >();
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
    const m = MeshBuilder.CreateGround(
      "Pennant",
      {
        width: 1.05 * scale,
        height: 0.66 * scale,
        subdivisions: highQuality ? 8 : 4,
        updatable: true,
      },
      scene,
    );
    const cloth = m.getVerticesData(VertexBuffer.PositionKind)!;
    for (let v = 0; v < cloth.length; v += 3) {
      const across = cloth[v] / (1.05 * scale) + 0.5;
      const vertical = cloth[v + 2];
      cloth[v] += 0.525 * scale;
      cloth[v + 1] = -vertical;
      cloth[v + 2] = Math.sin(across * 8) * across * 0.1 * scale;
      if (across > 0.85)
        cloth[v] -= (1 - Math.abs(vertical) / (0.33 * scale)) * 0.22 * scale;
    }
    m.setVerticesData(VertexBuffer.PositionKind, cloth);
    const clothNormals: number[] = [];
    VertexData.ComputeNormals(cloth, m.getIndices()!, clothNormals);
    m.setVerticesData(VertexBuffer.NormalKind, clothNormals);
    m.position.set(x, y + 1.9 * scale, z);
    const bannerMaterial = mat(`Banner${color}`, color);
    bannerMaterial.backFaceCulling = false;
    meshSetup(m, bannerMaterial, parent, false);
    banners.push({
      mesh: m,
      offset: rnd() * 10,
      rest: Array.from(cloth),
      positions: Array.from(cloth),
    });
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
    const group = new TransformNode("Painted timber building", scene);
    group.parent = parent;
    group.position.set(x, 0, z);
    group.scaling.setAll(scale);
    const kind = style === 1 ? "tavern" : style === 2 ? "workshop" : "cottage";
    sprites.place(kind, group, 1.3, 0.02, -1.3, 6.2);
    // A simple invisible volume gives physical rubble something solid to hit.
    const volume = box(
      "Timber building collision",
      0,
      1.6,
      0,
      3.8,
      3.2,
      3.2,
      wood,
      group,
      false,
    );
    volume.isVisible = false;
    volume.metadata = { collider: true };
    life.smoke(group, 0.3, 4.5, 0.9);
    return group;
  }
  const realmLabels = new Map<
    string,
    {
      button: HTMLButtonElement;
      title: HTMLSpanElement;
      health: HTMLSpanElement;
      position: Vector3;
    }
  >();
  const castleRoots = new Map<string, TransformNode>();
  const castleKeys = new Map<string, string>();
  const castleHealth = new Map<string, number>();
  function buildCastle(p: Player, index: number) {
    const parent = new TransformNode(`castle-${p.id}`, scene);
    const pos = positionOf(p, index);
    parent.position.set(pos.x, 0.75, pos.z);
    castleRoots.set(p.id, parent);
    for (const [key, rig] of siegeRigs)
      if (rig.pivot.isDisposed()) siegeRigs.delete(key);
    const manor = p.buildings.keep;
    const team = mat(`Team ${p.color}`, p.color);
    parent.metadata = { player: p.id };
    if (p.plot === null) return;
    const soil = mat("Trodden earth", "#97946d");
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
      sprites.place("keep", parent, 1.8, 0.04, -1.8, manor === 3 ? 11.4 : 10);
      const volume = box(
        "Keep collision",
        0,
        3,
        0,
        6.3,
        6,
        5,
        stone,
        parent,
        false,
      );
      volume.isVisible = false;
      volume.metadata = { collider: true };
      flag(parent, -3.6, 0, -2.6, p.color, 1.1);
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
          cyl("Tower plinth", x, 0.16, z, 2.42, 0.32, stone, parent);
          box(
            "Tower arrow slit",
            x,
            th * 0.64,
            z - 1.06,
            0.14,
            0.65,
            0.035,
            dark,
            parent,
          );
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
    if (manor > 0 && p.hp > 0)
      life.village(parent, p.color, p.buildings.workshop > 0);
    if (p.buildings.tavern) {
      cottage(parent, -7.8, -0.5, 1, 0.75);
      box("Tavern sign", -6.3, 1.7, -2, 0.55, 0.65, 0.08, gold, parent);
    }
    if (p.buildings.workshop) {
      cottage(parent, 6.6, 2, 2, 0.7);
      box("Workbench", 7.2, 0.7, -0.5, 1.8, 0.15, 0.8, wood, parent);
    }
    if (manor > 0) {
      const well = new TransformNode("Village well", scene);
      well.parent = parent;
      well.position.set(3.3, 0, -3.4);
      for (let n = 0; n < 10; n++) {
        const angle = (n * Math.PI) / 5;
        const block = box(
          "Well stone",
          Math.sin(angle) * 0.55,
          0.35,
          Math.cos(angle) * 0.55,
          0.34,
          0.65,
          0.28,
          stone,
          well,
        );
        block.rotation.y = angle;
      }
      for (const x of [-0.65, 0.65])
        box("Well upright", x, 1.1, 0, 0.14, 2.2, 0.14, wood, well);
      const spindle = cyl(
        "Well spindle",
        0,
        1.5,
        0,
        0.13,
        1.45,
        woodLight,
        well,
      );
      spindle.rotation.z = Math.PI / 2;
      box("Well rope", 0.12, 0.93, 0, 0.04, 1.2, 0.04, woodLight, well);
      gable(well, 0, 2.1, 0, 1.85, 0.65, 1.4, clay);
      const garden = new TransformNode("Kitchen garden", scene);
      garden.parent = parent;
      garden.position.set(-8.5, -0.05, 2.7);
      box(
        "Garden soil",
        0,
        0.06,
        0,
        2.5,
        0.12,
        2.5,
        mat("Rich soil", "#795f3e"),
        garden,
        false,
      );
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 4; col++) {
          const cabbage = sphere(
            "Cabbage",
            -0.9 + col * 0.6,
            0.26,
            -0.8 + row * 0.75,
            0.24,
            leaf[2],
            garden,
          );
          cabbage.scaling.y = 0.72;
        }
      for (const x of [-1.4, 1.4]) {
        for (const z of [-1.4, 0, 1.4])
          box("Garden post", x, 0.4, z, 0.12, 0.85, 0.12, woodLight, garden);
        box("Garden rail", x, 0.5, 0, 0.1, 0.12, 2.8, woodLight, garden);
      }
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
        const pivot = new TransformNode("Siege axle", scene);
        pivot.parent = wp;
        pivot.position.y = 2.1;
        pivot.rotation.x = -0.65;
        box("Throwing arm", 0, 0, -0.35, 0.16, 0.16, 3, woodLight, pivot);
        box("Counterweight", 0, -0.45, 1, 0.6, 0.7, 0.5, stone, pivot);
        siegeRigs.set(`${p.id}:${w}`, { pivot, rest: -0.65, fired: -1 });
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
    // Batch rigid decoration while keeping masonry, breakable roof pieces and
    // articulated parts separate. A rebuilt castle must not accumulate draw calls.
    const animated = new Set<Mesh>([
      ...banners.map((b) => b.mesh),
      ...fires.map((f) => f.mesh),
    ]);
    const decorations = new Map<StandardMaterial, Mesh[]>();
    for (const mesh of parent.getChildMeshes()) {
      if (
        !(mesh instanceof Mesh) ||
        !mesh.material ||
        !mesh.isVisible ||
        animated.has(mesh) ||
        (mesh.parent !== parent &&
          !["Timber building", "Village well", "Kitchen garden"].includes(
            mesh.parent?.name ?? "",
          )) ||
        /Shelter|Vertical frame|Roof|Merlon|Tower tooth|Cross frame|Keep side|Side wall|Corner tower|Keep foundation/.test(
          mesh.name,
        )
      )
        continue;
      const material = mesh.material as StandardMaterial;
      const group = decorations.get(material) ?? [];
      group.push(mesh);
      decorations.set(material, group);
    }
    for (const [material, pieces] of decorations) {
      if (pieces.length < 2) continue;
      pieces.forEach((piece) => piece.computeWorldMatrix(true));
      const merged = Mesh.MergeMeshes(pieces, true, true)!;
      merged.name = `Castle detail / ${material.name}`;
      mediumDetails.push(merged);
      merged.setParent(parent);
      merged.receiveShadows = true;
      shadows.addShadowCaster(merged);
      merged.onDisposeObservable.addOnce(() =>
        shadows.removeShadowCaster(merged),
      );
    }
    parent.getChildMeshes().forEach((m) => {
      m.metadata = { ...m.metadata, player: p.id };
    });
    if (p.hp <= 0) {
      parent.scaling.y = 0.22;
      parent.rotation.z = 0.07;
    }
    parent.computeWorldMatrix(true);
    for (const mesh of parent.getChildMeshes()) {
      if (mesh.parent === parent && !animated.has(mesh as Mesh)) {
        mesh.freezeWorldMatrix();
        mesh.doNotSyncBoundingInfo = true;
      }
    }
    shadowMap.resetRefreshCounter();
  }
  const heroRig = life.character("Borg Meister", "#b77840", true);
  const hero = heroRig.root;
  hero.scaling.setAll(1.3);
  let heroSpeed = 0;
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
  let first = true;
  let landingTime = reduceMotion ? 2 : 0;
  let heroTarget = new Vector3(-17, 0.8, -12);
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
    const index = Math.max(
      0,
      g.players.findIndex((p) => p.id === myId),
    );
    const mine = g.players[index];
    for (const [id, label] of realmLabels) {
      if (!g.players.some((p) => p.id === id && p.plot !== null)) {
        label.button.remove();
        realmLabels.delete(id);
      }
    }
    g.players.forEach((p, i) => {
      if (p.plot === null) return;
      let label = realmLabels.get(p.id);
      if (!label) {
        const button = document.createElement("button");
        button.className = "realm-landmark";
        const title = document.createElement("span");
        const track = document.createElement("span");
        track.className = "landmark-track";
        const health = document.createElement("span");
        track.appendChild(health);
        button.appendChild(title);
        button.appendChild(track);
        button.addEventListener("click", () =>
          propsRef.current.onSelectPlayer(p.id),
        );
        landmarks.appendChild(button);
        label = { button, title, health, position: Vector3.Zero() };
        realmLabels.set(p.id, label);
      }
      const pos = positionOf(p, i);
      label.position.set(pos.x, 4 + p.buildings.keep * 2, pos.z);
      label.title.textContent = p.castle;
      label.button.setAttribute(
        "aria-label",
        `${p.castle}, ${p.hp} of ${p.maxHp} health. Focus stronghold`,
      );
      label.button.style.setProperty("--team-color", p.color);
      label.health.style.width = `${Math.max(0, (p.hp / p.maxHp) * 100)}%`;
    });
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
    // Rebuilds dispose old castle props; prune their animation handles immediately.
    for (let i = banners.length - 1; i >= 0; i--)
      if (banners[i].mesh.isDisposed()) banners.splice(i, 1);
    for (let i = fires.length - 1; i >= 0; i--)
      if (fires[i].mesh.isDisposed()) fires.splice(i, 1);
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
      view.focus(new Vector3(base[0] + 1, 1.7, base[1]), true);
    }
    if (!settling) {
      const pos = positionOf(mine, index);
      heroTarget = new Vector3(pos.x - 2, 0.8, pos.z - 2);
    }
  }
  function command(c: WorldCommand) {
    if (battleState) return;
    if (c.kind === "zoom-in") view.zoom(1 / 1.25);
    else if (c.kind === "zoom-out") view.zoom(1.25);
    else if (c.kind === "realm") {
      view.frame(
        data.players.map((p, i) => ({ ...positionOf(p, i), y: 3 })),
        14,
        true,
      );
    } else {
      const idx = Math.max(
        0,
        data.players.findIndex((p) => p.id === (c.id ?? me)),
      );
      const pos = positionOf(data.players[idx], idx);
      view.focus({ ...pos, y: 2 });
    }
  }
  function attack(b: Battle | null) {
    if (battleState) {
      battleState.projectile.dispose();
      battleState = null;
    }
    if (!b) {
      view.lock(false);
      return;
    }
    const f = data.players.findIndex((p) => p.id === b.from),
      t = data.players.findIndex((p) => p.id === b.to);
    if (f < 0 || t < 0) {
      view.lock(false);
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
    view.lock(true);
    const apex = Vector3.Center(start, end).add(new Vector3(0, 14.2, 0));
    view.frame([start, end, apex], 10);
    const siegeRig = siegeRigs.get(`${b.from}:${b.weapon}`);
    if (siegeRig) siegeRig.fired = 0;
  }
  function selectAt(clientX: number, clientY: number) {
    if (battleState) return;
    const rect = canvas.getBoundingClientRect();
    const picked = scene.pick(clientX - rect.left, clientY - rect.top);
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
  }
  const resize = () => {
    resizeResolution();
    engine.resize();
    view.resize();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  let time = 0;
  let disposed = false;
  let weatherBlend = 0;
  let labelTick = 0;
  let diagnosticTick = 0;
  const projectionIdentity = Matrix.Identity();
  engine.runRenderLoop(() => {
    if (document.hidden) return;
    const dt = Math.min(0.05, engine.getDeltaTime() / 1000);
    if (!reduceMotion) time += dt;
    landingTime += dt;
    weatherBlend +=
      ((data.weather === 2 ? 1 : 0) - weatherBlend) * Math.min(1, dt * 0.6);
    waterMaterial.setFloat("time", time);
    waterMaterial.setFloat("rain", weatherBlend);
    waterMaterial.setVector3("eye", camera.globalPosition);
    sun.intensity = 1.2 - weatherBlend * 0.75;
    scene.fogDensity = 0.0012 + weatherBlend * 0.0018;

    view.update(dt);
    lod = detailLevel(canvas.clientHeight / view.span, lod);
    life.setView(
      lod,
      camera.target,
      view.span,
      canvas.clientWidth / Math.max(1, canvas.clientHeight),
    );
    for (const [meshes, visible] of [
      [closeDetails, lod === "near"],
      [mediumDetails, lod !== "far"],
    ] as const) {
      for (let i = meshes.length - 1; i >= 0; i--) {
        if (meshes[i].isDisposed()) meshes.splice(i, 1);
        else meshes[i].setEnabled(visible);
      }
    }
    let landingSquash = 0;
    if (landingTime < 1.65) {
      hero.position.y = 0.8 + Math.max(0, 24 - 16 * landingTime * landingTime);
      hero.rotation.y = time * 3;
      landingSquash = Math.max(0, 1 - Math.abs(landingTime - 1.28) / 0.24);
    } else {
      const delta = heroTarget.subtract(hero.position);
      delta.y = 0;
      const distance = delta.length();
      const desiredSpeed = distance > 0.05 ? Math.min(4, distance * 5) : 0;
      heroSpeed += (desiredSpeed - heroSpeed) * Math.min(1, dt * 9);
      if (distance > 0.02) {
        const yaw = Math.atan2(-delta.x, -delta.z);
        const difference = Math.atan2(
          Math.sin(yaw - hero.rotation.y),
          Math.cos(yaw - hero.rotation.y),
        );
        hero.rotation.y += difference * Math.min(1, dt * 9);
        hero.position.addInPlace(
          delta.scale(Math.min(distance, dt * heroSpeed) / distance),
        );
      }
      hero.position.y = 0.8;
    }
    heroRig.tick(time, dt, heroSpeed / 1.3, landingSquash);
    life.update(time, dt, reduceMotion);
    siegeRigs.forEach((rig) => {
      if (rig.fired < 0 || rig.pivot.isDisposed()) return;
      rig.fired += dt;
      const t = rig.fired;
      const release = Math.min(1, t / 0.24);
      const returnToRest = Math.max(0, Math.min(1, (t - 0.7) / 1.5));
      rig.pivot.rotation.x =
        rig.rest + Math.sin((release * Math.PI) / 2) * 1.8 * (1 - returnToRest);
      if (t > 2.2) {
        rig.fired = -1;
        rig.pivot.rotation.x = rig.rest;
      }
    });
    banners.forEach((b) => {
      if (b.mesh.isDisposed()) return;
      if (lod === "far" || reduceMotion) return;
      for (let i = 0; i < b.positions.length; i += 3) {
        const distance = b.rest[i];
        b.positions[i + 2] =
          b.rest[i + 2] +
          Math.sin(distance * 6 - time * 3.5 + b.offset) * distance * 0.14;
      }
      b.mesh.updateVerticesData(VertexBuffer.PositionKind, b.positions);
    });
    fires.forEach((f) => {
      if (!f.mesh.isDisposed()) {
        f.mesh.scaling.y = 1.5 + Math.sin(time * 17 + f.base) * 0.3;
        f.mesh.scaling.x = 0.85 + Math.sin(time * 11) * 0.1;
      }
    });
    fireflies.forEach((m, n) => {
      m.setEnabled(lod === "near");
      if (lod !== "near") return;
      m.position.y += Math.sin(time + n) * (reduceMotion ? 0 : dt) * 0.12;
      m.position.x += Math.sin(time * 0.7 + n) * (reduceMotion ? 0 : dt) * 0.18;
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
      if (progress > 0.65 && !b.hit) {
        // Follow the impact only after the whole flight has been readable.
        if (b.time - dt <= 3.4 * 0.65) view.focus(b.end);
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
        view.lock(false);
        propsRef.current.onBattleEnd();
      }
    }
    for (let i = impactWaves.length - 1; i >= 0; i--) {
      const wave = impactWaves[i];
      wave.age += dt;
      wave.mesh.scaling.setAll(1 + wave.age * 12);
      wave.material.alpha = Math.max(0, 0.65 * (1 - wave.age / 0.8));
      if (wave.age > 0.8) {
        wave.mesh.dispose();
        wave.material.dispose();
        impactWaves.splice(i, 1);
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
        r.aggregate = null;
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
    scene.physicsEnabled = physicalRubble.some((r) => r.aggregate !== null);
    const active =
      highQuality ||
      battleState !== null ||
      scene.physicsEnabled ||
      view.moving;
    engine.maxFPS = active ? 60 : 30;
    shadowMap.refreshRate = highQuality || scene.physicsEnabled ? 1 : 4;
    scene.render();
    labelTick += dt;
    diagnosticTick += dt;
    if (labelTick > 0.05) {
      labelTick = 0;
      const viewport = camera.viewport.toGlobal(
        canvas.clientWidth,
        canvas.clientHeight,
      );
      for (const label of realmLabels.values()) {
        const screen = Vector3.Project(
          label.position,
          projectionIdentity,
          scene.getTransformMatrix(),
          viewport,
        );
        const visible =
          !battleState &&
          (view.overview || view.span > 52) &&
          screen.z > 0 &&
          screen.z < 1 &&
          screen.x > 30 &&
          screen.x < canvas.clientWidth - 30 &&
          screen.y > 35 &&
          screen.y < canvas.clientHeight - 25;
        label.button.hidden = !visible;
        if (visible)
          label.button.style.transform = `translate(${screen.x}px, ${screen.y}px) translate(-50%, -100%)`;
      }
    }
    if (diagnosticTick > 1) {
      diagnosticTick = 0;
      canvas.dataset.cameraTarget = `${camera.target.x.toFixed(2)},${camera.target.z.toFixed(2)}`;
      canvas.dataset.cameraAngles = `${camera.alpha.toFixed(4)},${camera.beta.toFixed(4)}`;
      canvas.dataset.frameBudget = String(engine.maxFPS);
      canvas.dataset.fps = String(Math.round(engine.getFps()));
      canvas.dataset.activeMeshes = String(scene.getActiveMeshes().length);
      canvas.dataset.quality = highQuality ? "high" : "low";
      canvas.dataset.lod = lod;
      canvas.dataset.characters = "sprites";
    }
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
      landmarks.replaceChildren();
      view.dispose();
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
  const landmarks = useRef<HTMLDivElement>(null);
  const runtime = useRef<Runtime | null>(null);
  const propsRef = useRef(props);
  useEffect(() => {
    propsRef.current = props;
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!canvas.current || !landmarks.current) return;
    let active = true;
    try {
      runtime.current = createWorld(
        canvas.current,
        propsRef,
        landmarks.current,
        () => setLoaded(true),
      );
    } catch (e) {
      console.error("3D world failed", e);
      queueMicrotask(() => {
        if (active) setError(true);
      });
    }
    return () => {
      active = false;
      runtime.current?.dispose();
      runtime.current = null;
    };
  }, []);
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
        aria-label="Interactive isometric kingdom. Drag or use arrow keys to pan, pinch or scroll to zoom; tap clearings or rival castles. Camera buttons are also available."
        tabIndex={0}
      />
      <div
        ref={landmarks}
        className="realm-landmarks"
        aria-label="Strongholds on the realm map"
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
