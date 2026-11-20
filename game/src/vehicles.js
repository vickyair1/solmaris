// SOLMARIS — cars: the factory that builds them, arcade driving physics, the
// traffic that fills the streets, parked cars waiting to be stolen, and the
// police cars the wanted system spawns. Two-circle collision per car keeps
// them out of buildings without ever feeling sticky.
import * as THREE from 'three';
import { ROAD_LINES, ROAD_W, PITCH, CAR, TRAFFIC_COUNT, PARKED_COUNT, PALETTE, WORLD_HALF, CITY_HALF, CAR_NAMES, UPGRADES } from './config.js';
import { clamp, dist2D, intRange, pick, range, circleVsBox } from './utils.js';
import { sfx } from './audio.js';

const LANE = 3.5; // lane centre offset from a road's centre line
const TURN_DIST = 10; // how far before an intersection a turn starts

// Shared geometries: every car reuses these, so 30 cars stay cheap.
const GEO = {};
function geo() {
  if (!GEO.body) {
    GEO.body = new THREE.BoxGeometry(4.4, 0.85, 2.0);
    GEO.cabin = new THREE.BoxGeometry(2.2, 0.7, 1.8);
    GEO.truckBody = new THREE.BoxGeometry(5.6, 1.5, 2.2);
    GEO.truckCab = new THREE.BoxGeometry(1.6, 1.1, 2.1);
    GEO.wheel = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
    GEO.light = new THREE.BoxGeometry(0.35, 0.22, 0.5);
    GEO.bar = new THREE.BoxGeometry(0.5, 0.22, 1.5);
    GEO.spoiler = new THREE.BoxGeometry(0.5, 0.12, 1.9);
    GEO.sign = new THREE.BoxGeometry(0.8, 0.3, 0.5);
  }
  return GEO;
}

const MAT = {};
function bodyMat(colorHex) {
  if (!MAT[colorHex]) {
    MAT[colorHex] = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.35, metalness: 0.5 });
  }
  return MAT[colorHex];
}
function sharedMat() {
  if (!MAT.glass) {
    MAT.glass = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.7 });
    MAT.tire = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });
    MAT.hub = new THREE.MeshStandardMaterial({ color: 0xb8b8b8, roughness: 0.3, metalness: 0.8 });
    MAT.head = new THREE.MeshStandardMaterial({ color: 0xfff8d0, emissive: 0xfff2b0, emissiveIntensity: 0.9 });
    MAT.tail = new THREE.MeshStandardMaterial({ color: 0xc22a1e, emissive: 0xa02010, emissiveIntensity: 0.8 });
    MAT.red = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0xff2020, emissiveIntensity: 2 });
    MAT.blue = new THREE.MeshStandardMaterial({ color: 0x2050d0, emissive: 0x2040ff, emissiveIntensity: 2 });
    MAT.dark = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    MAT.burnt = new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 1 });
  }
  return MAT;
}

/** Right-hand traffic: which side of the road centre a direction drives on. */
function laneOffset(axis, dir) {
  if (axis === 'x') return dir > 0 ? LANE : -LANE;
  return dir > 0 ? -LANE : LANE;
}

function headingFor(axis, dir) {
  // Heading 0 = facing -z (north); heading grows clockwise seen from above.
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? Math.PI : 0;
}

