// SOLMARIS — combat: the player's pistol and fists, and the armed Vultures
// who guard the marina in mission 3. Hitscan shooting with tracers, muzzle
// flashes and health bars; enemies return fire when they can see the player.
import * as THREE from 'three';
import { PLAYER } from './config.js';
import { clamp, dist2D, segmentBlocked, range } from './utils.js';
import { sfx } from './audio.js';

const ENEMY_HEALTH = 100;
const ENEMY_DAMAGE = 8;
const ENEMY_RANGE = 34;

export function createCombat(scene, city, effects, rng) {
  const enemies = [];
  let fireTimer = 0;
  const raycaster = new THREE.Raycaster();

  // Tracer pool: thin glowing lines that live for a blink.
  const tracers = [];
  for (let i = 0; i < 6; i += 1) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9 }));
    line.visible = false;
    scene.add(line);
    tracers.push({ line, until: 0 });
  }
  let tracerCursor = 0;

  function showTracer(from, to, now) {
    const slot = tracers[tracerCursor];
    tracerCursor = (tracerCursor + 1) % tracers.length;
    const pos = slot.line.geometry.attributes.position;
    pos.setXYZ(0, from.x, from.y, from.z);
    pos.setXYZ(1, to.x, to.y, to.z);
    pos.needsUpdate = true;
    slot.line.visible = true;
    slot.until = now + 0.09;
  }

  function makeEnemy(x, z) {
    const group = new THREE.Group();
    const shirt = new THREE.MeshStandardMaterial({ color: 0xa02020, roughness: 0.9 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xc89060, roughness: 0.8 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.75, 0.34), shirt);
    torso.position.y = 1.15;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.36), skin);
    head.position.y = 1.75;
    const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.24), pants);
    legL.position.set(0, 0.39, 0.14);
    const legR = legL.clone();
    legR.position.z = -0.14;
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.5), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.6, roughness: 0.5 }));
    gun.position.set(0.3, 1.35, -0.3);
    for (const part of [torso, head, legL, legR, gun]) {
      part.castShadow = true;
      group.add(part);
    }
    // Health bar: two sprites floating over the head, always facing the camera.
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x111111, depthTest: false }));
    barBg.scale.set(1.3, 0.16, 1);
    barBg.position.y = 2.35;
    const barFg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x40d040, depthTest: false }));
    barFg.scale.set(1.2, 0.1, 1);
    barFg.position.y = 2.35;
    group.add(barBg, barFg);
    group.position.set(x, 0.3, z);
    scene.add(group);
    const enemy = {
      mesh: group, barFg, x, z, health: ENEMY_HEALTH, dead: false,
      shootTimer: range(rng, 0.8, 1.8), homeX: x, homeZ: z, deathTimer: 0,
    };
    enemies.push(enemy);
    return enemy;
  }

  /** Ray vs a standing person (sphere at chest height). Returns distance or Infinity. */
  function rayVsPerson(origin, dir, px, pz, radius) {
    const cx = px - origin.x;
    const cy = 1.2 - origin.y;
    const cz = pz - origin.z;
    const t = cx * dir.x + cy * dir.y + cz * dir.z;
    if (t < 0 || t > PLAYER.gunRange) return Infinity;
    const dx = cx - dir.x * t;
    const dy = cy - dir.y * t;
    const dz = cz - dir.z * t;
    const d2 = dx * dx + dy * dy + dz * dz;
    return d2 < radius * radius ? t : Infinity;
  }

  /** Distance along the ray where it first crosses a building (2D, ground plane). */
  function rayVsBuildings(origin, dir) {
    const endX = origin.x + dir.x * PLAYER.gunRange;
    const endZ = origin.z + dir.z * PLAYER.gunRange;
    // Binary search the first blocked point along the ground-projected segment.
    if (!segmentBlocked(origin.x, origin.z, endX, endZ, city.colliders)) return Infinity;
    let lo = 0;
    let hi = PLAYER.gunRange;
    for (let i = 0; i < 12; i += 1) {
      const mid = (lo + hi) / 2;
      const mx = origin.x + dir.x * mid;
      const mz = origin.z + dir.z * mid;
      if (segmentBlocked(origin.x, origin.z, mx, mz, city.colliders)) hi = mid;
      else lo = mid;
    }
    return hi;
  }

  /** The player pulls the trigger. Handles ammo, tracers, hits and wanted heat. */
  function playerShoot(world, camera) {
    const player = world.player;
    if (player.state.inCar || player.state.dead) return;
    if (player.state.reloading > 0 || fireTimer > 0) return;
    if (player.state.ammo <= 0) {
      player.state.reloading = PLAYER.reloadTime;
      sfx.reload();
      return;
    }
    player.state.ammo -= 1;
    fireTimer = PLAYER.fireInterval;
    sfx.shoot();
    world.lastShotAt = world.time;
    world.lastShotX = player.state.x;
    world.lastShotZ = player.state.z;

    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const origin = raycaster.ray.origin.clone();
    const dir = raycaster.ray.direction.clone();
    const muzzle = new THREE.Vector3(player.state.x, player.state.y + 1.45, player.state.z)
      .add(new THREE.Vector3(Math.sin(player.state.heading), 0, -Math.cos(player.state.heading)).multiplyScalar(0.6));
    effects.flash(muzzle.x, muzzle.y, muzzle.z, 0xffe9a0, 1.1, 0.06);

    let bestT = rayVsBuildings(origin, dir);
    let hitKind = bestT === Infinity ? 'none' : 'building';
    let hitTarget = null;
    // Enemies first.
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const t = rayVsPerson(origin, dir, enemy.x, enemy.z, 0.9);
      if (t < bestT) {
        bestT = t;
        hitKind = 'enemy';
        hitTarget = enemy;
      }
    }
    // Pedestrians.
    for (const ped of world.peds.peds) {
      if (ped.state === 'down') continue;
      const t = rayVsPerson(origin, dir, ped.x, ped.z, 0.8);
      if (t < bestT) {
        bestT = t;
        hitKind = 'ped';
        hitTarget = ped;
      }
    }
    // Cars: a fat circle at the car's centre, only if the ray is low enough.
    for (const car of world.vehicles.cars) {
      if (car.dead) continue;
      const t = rayVsPerson(origin, dir, car.x, car.z, 2.3);
      if (t < bestT && origin.y + dir.y * t < 2.2) {
        bestT = t;
        hitKind = 'car';
        hitTarget = car;
      }
    }
    const hitPoint = bestT === Infinity
      ? origin.clone().add(dir.clone().multiplyScalar(PLAYER.gunRange))
      : origin.clone().add(dir.clone().multiplyScalar(bestT));
    showTracer(muzzle, hitPoint, world.time);

    if (hitKind === 'enemy') {
      hitTarget.health -= PLAYER.gunDamage;
      effects.hitPuff(hitPoint.x, hitPoint.y, hitPoint.z);
      hitTarget.barFg.scale.x = 1.2 * clamp(hitTarget.health / ENEMY_HEALTH, 0, 1);
      hitTarget.barFg.material.color.setHex(hitTarget.health > 50 ? 0x40d040 : hitTarget.health > 25 ? 0xe8c832 : 0xd04040);
      if (hitTarget.health <= 0 && !hitTarget.dead) {
        hitTarget.dead = true;
        hitTarget.deathTimer = 3;
        hitTarget.mesh.rotation.x = Math.PI / 2;
        hitTarget.mesh.position.y = 0.5;
        if (world.onEnemyKilled) world.onEnemyKilled(hitTarget);
      }
    } else if (hitKind === 'ped') {
      effects.hitPuff(hitPoint.x, hitPoint.y, hitPoint.z);
      world.peds.knockDown(hitTarget, world);
      world.police.addWanted(2, world);
    } else if (hitKind === 'car') {
      effects.sparks(hitPoint.x, hitPoint.y, hitPoint.z, 6);
      world.vehicles.damageCar(hitTarget, PLAYER.gunDamage, hitPoint.x, hitPoint.z, world);
      if (hitTarget.type === 'police') world.police.addWanted(2, world);
    } else if (hitKind === 'building') {
      effects.sparks(hitPoint.x, Math.max(0.4, hitPoint.y), hitPoint.z, 5);
    } else {
      // A shot in public still draws attention.
      world.police.addWanted(1, world);
    }
  }

  /** Fists: anything hostile or civilian in front of the player, at arm's length. */
  function playerPunch(world) {
    const player = world.player;
    if (player.state.inCar || player.state.dead) return;
    sfx.punch();
    const px = player.state.x;
    const pz = player.state.z;
    const fx = Math.sin(player.state.heading);
    const fz = -Math.cos(player.state.heading);
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dx = enemy.x - px;
      const dz = enemy.z - pz;
      if (dx * dx + dz * dz < PLAYER.punchRange * PLAYER.punchRange && dx * fx + dz * fz > 0) {
        enemy.health -= PLAYER.punchDamage;
        enemy.x += fx * 1.2;
        enemy.z += fz * 1.2;
        effects.hitPuff(enemy.x, 1.2, enemy.z);
        if (enemy.health <= 0) {
          enemy.dead = true;
          enemy.deathTimer = 3;
          enemy.mesh.rotation.x = Math.PI / 2;
          enemy.mesh.position.y = 0.5;
          if (world.onEnemyKilled) world.onEnemyKilled(enemy);
        }
      }
    }
    for (const ped of world.peds.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.x - px;
      const dz = ped.z - pz;
      if (dx * dx + dz * dz < PLAYER.punchRange * PLAYER.punchRange && dx * fx + dz * fz > 0) {
        world.peds.knockDown(ped, world);
        world.police.addWanted(1, world);
      }
    }
  }

  function update(dt, world) {
    fireTimer = Math.max(0, fireTimer - dt);
    for (const slot of tracers) {
      if (slot.line.visible && world.time > slot.until) slot.line.visible = false;
    }
    const px = world.playerX;
    const pz = world.playerZ;
    const py = world.player.state.y + 1.4;
    for (let i = enemies.length - 1; i >= 0; i -= 1) {
      const enemy = enemies[i];
      if (enemy.dead) {
        enemy.deathTimer -= dt;
        if (enemy.deathTimer <= 0) {
          scene.remove(enemy.mesh);
          enemies.splice(i, 1);
        }
        continue;
      }
      enemy.mesh.position.set(enemy.x, 0.3, enemy.z);
      const d = dist2D(enemy.x, enemy.z, px, pz);
      const canSee = d < ENEMY_RANGE && !segmentBlocked(enemy.x, enemy.z, px, pz, city.colliders);
      if (canSee) {
        enemy.mesh.rotation.y = Math.atan2(px - enemy.x, -(pz - enemy.z));
        enemy.shootTimer -= dt;
        if (enemy.shootTimer <= 0) {
          enemy.shootTimer = range(rng, 1.1, 2.1);
          sfx.enemyShoot();
          const from = new THREE.Vector3(enemy.x, 1.4, enemy.z);
          const to = new THREE.Vector3(px, py, pz);
          showTracer(from, to, world.time);
          effects.flash(enemy.x, 1.4, enemy.z, 0xffe9a0, 0.7, 0.05);
          if (rng() < 0.35) {
            if (world.player.state.inCar && world.player.state.car) {
              world.vehicles.damageCar(world.player.state.car, ENEMY_DAMAGE, px, pz, world);
              effects.sparks(px, 1, pz, 5);
            } else if (world.onPlayerDamage) {
              world.onPlayerDamage(ENEMY_DAMAGE);
            }
          } else {
            // Near miss kicks up sparks behind the player.
            effects.sparks(px + range(rng, -2, 2), 0.6, pz + range(rng, -2, 2), 3);
          }
        }
      } else {
        // Guard post: drift back home when the player is gone.
        const home = dist2D(enemy.x, enemy.z, enemy.homeX, enemy.homeZ);
        if (home > 3) {
          const heading = Math.atan2(enemy.homeX - enemy.x, -(enemy.homeZ - enemy.z));
          enemy.mesh.rotation.y = heading;
          enemy.x += Math.sin(heading) * 2 * dt;
          enemy.z += -Math.cos(heading) * 2 * dt;
        }
      }
    }
  }

  return {
    enemies,
    makeEnemy,
    playerShoot,
    playerPunch,
    update,
    clearEnemies() {
      for (const enemy of enemies) scene.remove(enemy.mesh);
      enemies.length = 0;
    },
  };
}
