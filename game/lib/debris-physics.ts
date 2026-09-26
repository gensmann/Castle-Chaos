/** Small fixed-step 2.5D debris simulation, independent of rendering and game rules. */
export type DebrisBody = {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  age: number;
  sleeping: boolean;
};
export type Obstacle = {
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  height: number;
};
export function stepDebris(
  bodies: DebrisBody[],
  walls: Obstacle[],
  dt: number,
) {
  for (const b of bodies) {
    if (b.sleeping) continue;
    b.age += dt;
    const oldY = b.y;
    b.vy -= 9.81 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    let floor = b.radius;
    for (const wall of walls) {
      const dx = b.x - wall.x,
        dz = b.z - wall.z;
      const overlapX = wall.halfX + b.radius - Math.abs(dx);
      const overlapZ = wall.halfZ + b.radius - Math.abs(dz);
      if (overlapX <= 0 || overlapZ <= 0) continue;
      if (oldY - b.radius >= wall.height - 0.03) {
        floor = Math.max(floor, wall.height + b.radius);
      } else if (b.y - b.radius < wall.height) {
        if (overlapX < overlapZ) {
          b.x += (dx < 0 ? -1 : 1) * overlapX;
          b.vx *= -0.38;
        } else {
          b.z += (dz < 0 ? -1 : 1) * overlapZ;
          b.vz *= -0.38;
        }
      }
    }
    if (b.y < floor) {
      b.y = floor;
      b.vy = Math.abs(b.vy) > 0.65 ? Math.abs(b.vy) * 0.34 : 0;
      b.vx *= 0.78;
      b.vz *= 0.78;
      if (Math.hypot(b.vx, b.vy, b.vz) < 0.14) b.sleeping = true;
    }
    if (b.age > 10) {
      b.sleeping = true;
      b.vx = b.vy = b.vz = 0;
    }
  }
  // Cheap equal-mass contacts keep flying pieces from passing straight through one another.
  for (let i = 0; i < bodies.length; i++)
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i],
        b = bodies[j];
      if (a.age > 10 || b.age > 10) continue;
      if (a.sleeping && b.sleeping) continue;
      const dx = b.x - a.x,
        dy = b.y - a.y,
        dz = b.z - a.z;
      const distance = Math.hypot(dx, dy, dz),
        radius = a.radius + b.radius;
      if (distance >= radius || distance < 0.0001) continue;
      const nx = dx / distance,
        ny = dy / distance,
        nz = dz / distance;
      const correction = (radius - distance) * 0.5;
      a.x -= nx * correction;
      a.y = Math.max(a.radius, a.y - ny * correction);
      a.z -= nz * correction;
      b.x += nx * correction;
      b.y = Math.max(b.radius, b.y + ny * correction);
      b.z += nz * correction;
      const closing =
        (b.vx - a.vx) * nx + (b.vy - a.vy) * ny + (b.vz - a.vz) * nz;
      if (closing < 0) {
        const impulse = -closing * 0.65;
        a.vx -= impulse * nx;
        a.vy -= impulse * ny;
        a.vz -= impulse * nz;
        b.vx += impulse * nx;
        b.vy += impulse * ny;
        b.vz += impulse * nz;
        if (impulse > 0.2) {
          a.sleeping = false;
          b.sleeping = false;
        }
      }
    }
}