/** Build a car mesh. Returns { group, wheels, frontWheels, lightRed, lightBlue }. */
export function createCarMesh(type, colorHex) {
  const g = geo();
  const m = sharedMat();
  const group = new THREE.Group();
  const body = bodyMat(type === 'police' ? 0xf0f0f0 : type === 'taxi' ? 0xe8c832 : colorHex);
  let bodyMesh;
  if (type === 'truck') {
    bodyMesh = new THREE.Mesh(g.truckBody, bodyMat(0x9aa0a8));
    bodyMesh.position.y = 1.15;
    const cab = new THREE.Mesh(g.truckCab, bodyMat(0x707880));
    cab.position.set(2.4, 1.0, 0);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.7, 1.8), m.glass);
    shield.position.set(3.2, 1.15, 0);
    group.add(bodyMesh, cab, shield);
  } else {
    bodyMesh = new THREE.Mesh(g.body, body);
    bodyMesh.position.y = type === 'sports' ? 0.55 : 0.68;
    const cabin = new THREE.Mesh(g.cabin, type === 'police' ? bodyMat(0x181818) : m.glass);
    cabin.position.set(type === 'sports' ? -0.3 : -0.2, type === 'sports' ? 1.25 : 1.4, 0);
    group.add(bodyMesh, cabin);
    if (type === 'sports') {
      const spoiler = new THREE.Mesh(g.spoiler, m.dark);
      spoiler.position.set(-2.1, 1.15, 0);
      group.add(spoiler);
    }
    if (type === 'taxi') {
      const sign = new THREE.Mesh(g.sign, m.head);
      sign.position.set(-0.2, 1.95, 0);
      group.add(sign);
    }
  }
  bodyMesh.castShadow = true;
  bodyMesh.userData.isBody = true;
  // Wheels: front pair steers, all four spin.
  const wheels = [];
  const frontWheels = [];
  for (const [wx, wz, front] of [[1.45, 1.0, true], [1.45, -1.0, true], [-1.45, 1.0, false], [-1.45, -1.0, false]]) {
    const pivot = new THREE.Group();
    const wheel = new THREE.Mesh(g.wheel, m.tire);
    wheel.rotation.x = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.32, 8), m.hub);
    hub.rotation.x = Math.PI / 2;
    pivot.add(wheel, hub);
    pivot.position.set(type === 'truck' ? wx * 1.3 : wx, 0.38, wz);
    group.add(pivot);
    wheels.push(pivot);
    if (front) frontWheels.push(pivot);
  }
  // Headlights and taillights.
  const frontX = type === 'truck' ? 3.25 : 2.22;
  const backX = type === 'truck' ? -2.85 : -2.22;
  for (const side of [-0.7, 0.7]) {
    const head = new THREE.Mesh(g.light, m.head);
    head.position.set(frontX, 0.7, side);
    const tail = new THREE.Mesh(g.light, m.tail);
    tail.position.set(backX, 0.7, side);
    group.add(head, tail);
  }
  let lightRed = null;
  let lightBlue = null;
  if (type === 'police') {
    lightRed = new THREE.Mesh(g.bar, m.red.clone());
    lightRed.position.set(-0.2, 1.85, 0.45);
    lightBlue = new THREE.Mesh(g.bar, m.blue.clone());
    lightBlue.position.set(-0.2, 1.85, -0.45);
    group.add(lightRed, lightBlue);
  }
  return { group, wheels, frontWheels, lightRed, lightBlue, bodyMesh };
}

