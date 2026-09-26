/** Isometric basis: 45° azimuth, 35.264° elevation, with no perspective. */
export const ISO_ALPHA = -Math.PI / 4;
export const ISO_BETA = Math.acos(1 / Math.sqrt(3));
const diagonal = Math.SQRT1_2;
const elevation = 1 / Math.sqrt(3);

export type MapPoint = { x: number; y: number; z: number };

export function projectIsometric(p: MapPoint) {
  return {
    x: (p.x + p.z) * diagonal,
    y: (-p.x + p.z) * diagonal * elevation + p.y * Math.sqrt(2 / 3),
  };
}

/** Ground displacement for a screen-space drag, independent of pixel density. */
export function isometricDrag(dx: number, dy: number, unitsPerPixel: number) {
  return {
    x: (-dx - dy / elevation) * diagonal * unitsPerPixel,
    z: (-dx + dy / elevation) * diagonal * unitsPerPixel,
  };
}

export function fitIsometric(points: MapPoint[], aspect: number, margin = 8) {
  const projected = points.map(projectIsometric);
  const minX = Math.min(...projected.map((p) => p.x)) - margin;
  const maxX = Math.max(...projected.map((p) => p.x)) + margin;
  const minY = Math.min(...projected.map((p) => p.y)) - margin;
  const maxY = Math.max(...projected.map((p) => p.y)) + margin;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return {
    x: (cx - cy / elevation) * diagonal,
    z: (cx + cy / elevation) * diagonal,
    span: Math.max(maxY - minY, (maxX - minX) / Math.max(0.1, aspect)),
  };
}
