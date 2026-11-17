// SOLMARIS — small shared helpers: seeded randomness, math, collision tests.
// No imports: every other module may depend on this one.

/** Deterministic RNG (mulberry32) so the city layout is the same every load. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Read a query parameter (?shot=chase&seed=1) from the page URL. */
export function queryParam(name, fallback) {
  try {
    const value = new URLSearchParams(window.location.search).get(name);
    return value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Frame-rate independent exponential smoothing toward a target. */
export function damp(current, target, rate, dt) {
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}

/** Shortest-arc interpolation between two headings (radians). */
export function dampAngle(current, target, rate, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-rate * dt));
}

/** Smallest signed difference between two headings. */
export function angleDiff(a, b) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

export function intRange(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** 2D distance on the ground plane. */
export function dist2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

/**
 * Push a circle (x, z, radius) out of an axis-aligned box. Returns the corrected
 * position, or null when there is no overlap. Used for players, cars and peds
 * against buildings, so nobody ever walks through a wall.
 */
export function circleVsBox(x, z, radius, box) {
  const nx = clamp(x, box.minX, box.maxX);
  const nz = clamp(z, box.minZ, box.maxZ);
  const dx = x - nx;
  const dz = z - nz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return null;
  if (d2 > 0.000001) {
    const d = Math.sqrt(d2);
    return { x: nx + (dx / d) * radius, z: nz + (dz / d) * radius, nx: dx / d, nz: dz / d };
  }
  // Centre inside the box: shove out along the smallest penetration axis.
  const pushLeft = x - box.minX + radius;
  const pushRight = box.maxX - x + radius;
  const pushBack = z - box.minZ + radius;
  const pushFront = box.maxZ - z + radius;
  const min = Math.min(pushLeft, pushRight, pushBack, pushFront);
  if (min === pushLeft) return { x: box.minX - radius, z, nx: -1, nz: 0 };
  if (min === pushRight) return { x: box.maxX + radius, z, nx: 1, nz: 0 };
  if (min === pushBack) return { x, z: box.minZ - radius, nx: 0, nz: -1 };
  return { x, z: box.maxZ + radius, nx: 0, nz: 1 };
}

/**
 * Does the segment (ax,az)->(bx,bz) cross any box in the list? Line-of-sight
 * test for enemy shooting and for the wanted "hiding" check.
 */
export function segmentBlocked(ax, az, bx, bz, boxes) {
  for (let i = 0; i < boxes.length; i += 1) {
    const box = boxes[i];
    if (segmentHitsBox(ax, az, bx, bz, box)) return true;
  }
  return false;
}

function segmentHitsBox(ax, az, bx, bz, box) {
  // Slab test in 2D.
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0;
  let tMax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (ax < box.minX || ax > box.maxX) return false;
  } else {
    let t1 = (box.minX - ax) / dx;
    let t2 = (box.maxX - ax) / dx;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (az < box.minZ || az > box.maxZ) return false;
  } else {
    let t1 = (box.minZ - az) / dz;
    let t2 = (box.maxZ - az) / dz;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

/** Format game minutes as a clock: 610 -> "10:10". */
export function clockString(minutes) {
  const total = Math.floor(minutes) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Format money the way the HUD shows it: 1500 -> "$1,500". */
export function moneyString(amount) {
  return `$${Math.floor(amount).toLocaleString('en-US')}`;
}
