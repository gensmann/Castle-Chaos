import { Scene } from "@babylonjs/core/scene";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

const vertexSource = `
precision highp float;
attribute vec3 position;
uniform mat4 world;
uniform mat4 worldViewProjection;
varying vec3 vPosition;
void main() {
  vPosition = (world * vec4(position, 1.0)).xyz;
  gl_Position = worldViewProjection * vec4(position, 1.0);
}`;

/** Analytic ripples and sky reflection: no reflection camera or render target. */
export function createWaterMaterial(scene: Scene) {
  const material = new ShaderMaterial(
    "Sunlit water",
    scene,
    {
      vertexSource,
      fragmentSource: `
precision highp float;
varying vec3 vPosition;
uniform float time;
uniform float rain;
uniform vec3 eye;
void main() {
  vec2 p = vPosition.xz;
  float a = p.x * 1.7 + p.y * 0.65 + time * 1.3;
  float b = p.x * -0.8 + p.y * 2.4 - time * 0.9;
  vec3 normal = normalize(vec3(cos(a) * 0.055 + cos(b) * 0.025, 1.0,
                              cos(a) * 0.023 + cos(b) * 0.075));
  vec3 view = normalize(vec3(1.0, 1.0, -1.0));
  float fresnel = pow(1.0 - max(0.0, dot(normal, view)), 3.0);
  vec3 water = mix(vec3(0.12, 0.36, 0.36), vec3(0.49, 0.71, 0.67), fresnel);
  float broad = sin(p.x * 0.14 + p.y * 0.18 + time * 0.12) * 0.5 + 0.5;
  water += broad * vec3(0.04, 0.085, 0.065);
  vec3 halfway = normalize(view + normalize(vec3(0.6, 1.0, -0.45)));
  float sun = pow(max(dot(normal, halfway), 0.0), 240.0);
  float ripple = pow(max(0.0, sin(a) * sin(b)), 14.0);
  water += (sun * 0.6 + ripple * 0.075) * vec3(1.0, 0.91, 0.66);
  float distanceFog = 1.0 - exp(-length(eye - vPosition) * 0.0008);
  water = mix(water, vec3(0.64, 0.75, 0.71), distanceFog);
  gl_FragColor = vec4(mix(water, water * vec3(0.81, 0.89, 0.99), rain * 0.5), 1.0);
}`,
    },
    {
      attributes: ["position"],
      uniforms: ["world", "worldViewProjection", "time", "rain", "eye"],
    },
  );
  material.setFloat("time", 0);
  material.setFloat("rain", 0);
  material.setVector3("eye", Vector3.Zero());
  material.backFaceCulling = false;
  return material;
}

/** Painted atmospheric backdrop, evaluated in a single draw call. */
export function createSky(scene: Scene) {
  const sky = MeshBuilder.CreateSphere(
    "Bramblelands sky",
    {
      diameter: 540,
      segments: 16,
      sideOrientation: Mesh.BACKSIDE,
    },
    scene,
  );
  const material = new ShaderMaterial(
    "Honey and blue sky",
    scene,
    {
      vertexSource,
      fragmentSource: `
precision highp float;
varying vec3 vPosition;
uniform float time;
uniform float rain;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1,0)), f.x),
             mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void main() {
  vec3 ray = normalize(vPosition);
  float height = max(0.0, ray.y);
  vec3 color = mix(vec3(0.88, 0.83, 0.66), vec3(0.33, 0.58, 0.66), pow(height, 0.6));
  vec2 p = ray.xz / max(0.14, ray.y + 0.2) * 2.5 + vec2(time * 0.003, 0.0);
  float clouds = noise(p) * 0.6 + noise(p * 2.1) * 0.27 + noise(p * 4.3) * 0.13;
  float cover = smoothstep(0.49, 0.72, clouds) * smoothstep(0.02, 0.2, height);
  color = mix(color, vec3(0.97, 0.91, 0.76), cover * 0.74);
  float sun = pow(max(dot(ray, normalize(vec3(0.6, 0.55, -0.45))), 0.0), 90.0);
  color += sun * vec3(0.2, 0.15, 0.07);
  color = mix(color, vec3(0.47, 0.57, 0.59), rain * 0.55);
  gl_FragColor = vec4(color, 1.0);
}`,
    },
    {
      attributes: ["position"],
      uniforms: ["world", "worldViewProjection", "time", "rain"],
    },
  );
  material.setFloat("time", 0);
  material.setFloat("rain", 0);
  material.disableDepthWrite = true;
  sky.material = material;
  sky.isPickable = false;
  sky.infiniteDistance = true;
  sky.freezeWorldMatrix();
  return material;
}
