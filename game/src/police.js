// SOLMARIS — the wanted system and the police who answer it. Stars rise when
// the player steals, hits or shoots in public; police cars roll in along the
// street grid, hunt the player down, and try to box them in. Break line of
// sight, stay hidden, and the heat cools off. Sit still next to a cop and
// you get busted.
import { WANTED, ROAD_LINES, CITY_HALF, PALETTE } from './config.js';
import { clamp, dist2D, angleDiff, segmentBlocked, pick, range } from './utils.js';
import { updateSiren } from './audio.js';

// Solmaris PD callsigns — every pursuit unit gets a name, so the dispatch
// panel reads like a real response instead of a number.
const CALLSIGNS = ['VIPER-7', 'COBRA-3', 'HAWK-9', 'SHARK-2', 'WOLF-5', 'FALCON-12', 'RAVEN-4', 'TIGER-8'];
const HELI_CALLSIGN = 'AIR-1';

export function createPolice(scene, vehicles, city, effects, rng) {
  const policeCars = [];
  const roadblocks = []; // police cars parked across the road ahead (3+ stars)
  let roadblockX = 0;
  let roadblockZ = 0;
  let wanted = 0;
  let hideTimer = 0;
  let decayTimer = 0;
  let bustedTimer = 0;
  let hiding = false;
  let pathTimer = 0;
  let callsignCursor = 0;

  function nextCallsign() {
    const name = CALLSIGNS[callsignCursor % CALLSIGNS.length];
    callsignCursor += 1;
    return name;
  }

  function spawnPoliceCar(px, pz) {
    // Pick a road point 60-100 units from the player, on an actual street.
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    let along;
    let x;
    let z;
    let tries = 0;
    do {
      along = range(rng, -CITY_HALF, CITY_HALF);
      x = axis === 'x' ? along : line;
      z = axis === 'x' ? line : along;
      tries += 1;
    } while (tries < 25 && (dist2D(x, z, px, pz) < 55 || dist2D(x, z, px, pz) > 110));
    const car = vehicles.makeCar('police', 0xf0f0f0, x, z, rng() * Math.PI * 2, 'police');
    car.cruise = 0;
    car.path = [];
    car.pathIndex = 0;
    car.stuckTimer = 0;
    car.repathAt = 0;
    car.callSign = nextCallsign();
    policeCars.push(car);
    return car;
  }

  /** Manhattan path over intersections: police drive the streets, not through blocks. */
  function computePath(car, tx, tz) {
    const from = city.nearestIntersection(car.x, car.z);
    const to = city.nearestIntersection(tx, tz);
    const path = [{ x: from.x, z: from.z }];
    if (from.x !== to.x) path.push({ x: to.x, z: from.z });
    if (from.z !== to.z) path.push({ x: to.x, z: to.z });
    path.push({ x: tx, z: tz });
    car.path = path;
    car.pathIndex = 0;
  }

  function steerToward(car, tx, tz, dt, throttle) {
    const desired = Math.atan2(tx - car.x, -(tz - car.z));
    const diff = angleDiff(car.heading, desired);
    const steer = clamp(diff * 2.4, -1, 1);
    vehicles.drive(car, throttle, steer, dt, false);
    const impact = vehicles.collideBuildings(car);
    if (impact > 6) {
      effects.sparks(car.x, 1, car.z, 6);
      vehicles.damageCar(car, impact * 0.8, car.x, car.z, null);
    }
  }

  /** Two units parked sideways across the road ahead of the player. */
  function buildRoadblock(px, pz, heading) {
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    let ahead = 55;
    let bx = px + fx * ahead;
    let bz = pz + fz * ahead;
    while ((Math.abs(bx) > 200 || Math.abs(bz) > 200) && ahead > 20) {
      ahead -= 15;
      bx = px + fx * ahead;
      bz = pz + fz * ahead;
    }
    if (Math.abs(bx) > 200 || Math.abs(bz) > 200) return;
    clearRoadblocks();
    const northSouth = Math.abs(fz) > Math.abs(fx);
    const tilt = () => range(rng, -0.2, 0.2);
    if (northSouth) {
      const roadX = city.nearestRoadValue(bx);
      roadblocks.push(vehicles.makeCar('police', 0xf0f0f0, roadX - 3.2, bz, Math.PI / 2 + tilt(), 'police'));
      roadblocks.push(vehicles.makeCar('police', 0xf0f0f0, roadX + 3.2, bz, Math.PI / 2 + tilt(), 'police'));
    } else {
      const roadZ = city.nearestRoadValue(bz);
      roadblocks.push(vehicles.makeCar('police', 0xf0f0f0, bx, roadZ - 3.2, tilt(), 'police'));
      roadblocks.push(vehicles.makeCar('police', 0xf0f0f0, bx, roadZ + 3.2, tilt(), 'police'));
    }
    for (const car of roadblocks) {
      car.path = [];
      car.pathIndex = 0;
      car.stuckTimer = 0;
      car.callSign = 'BARRIER';
      car.isRoadblock = true;
    }
    roadblockX = bx;
    roadblockZ = bz;
  }

  function clearRoadblocks() {
    for (const car of roadblocks) vehicles.removeCar(car);
    roadblocks.length = 0;
  }

  function setWanted(level, world) {
    wanted = clamp(Math.round(level), 0, WANTED.max);
    hideTimer = 0;
    decayTimer = 0;
    if (wanted < 3) clearRoadblocks();
    if (wanted === 0) {
      // Heat off: the remaining cars peel away.
      for (const car of policeCars) vehicles.removeCar(car);
      policeCars.length = 0;
    }
    if (world && world.onWantedChange) world.onWantedChange(wanted);
  }

  function update(dt, world) {
    const px = world.playerX;
    const pz = world.playerZ;
    const playerSpeed = world.playerSpeed || 0;

    // Keep the right number of police cars on the road.
    const want = WANTED.maxPolice[wanted];
    while (policeCars.length < want) spawnPoliceCar(px, pz);
    while (policeCars.length > want) {
      // Drop the farthest one first.
      let farthest = policeCars[0];
      let farthestD = -1;
      for (const car of policeCars) {
        const d = dist2D(car.x, car.z, px, pz);
        if (d > farthestD) {
          farthestD = d;
          farthest = car;
        }
      }
      vehicles.removeCar(farthest);
      policeCars.splice(policeCars.indexOf(farthest), 1);
    }

    // Roadblock: one blockade ahead of the player at 3+ stars. It rebuilds
    // ahead once the player reaches it, rams through it, or drives away.
    if (wanted >= 3) {
      for (let i = roadblocks.length - 1; i >= 0; i -= 1) {
        if (roadblocks[i].dead) roadblocks.splice(i, 1);
      }
      const blockD = dist2D(px, pz, roadblockX, roadblockZ);
      if (roadblocks.length === 0 || blockD < 22 || blockD > 130) {
        const heading = world.player.state.inCar && world.player.state.car
          ? world.player.state.car.heading
          : world.player.state.heading;
        buildRoadblock(px, pz, heading);
      }
    }

    // Drive each police car.
    let nearest = Infinity;
    pathTimer -= dt;
    for (let i = policeCars.length - 1; i >= 0; i -= 1) {
      const car = policeCars[i];
      if (car.dead) {
        policeCars.splice(i, 1);
        continue;
      }
      const d = dist2D(car.x, car.z, px, pz);
      if (d < nearest) nearest = d;
      if (pathTimer <= 0 || car.path.length === 0) {
        computePath(car, px, pz);
        car.repathAt = world.time + 2;
      } else if (world.time > car.repathAt) {
        computePath(car, px, pz);
        car.repathAt = world.time + 2;
      }
      if (d < 28) {
        // Close in: ram the player directly.
        steerToward(car, px, pz, dt, 1);
      } else if (car.pathIndex < car.path.length) {
        const wp = car.path[car.pathIndex];
        if (dist2D(car.x, car.z, wp.x, wp.z) < 10) car.pathIndex += 1;
        else steerToward(car, wp.x, wp.z, dt, 1);
      } else {
        steerToward(car, px, pz, dt, 1);
      }
      // Stuck against a building for too long? Re-deploy down the road.
      if (Math.abs(car.speed) < 1.2) {
        car.stuckTimer += dt;
        if (car.stuckTimer > 4) {
          vehicles.removeCar(car);
          policeCars.splice(i, 1);
          spawnPoliceCar(px, pz);
        }
      } else {
        car.stuckTimer = 0;
      }
    }
    if (pathTimer <= 0) pathTimer = 1.5;

    // Siren follows the nearest car.
    updateSiren(policeCars.length > 0, nearest === Infinity ? 120 : nearest);

    if (wanted === 0) {
      hiding = false;
      bustedTimer = 0;
      return;
    }

    // Are the cops actually seeing the player? Hidden = far away or behind buildings.
    const seen = policeCars.some((car) => {
      const d = dist2D(car.x, car.z, px, pz);
      if (d > WANTED.hideDistance) return false;
      return !segmentBlocked(car.x, car.z, px, pz, city.colliders);
    });
    if (!seen) {
      hiding = true;
      hideTimer += dt;
      if (hideTimer > WANTED.hideTime) {
        decayTimer += dt;
        if (decayTimer >= WANTED.decayEvery) {
          decayTimer = 0;
          setWanted(wanted - 1, world);
        }
      }
    } else {
      hiding = false;
      hideTimer = 0;
      decayTimer = 0;
    }

    // Busted: slow, and a cop right on top of you.
    if (nearest < WANTED.bustedRange && playerSpeed < 2.5) {
      bustedTimer += dt;
      if (bustedTimer >= WANTED.bustedTime && world.onBusted) world.onBusted();
    } else {
      bustedTimer = 0;
    }
  }

  return {
    policeCars,
    roadblocks,
    get wanted() {
      return wanted;
    },
    get hiding() {
      return hiding;
    },
    /** True when a unit has eyes on the player right now. */
    get inSight() {
      return wanted > 0 && !hiding;
    },
    /** The dispatch board: every responding unit, nearest first, with what
     * it is doing — pursuit, ramming, roadblock, or the helicopter overhead. */
    units(world) {
      const px = world.playerX;
      const pz = world.playerZ;
      const rows = [];
      for (const car of policeCars) {
        if (car.dead) continue;
        const d = Math.round(dist2D(car.x, car.z, px, pz));
        const status = d < 28 ? 'RAMMING' : car.stuckTimer > 2 ? 'RESPONDING' : 'CLOSING IN';
        rows.push({ name: car.callSign || 'UNIT', dist: d, status });
      }
      for (const car of roadblocks) {
        if (car.dead) continue;
        rows.push({ name: car.callSign || 'BARRIER', dist: Math.round(dist2D(car.x, car.z, px, pz)), status: 'ROADBLOCK' });
      }
      if (world.heli && world.heli.active) {
        rows.push({ name: HELI_CALLSIGN, dist: Math.round(dist2D(world.heli.state.x, world.heli.state.z, px, pz)), status: 'SPOTLIGHT' });
      }
      rows.sort((a, b) => a.dist - b.dist);
      return rows;
    },
    get bustedProgress() {
      return clamp(bustedTimer / WANTED.bustedTime, 0, 1);
    },
    /** The next callsign in rotation (staged shots use it for their cars). */
    nextCallsign,
    setWanted,
    addWanted(amount, world) {
      if (amount > 0) setWanted(wanted + amount, world);
    },
    nearestDistance(px, pz) {
      let nearest = Infinity;
      for (const car of policeCars) {
        const d = dist2D(car.x, car.z, px, pz);
        if (d < nearest) nearest = d;
      }
      return nearest;
    },
    reset() {
      for (const car of policeCars) vehicles.removeCar(car);
      policeCars.length = 0;
      clearRoadblocks();
      wanted = 0;
      hideTimer = 0;
      decayTimer = 0;
      bustedTimer = 0;
      hiding = false;
    },
    update,
  };
}
