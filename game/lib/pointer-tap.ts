// A camera drag or pinch must never also select a clearing on release.
export function createTapTracker(threshold = 7) {
  const pointers = new Map<number, { x: number; y: number }>();
  let cancelled = false;
  const move = (id: number, x: number, y: number) => {
    const start = pointers.get(id);
    if (start && Math.hypot(x - start.x, y - start.y) > threshold)
      cancelled = true;
  };
  return {
    down(id: number, x: number, y: number) {
      if (!pointers.size) cancelled = false;
      pointers.set(id, { x, y });
      if (pointers.size > 1) cancelled = true;
    },
    move,
    up(id: number, x: number, y: number) {
      move(id, x, y);
      const tap = pointers.has(id) && pointers.size === 1 && !cancelled;
      pointers.delete(id);
      return tap;
    },
    cancel(id: number) {
      cancelled = true;
      pointers.delete(id);
    },
    reset() {
      pointers.clear();
      cancelled = true;
    },
  };
}
