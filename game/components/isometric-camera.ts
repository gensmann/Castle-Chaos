import { createTapTracker } from "@/lib/pointer-tap";
import {
  fitIsometric,
  projectIsometric,
  isometricDrag,
  type MapPoint,
} from "@/lib/isometric-view";

/** Renderer-independent isometric pan, framing and anchored zoom. */
export function createIsometricCamera(
  canvas: HTMLCanvasElement,
  reducedMotion: boolean,
  onTap: (x: number, y: number) => void,
  onViewChange: (overview: boolean) => void,
) {
  const camera = { target: { x: -17, y: 0, z: -12 } };
  let span = 32;
  let spanGoal = span;
  let targetGoal: MapPoint | null = null;
  let overview = false;
  let locked = false;
  let framing: { points: MapPoint[]; margin: number } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  const taps = createTapTracker();
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const minimumSpan = () => Math.max(18, 24 / aspect());
  const maximumSpan = () => Math.max(135, 145 / aspect());
  const clampSpan = (value: number) =>
    Math.max(minimumSpan(), Math.min(maximumSpan(), value));
  const setOverview = (value: boolean) => {
    if (overview === value) return;
    overview = value;
    onViewChange(value);
  };
  const projection = () => {
    canvas.dataset.projection = "isometric";
    canvas.dataset.viewSpan = span.toFixed(2);
  };
  const stopTransition = () => {
    targetGoal = null;
    spanGoal = span;
    framing = null;
  };
  const pan = (dx: number, dy: number) => {
    const delta = isometricDrag(
      dx,
      dy,
      span / Math.max(1, canvas.clientHeight),
    );
    camera.target.x = Math.max(-65, Math.min(65, camera.target.x + delta.x));
    camera.target.z = Math.max(-62, Math.min(62, camera.target.z + delta.z));
  };
  const zoomAt = (factor: number, x: number, y: number) => {
    const oldSpan = span;
    span = spanGoal = clampSpan(span * factor);
    // Keep the point under the fingers/cursor still while changing scale.
    const rect = canvas.getBoundingClientRect();
    const shift = isometricDrag(
      x - rect.left - rect.width / 2,
      y - rect.top - rect.height / 2,
      (span - oldSpan) / Math.max(1, rect.height),
    );
    camera.target.x = Math.max(-65, Math.min(65, camera.target.x + shift.x));
    camera.target.z = Math.max(-62, Math.min(62, camera.target.z + shift.z));
    projection();
  };
  const down = (e: PointerEvent) => {
    if (locked || (e.pointerType === "mouse" && e.button !== 0)) return;
    stopTransition();
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    taps.down(e.pointerId, e.clientX, e.clientY);
    canvas.setPointerCapture(e.pointerId);
    canvas.dataset.dragging = "true";
  };
  const move = (e: PointerEvent) => {
    const previous = pointers.get(e.pointerId);
    if (!previous || locked) return;
    taps.move(e.pointerId, e.clientX, e.clientY);
    const other = [...pointers.entries()].find(
      ([id]) => id !== e.pointerId,
    )?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(e.clientX - other.x, e.clientY - other.y);
      if (before > 8 && after > 8)
        zoomAt(
          before / after,
          (previous.x + other.x) / 2,
          (previous.y + other.y) / 2,
        );
      pan((e.clientX - previous.x) / 2, (e.clientY - previous.y) / 2);
    } else {
      pan(e.clientX - previous.x, e.clientY - previous.y);
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  };
  const up = (e: PointerEvent) => {
    const tap = taps.up(e.pointerId, e.clientX, e.clientY);
    pointers.delete(e.pointerId);
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (!pointers.size) delete canvas.dataset.dragging;
    if (tap && !locked) onTap(e.clientX, e.clientY);
  };
  const cancel = (e: PointerEvent) => {
    taps.cancel(e.pointerId);
    pointers.delete(e.pointerId);
    if (!pointers.size) delete canvas.dataset.dragging;
  };
  const reset = () => {
    for (const id of pointers.keys())
      if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
    pointers.clear();
    taps.reset();
    delete canvas.dataset.dragging;
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    if (locked) return;
    stopTransition();
    const delta =
      e.deltaY *
      (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1);
    zoomAt(
      Math.exp(Math.max(-0.35, Math.min(0.35, delta * 0.0015))),
      e.clientX,
      e.clientY,
    );
  };
  const key = (e: KeyboardEvent) => {
    if (locked || e.metaKey || e.ctrlKey || e.altKey) return;
    const directions: Record<string, [number, number]> = {
      ArrowLeft: [45, 0],
      ArrowRight: [-45, 0],
      ArrowUp: [0, 45],
      ArrowDown: [0, -45],
    };
    if (directions[e.key]) {
      e.preventDefault();
      stopTransition();
      pan(...directions[e.key]);
    } else if (["+", "=", "-"].includes(e.key)) {
      e.preventDefault();
      stopTransition();
      spanGoal = clampSpan(span * (e.key === "-" ? 1.2 : 1 / 1.2));
    }
  };
  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("lostpointercapture", cancel);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("keydown", key);
  window.addEventListener("blur", reset);
  const frame = (points: MapPoint[], margin: number, immediate = false) => {
    framing = { points, margin };
    const fit = fitIsometric(points, aspect(), margin);
    targetGoal = { x: fit.x, y: 0, z: fit.z };
    spanGoal = clampSpan(fit.span);
    if (immediate || reducedMotion) {
      Object.assign(camera.target, targetGoal);
      targetGoal = null;
      span = spanGoal;
      projection();
    }
  };
  projection();
  onViewChange(false);
  return {
    camera,
    screen(point: MapPoint) {
      const p = projectIsometric(point),
        center = projectIsometric(camera.target);
      const scale = canvas.clientHeight / span;
      return {
        x: canvas.clientWidth / 2 + (p.x - center.x) * scale,
        y: canvas.clientHeight / 2 - (p.y - center.y) * scale,
      };
    },
    ground(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect();
      const offset = isometricDrag(
        clientX - rect.left - rect.width / 2,
        clientY - rect.top - rect.height / 2,
        span / Math.max(1, rect.height),
      );
      return {
        x: camera.target.x - offset.x,
        y: 0,
        z: camera.target.z - offset.z,
      };
    },
    get moving() {
      return (
        pointers.size > 0 ||
        targetGoal !== null ||
        Math.abs(spanGoal - span) > 0.05
      );
    },
    get span() {
      return span;
    },
    get overview() {
      return overview;
    },
    focus(point: MapPoint, immediate = false) {
      setOverview(false);
      frame([point], 15, immediate);
    },
    frame(points: MapPoint[], margin = 10, isOverview = false) {
      setOverview(isOverview);
      frame(points, margin);
    },
    zoom(factor: number) {
      if (locked) return;
      framing = null;
      spanGoal = clampSpan(spanGoal * factor);
    },
    lock(value: boolean) {
      locked = value;
      if (value) reset();
    },
    update(dt: number) {
      const blend = reducedMotion ? 1 : 1 - Math.exp(-dt * 7);
      if (targetGoal) {
        camera.target.x += (targetGoal.x - camera.target.x) * blend;
        camera.target.z += (targetGoal.z - camera.target.z) * blend;
        if (
          Math.hypot(
            camera.target.x - targetGoal.x,
            camera.target.z - targetGoal.z,
          ) < 0.01
        ) {
          Object.assign(camera.target, targetGoal);
          targetGoal = null;
        }
      }
      if (Math.abs(spanGoal - span) > 0.005) {
        span += (spanGoal - span) * blend;
        projection();
      }
    },
    resize() {
      if (framing) frame(framing.points, framing.margin, true);
      span = clampSpan(span);
      spanGoal = clampSpan(spanGoal);
      projection();
    },
    dispose() {
      reset();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("lostpointercapture", cancel);
      canvas.removeEventListener("wheel", wheel);
      canvas.removeEventListener("keydown", key);
      window.removeEventListener("blur", reset);
    },
  };
}
