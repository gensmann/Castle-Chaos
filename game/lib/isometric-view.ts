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

export type DetailLevel = "near" | "middle" | "far";

/** Orthographic distance does not change apparent size; zoom and viewport do. */
export function detailLevel(
  pixelsPerUnit: number,
  previous: DetailLevel,
): DetailLevel {
  if (previous === "near" && pixelsPerUnit >= 12) return "near";
  if (previous === "far" && pixelsPerUnit <= 8) return "far";
  return pixelsPerUnit >= 15 ? "near" : pixelsPerUnit <= 6 ? "far" : "middle";
}

export function inIsometricView(
  point: MapPoint,
  target: MapPoint,
  span: number,
  aspect: number,
  margin = 4,
) {
  const p = projectIsometric(point);
  const center = projectIsometric(target);
  return (
    Math.abs(p.x - center.x) < (span * aspect) / 2 + margin &&
    Math.abs(p.y - center.y) < span / 2 + margin
  );
}