export function createVehicles(scene, city, effects, rng) {
  const cars = [];
  const colliders = city.colliders;

  function makeCar(type, colorHex, x, z, heading, role) {
    const parts = createCarMesh(type, colorHex);
    parts.group.position.set(x, 0, z);
    parts.group.rotation.y = heading;
    scene.add(parts.group);
    const car = {
      type, colorHex, role,
      name: CAR_NAMES[type] || 'Car',
      mesh: parts.group, wheels: parts.wheels, frontWheels: parts.frontWheels,
      lightRed: parts.lightRed, lightBlue: parts.lightBlue, bodyMesh: parts.bodyMesh,
      x, z, heading, speed: 0,
      damage: 0, maxDamage: CAR.maxDamage, dead: false, shotProof: false, smokeTimer: 0,
      upgrades: { engine: 0, armor: 0, turbo: false },
      axis: 'x', line: 0, dir: 1, cruise: 10,
      turn: null, steerVisual: 0, sirenPhase: Math.random() * 10,
    };
    cars.push(car);
    return car;
  }

  function randomTrafficCar(nearX, nearZ, minDist, maxDist) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    const dir = rng() < 0.5 ? 1 : -1;
    // Pick a position along the road near the player but not on top of them.
    let along;
    let tries = 0;
    do {
      along = range(rng, -CITY_HALF, CITY_HALF);
      const x = axis === 'x' ? along : line + laneOffset(axis, dir);
      const z = axis === 'x' ? line + laneOffset(axis, dir) : along;
      if (dist2D(x, z, nearX, nearZ) >= minDist && dist2D(x, z, nearX, nearZ) <= maxDist) break;
      tries += 1;
    } while (tries < 20);
    const x = axis === 'x' ? along : line + laneOffset(axis, dir);
    const z = axis === 'x' ? line + laneOffset(axis, dir) : along;
    const type = rng() < 0.12 ? 'taxi' : rng() < 0.15 ? 'sports' : 'sedan';
    const car = makeCar(type, pick(rng, PALETTE.car), x, z, headingFor(axis, dir), 'traffic');
    car.axis = axis;
    car.line = line;
    car.dir = dir;
    car.cruise = range(rng, 8, 13);
    car.speed = car.cruise;
    return car;
  }

  function spawnParked() {
    for (let i = 0; i < PARKED_COUNT; i += 1) {
      const axis = rng() < 0.5 ? 'x' : 'z';
      const line = pick(rng, ROAD_LINES);
      const along = range(rng, -CITY_HALF + 20, CITY_HALF - 20);
      const side = rng() < 0.5 ? 1 : -1;
      const off = side * (ROAD_W / 2 - 1.6);
      const x = axis === 'x' ? along : line + off;
      const z = axis === 'x' ? line + off : along;
      const type = rng() < 0.2 ? 'sports' : 'sedan';
      const car = makeCar(type, pick(rng, PALETTE.car), x, z, headingFor(axis, side), 'parked');
      car.axis = axis;
      car.line = line;
      car.dir = side;
    }
    // One sports car parked near Mara's, so the first drive feels good.
    const starter = makeCar('sports', 0xc23b2e, 7, 181, Math.PI / 2, 'parked');
    starter.axis = 'x';
    starter.line = 174;
    starter.dir = 1;
    // Fill the downtown parking lot (block 1,-1, centre 87,-29): two rows of
    // parked cars, so the lot reads as a lot instead of an empty slab.
    for (let i = 0; i < 6; i += 1) {
      const row = i < 3 ? -8 : 8;
      const col = (i % 3) * 12 - 12;
      const type = rng() < 0.25 ? 'sports' : rng() < 0.15 ? 'taxi' : 'sedan';
      const car = makeCar(type, pick(rng, PALETTE.car), 87 + col, -29 + row, 0, 'parked');
      car.axis = 'z';
      car.line = 87;
      car.dir = 1;
    }
  }

  /** Repaint a car (the spray garage): new body colour, same car. */
  function repaintCar(car, colorHex) {
    if (!car.bodyMesh) return;
    car.colorHex = colorHex;
    car.bodyMesh.material = bodyMat(colorHex);
  }

  function removeCar(car) {
    scene.remove(car.mesh);
    const i = cars.indexOf(car);
    if (i >= 0) cars.splice(i, 1);
  }

  /** Arcade drive step shared by the player car and police cars. Garage
   * upgrades stack multiplicatively on the base figures. */
  function drive(car, throttle, steer, dt, handbrake) {
    let maxSpeed = car.type === 'sports' ? CAR.sportsMax : car.type === 'truck' ? CAR.truckMax : car.type === 'police' ? CAR.maxSpeed + 6 : CAR.maxSpeed;
    let accel = car.type === 'sports' ? CAR.sportsAccel : car.type === 'truck' ? CAR.truckAccel : CAR.accel;
    const up = car.upgrades;
    if (up) {
      const engine = UPGRADES.engine[(up.engine || 0) - 1];
      if (engine) {
        maxSpeed *= engine.speed;
        accel *= engine.accel;
      }
      if (up.turbo) {
        maxSpeed *= UPGRADES.turbo.speed;
        accel *= UPGRADES.turbo.accel;
      }
    }
    if (throttle > 0) {
      car.speed += accel * throttle * dt;
      if (car.speed > maxSpeed) car.speed = maxSpeed;
    } else if (throttle < 0) {
      if (car.speed > 0.5) car.speed -= CAR.brake * dt;
      else car.speed = Math.max(-CAR.reverseMax, car.speed + accel * 0.6 * throttle * dt);
    } else {
      car.speed -= car.speed * CAR.drag * dt;
      if (Math.abs(car.speed) < 0.05) car.speed = 0;
    }
    if (handbrake) car.speed -= car.speed * 2.4 * dt;
    const speedFactor = clamp(Math.abs(car.speed) / 9, 0, 1) * (1 - Math.min(0.55, Math.abs(car.speed) / maxSpeed * 0.55));
    const dirSign = car.speed < 0 ? -1 : 1;
    car.heading += steer * CAR.steerRate * speedFactor * dirSign * dt * (handbrake ? 1.5 : 1);
    car.steerVisual = steer;
    const fx = Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
  }

  /** Two-circle collision against buildings; returns impact speed (0 = none). */
  function collideBuildings(car) {
    let impact = 0;
    const fx = Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    for (const [off, radius] of [[1.5, 1.35], [-1.5, 1.35]]) {
      const cx = car.x + fx * off;
      const cz = car.z + fz * off;
      for (const box of colliders) {
        if (cx < box.minX - radius || cx > box.maxX + radius || cz < box.minZ - radius || cz > box.maxZ + radius) continue;
        const hit = circleVsBox(cx, cz, radius, box);
        if (!hit) continue;
        const pushX = hit.x - cx;
        const pushZ = hit.z - cz;
        car.x += pushX;
        car.z += pushZ;
        const into = Math.abs(car.speed);
        if (into > impact) impact = into;
        car.speed *= 0.3;
      }
    }
    return impact;
  }

  function damageCar(car, amount, atX, atZ, world) {
    if (car.dead) return;
    if (car.shotProof) return; // staged screenshot car: it must survive the warm-up
    car.damage += amount;
    if (car.damage >= (car.maxDamage || CAR.maxDamage)) {
      car.dead = true;
      effects.explosion(car.x, 1, car.z);
      sfx.explosion();
      effects.addShake(0.8);
      // Burnt wreck stays visible a while, then vanishes.
      car.mesh.traverse((obj) => {
        if (obj.isMesh) obj.material = sharedMat().burnt;
      });
      car.wreckTimer = 18;
      if (world && world.onCarDestroyed) world.onCarDestroyed(car);
    }
  }

  function trafficTurnCheck(car, dt) {
    // At an intersection, sometimes turn onto the crossing road.
    const along = car.axis === 'x' ? car.x : car.z;
    for (const cross of ROAD_LINES) {
      const distToCross = (cross - along) * car.dir;
      if (distToCross > 0 && distToCross < TURN_DIST && !car.turn && rng() < 0.02) {
        const newDir = rng() < 0.5 ? 1 : -1;
        const newAxis = car.axis === 'x' ? 'z' : 'x';
        const entryX = car.axis === 'x' ? cross - car.dir * TURN_DIST : car.x;
        const entryZ = car.axis === 'x' ? car.z : cross - car.dir * TURN_DIST;
        const exitX = newAxis === 'x' ? cross + newDir * TURN_DIST : cross + laneOffset(newAxis, newDir);
        const exitZ = newAxis === 'x' ? cross + laneOffset(newAxis, newDir) : cross + newDir * TURN_DIST;
        car.turn = {
          t: 0,
          dur: (TURN_DIST * 2) / Math.max(4, car.speed),
          entryX, entryZ, exitX, exitZ,
          ctrlX: car.axis === 'x' ? cross : car.x,
          ctrlZ: car.axis === 'x' ? car.z : cross,
          newAxis, newLine: cross, newDir,
        };
        return;
      }
    }
  }

  function updateTraffic(car, dt, world) {
    if (car.turn) {
      const turn = car.turn;
      turn.t += dt / turn.dur;
      if (turn.t >= 1) {
        car.x = turn.exitX;
        car.z = turn.exitZ;
        car.axis = turn.newAxis;
        car.line = turn.newLine;
        car.dir = turn.newDir;
        car.heading = headingFor(car.axis, car.dir);
        car.turn = null;
      } else {
        const t = turn.t;
        const u = 1 - t;
        const x = u * u * turn.entryX + 2 * u * t * turn.ctrlX + t * t * turn.exitX;
        const z = u * u * turn.entryZ + 2 * u * t * turn.ctrlZ + t * t * turn.exitZ;
        // Tangent of the quadratic bezier -> heading.
        const tx = 2 * u * (turn.ctrlX - turn.entryX) + 2 * t * (turn.exitX - turn.ctrlX);
        const tz = 2 * u * (turn.ctrlZ - turn.entryZ) + 2 * t * (turn.exitZ - turn.ctrlZ);
        car.x = x;
        car.z = z;
        car.heading = Math.atan2(tx, -tz);
        return;
      }
    }
    // Car ahead on the same lane? Slow down or stop.
    let targetSpeed = car.cruise;
    const along = car.axis === 'x' ? car.x : car.z;
    for (const other of cars) {
      if (other === car || other.dead) continue;
      if (other.role === 'traffic' && other.axis === car.axis && other.line === car.line && other.dir === car.dir) {
        const otherAlong = other.axis === 'x' ? other.x : other.z;
        const gap = (otherAlong - along) * car.dir;
        if (gap > 0 && gap < 13) targetSpeed = gap < 7 ? 0 : car.cruise * 0.35;
      } else if (other.role === 'player') {
        const d = dist2D(car.x, car.z, other.x, other.z);
        if (d < 11) {
          // Only brake when the player is actually ahead of us.
          const fx = Math.sin(car.heading);
          const fz = -Math.cos(car.heading);
          const dot = (other.x - car.x) * fx + (other.z - car.z) * fz;
          if (dot > 0) targetSpeed = d < 7 ? 0 : car.cruise * 0.4;
        }
      }
    }
    car.speed += clamp(targetSpeed - car.speed, -14 * dt, 8 * dt);
    const fx = Math.sin(car.heading);
    const fz = -Math.cos(car.heading);
    car.x += fx * car.speed * dt;
    car.z += fz * car.speed * dt;
    trafficTurnCheck(car, dt);
    // Out of the city or too far from the player: recycle near the player.
    const px = world.playerX;
    const pz = world.playerZ;
    if (Math.abs(car.x) > WORLD_HALF || Math.abs(car.z) > WORLD_HALF || dist2D(car.x, car.z, px, pz) > 240) {
      const replacement = randomTrafficCar(px, pz, 55, 130);
      removeCar(car);
      return replacement;
    }
    return null;
  }

  function update(dt, world) {
    const now = world.time;
    for (let i = cars.length - 1; i >= 0; i -= 1) {
      const car = cars[i];
      if (car.dead) {
        car.wreckTimer -= dt;
        if (car.wreckTimer <= 0) removeCar(car);
        continue;
      }
      if (car.role === 'traffic') {
        updateTraffic(car, dt, world);
      } else if (car.role === 'parked') {
        if (Math.abs(car.speed) > 0.05) {
          car.speed -= car.speed * CAR.drag * 2 * dt;
          car.x += Math.sin(car.heading) * car.speed * dt;
          car.z += -Math.cos(car.heading) * car.speed * dt;
          collideBuildings(car);
        }
      }
      // Smoke from a battered car.
      if (car.damage > CAR.smokeAt) {
        car.smokeTimer -= dt;
        if (car.smokeTimer <= 0) {
          car.smokeTimer = 0.12;
          effects.smoke(car.x + Math.sin(car.heading) * 1.6, 1.2, car.z - Math.cos(car.heading) * 1.6, 1, true);
        }
      }
      // Police light bar strobes red/blue.
      if (car.type === 'police' && car.lightRed) {
        const phase = Math.floor(now * 4 + car.sirenPhase) % 2 === 0;
        car.lightRed.material.emissiveIntensity = phase ? 2.5 : 0.15;
        car.lightBlue.material.emissiveIntensity = phase ? 0.15 : 2.5;
      }
      // Wheels spin and steer.
      const spin = (car.speed * dt) / 0.38;
      for (const wheel of car.wheels) {
        wheel.children[0].rotation.y += spin;
        wheel.children[1].rotation.y += spin;
      }
      for (const wheel of car.frontWheels) wheel.rotation.y = car.steerVisual * 0.4;
      // Sync the mesh.
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
    }
    // Car-vs-car bumps (player and police included).
    for (let a = 0; a < cars.length; a += 1) {
      const carA = cars[a];
      if (carA.dead) continue;
      for (let b = a + 1; b < cars.length; b += 1) {
        const carB = cars[b];
        if (carB.dead) continue;
        const dx = carB.x - carA.x;
        const dz = carB.z - carA.z;
        const d = Math.sqrt(dx * dx + dz * dz);
        const minD = 4.4;
        if (d < minD && d > 0.001) {
          const push = (minD - d) / 2;
          const nx = dx / d;
          const nz = dz / d;
          carA.x -= nx * push;
          carA.z -= nz * push;
          carB.x += nx * push;
          carB.z += nz * push;
          const relSpeed = Math.abs(carA.speed - carB.speed);
          if (relSpeed > 4) {
            const midX = (carA.x + carB.x) / 2;
            const midZ = (carA.z + carB.z) / 2;
            effects.sparks(midX, 1, midZ, 8);
            if (carA.role === 'player' || carB.role === 'player') {
              sfx.crash(Math.min(1, relSpeed / 20));
              effects.addShake(0.25);
              if (world.onPlayerCrash) world.onPlayerCrash(relSpeed);
            }
            damageCar(carA, relSpeed * 0.9, carA.x, carA.z, world);
            damageCar(carB, relSpeed * 0.9, carB.x, carB.z, world);
            carA.speed *= 0.55;
            carB.speed *= 0.55;
          }
        }
      }
    }
  }

  /** Find the nearest drivable car to a point (for the E key). */
  function nearestCar(x, z, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.dead || car.role === 'player') continue;
      const d = dist2D(x, z, car.x, car.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  return {
    cars,
    makeCar,
    randomTrafficCar,
    spawnParked,
    removeCar,
    drive,
    collideBuildings,
    damageCar,
    repaintCar,
    nearestCar,
    update,
    initTraffic(px, pz) {
      for (let i = 0; i < TRAFFIC_COUNT; i += 1) randomTrafficCar(px, pz, 20, 200);
    },
    /** How many traffic cars are on the road (to keep the count topped up). */
    trafficCount() {
      return cars.filter((c) => c.role === 'traffic').length;
    },
    topUpTraffic(px, pz) {
      const missing = TRAFFIC_COUNT - this.trafficCount();
      for (let i = 0; i < missing; i += 1) randomTrafficCar(px, pz, 55, 130);
    },
  };
}
