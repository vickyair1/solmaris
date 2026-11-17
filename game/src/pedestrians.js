// SOLMARIS — pedestrians: the people on the sidewalks. They stroll the
// pavements, turn at intersections, scatter when a car bears down on them or
// a shot rings out, and go down (hard) when a car actually hits them — which
// is when the wanted system starts caring.
import * as THREE from 'three';
import { ROAD_LINES, ROAD_W, PED_COUNT, PALETTE, WORLD_HALF } from './config.js';
import { clamp, dist2D, pick, range } from './utils.js';

const WALK_OFFSET = ROAD_W / 2 + 2.2; // on the sidewalk, just off the asphalt

const GEO = {
  torso: new THREE.BoxGeometry(0.56, 0.72, 0.32),
  head: new THREE.BoxGeometry(0.34, 0.36, 0.34),
  leg: new THREE.BoxGeometry(0.2, 0.72, 0.22),
  arm: new THREE.BoxGeometry(0.15, 0.62, 0.18),
};

const MAT_CACHE = new Map();
function matFor(hex) {
  if (!MAT_CACHE.has(hex)) MAT_CACHE.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.9 }));
  return MAT_CACHE.get(hex);
}

function headingFor(axis, dir) {
  if (axis === 'x') return dir > 0 ? Math.PI / 2 : -Math.PI / 2;
  return dir > 0 ? Math.PI : 0;
}

export function createPedestrians(scene, city, effects, rng) {
  const peds = [];

  function makePed(x, z, heading) {
    const group = new THREE.Group();
    const shirt = matFor(pick(rng, PALETTE.shirt));
    const skin = matFor(pick(rng, PALETTE.skin));
    const pants = matFor(pick(rng, [0x2e3a4a, 0x3a3a3a, 0x5a4a3a, 0x2a4a3a]));
    const torso = new THREE.Mesh(GEO.torso, shirt);
    torso.position.y = 1.1;
    const head = new THREE.Mesh(GEO.head, skin);
    head.position.y = 1.68;
    const legL = new THREE.Mesh(GEO.leg, pants);
    legL.position.set(0, 0.36, 0.13);
    const legR = new THREE.Mesh(GEO.leg, pants);
    legR.position.set(0, 0.36, -0.13);
    const armL = new THREE.Mesh(GEO.arm, shirt);
    armL.position.set(0, 1.12, 0.38);
    const armR = new THREE.Mesh(GEO.arm, shirt);
    armR.position.set(0, 1.12, -0.38);
    for (const part of [torso, head, legL, legR, armL, armR]) {
      part.castShadow = true;
      group.add(part);
    }
    group.position.set(x, 0.3, z);
    group.rotation.y = heading;
    scene.add(group);
    const ped = {
      mesh: group, legL, legR, armL, armR,
      x, z, heading,
      speed: range(rng, 1.1, 2.0),
      axis: 'x', line: 0, dir: 1,
      state: 'walk', // walk | flee | down
      stateTimer: 0,
      walkPhase: rng() * Math.PI * 2,
      fleeX: 0, fleeZ: 0,
    };
    peds.push(ped);
    return ped;
  }

  function spawnNear(px, pz, minDist, maxDist) {
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    const dir = rng() < 0.5 ? 1 : -1;
    const side = rng() < 0.5 ? 1 : -1;
    let along;
    let x;
    let z;
    let tries = 0;
    do {
      along = range(rng, -190, 190);
      x = axis === 'x' ? along : line + side * WALK_OFFSET;
      z = axis === 'x' ? line + side * WALK_OFFSET : along;
      tries += 1;
    } while (tries < 20 && (dist2D(x, z, px, pz) < minDist || dist2D(x, z, px, pz) > maxDist));
    const ped = makePed(x, z, headingFor(axis, dir));
    ped.axis = axis;
    ped.line = line;
    ped.dir = dir;
    ped.side = side;
    return ped;
  }

  function knockDown(ped, world, car) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.stateTimer = 8;
    ped.mesh.rotation.x = Math.PI / 2;
    ped.mesh.position.y = 0.5;
    effects.hitPuff(ped.x, 1, ped.z);
    if (world.onPedHit) world.onPedHit(ped, car);
  }

  function update(dt, world) {
    const px = world.playerX;
    const pz = world.playerZ;
    for (let i = peds.length - 1; i >= 0; i -= 1) {
      const ped = peds[i];
      // Too far away: recycle near the player.
      if (dist2D(ped.x, ped.z, px, pz) > 230) {
        scene.remove(ped.mesh);
        peds.splice(i, 1);
        spawnNear(px, pz, 40, 140);
        continue;
      }
      if (ped.state === 'down') {
        ped.stateTimer -= dt;
        if (ped.stateTimer <= 0) {
          ped.state = 'flee';
          ped.stateTimer = 4;
          ped.mesh.rotation.x = 0;
          ped.mesh.position.y = 0.3;
          const away = Math.atan2(px - ped.x, -(pz - ped.z)) + Math.PI;
          ped.fleeX = Math.sin(away);
          ped.fleeZ = -Math.cos(away);
          ped.heading = away;
        }
        continue;
      }
      // Danger nearby? A fast car or a fresh gunshot sends them running.
      if (ped.state === 'walk') {
        for (const car of world.cars) {
          if (car.dead) continue;
          const d = dist2D(ped.x, ped.z, car.x, car.z);
          if (d < 9 && Math.abs(car.speed) > 6) {
            ped.state = 'flee';
            ped.stateTimer = 3;
            const away = Math.atan2(car.x - ped.x, -(car.z - ped.z)) + Math.PI;
            ped.fleeX = Math.sin(away);
            ped.fleeZ = -Math.cos(away);
            ped.heading = away;
            break;
          }
        }
        if (world.lastShotAt && world.time - world.lastShotAt < 0.5 && dist2D(ped.x, ped.z, world.lastShotX, world.lastShotZ) < 25) {
          ped.state = 'flee';
          ped.stateTimer = 3.5;
          const away = Math.atan2(world.lastShotX - ped.x, -(world.lastShotZ - ped.z)) + Math.PI;
          ped.fleeX = Math.sin(away);
          ped.fleeZ = -Math.cos(away);
          ped.heading = away;
        }
      }
      // Hit by a car?
      if (ped.state !== 'down') {
        for (const car of world.cars) {
          if (car.dead) continue;
          if (dist2D(ped.x, ped.z, car.x, car.z) < 2.1 && Math.abs(car.speed) > 3) {
            knockDown(ped, world, car);
            break;
          }
        }
        if (ped.state === 'down') continue;
      }
      // Move.
      let moveSpeed = ped.speed;
      if (ped.state === 'flee') {
        moveSpeed = 5.5;
        ped.stateTimer -= dt;
        ped.x += ped.fleeX * moveSpeed * dt;
        ped.z += ped.fleeZ * moveSpeed * dt;
        if (ped.stateTimer <= 0) {
          ped.state = 'walk';
          // Rejoin the nearest sidewalk.
          const nearest = city.nearestIntersection(ped.x, ped.z);
          ped.axis = Math.abs(ped.x - nearest.x) < Math.abs(ped.z - nearest.z) ? 'z' : 'x';
          ped.line = ped.axis === 'x' ? city.nearestRoadValue(ped.z) : city.nearestRoadValue(ped.x);
          ped.dir = rng() < 0.5 ? 1 : -1;
          ped.side = rng() < 0.5 ? 1 : -1;
        }
      } else {
        // Stroll along the sidewalk; turn at intersections sometimes.
        const along = ped.axis === 'x' ? ped.x : ped.z;
        const next = along + ped.dir * moveSpeed * dt;
        let turned = false;
        for (const cross of ROAD_LINES) {
          if ((cross - along) * ped.dir > 0 && (cross - next) * ped.dir <= 0 && rng() < 0.3) {
            ped.axis = ped.axis === 'x' ? 'z' : 'x';
            ped.line = cross;
            ped.dir = rng() < 0.5 ? 1 : -1;
            ped.side = rng() < 0.5 ? 1 : -1;
            ped.heading = headingFor(ped.axis, ped.dir);
            turned = true;
            break;
          }
        }
        if (!turned) {
          if (ped.axis === 'x') {
            ped.x = next;
            ped.z = ped.line + ped.side * WALK_OFFSET;
          } else {
            ped.z = next;
            ped.x = ped.line + ped.side * WALK_OFFSET;
          }
          if (Math.abs(ped.x) > 200 || Math.abs(ped.z) > 200) ped.dir *= -1;
          ped.heading = headingFor(ped.axis, ped.dir);
        }
      }
      // Walk cycle: legs and arms swing opposite.
      ped.walkPhase += dt * moveSpeed * 3.4;
      const swing = Math.sin(ped.walkPhase) * (ped.state === 'flee' ? 0.9 : 0.55);
      ped.legL.rotation.x = swing;
      ped.legR.rotation.x = -swing;
      ped.armL.rotation.x = -swing * 0.8;
      ped.armR.rotation.x = swing * 0.8;
      ped.mesh.position.set(ped.x, 0.3, ped.z);
      ped.mesh.rotation.y = ped.heading;
    }
  }

  return {
    peds,
    init(px, pz) {
      for (let i = 0; i < PED_COUNT; i += 1) spawnNear(px, pz, 8, 180);
    },
    update,
    knockDown,
    /** Scatter everyone near a point (explosions, big crashes). */
    scatter(x, z, radius) {
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (dist2D(ped.x, ped.z, x, z) < radius) {
          ped.state = 'flee';
          ped.stateTimer = 4;
          const away = Math.atan2(x - ped.x, -(z - ped.z)) + Math.PI;
          ped.fleeX = Math.sin(away);
          ped.fleeZ = -Math.cos(away);
          ped.heading = away;
        }
      }
    },
  };
}
