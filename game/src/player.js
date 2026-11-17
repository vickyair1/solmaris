// SOLMARIS — Riko Vale on foot: the character mesh, third-person movement,
// jumping, the camera rig (foot and car), and entering/exiting cars. Driving
// itself lives in vehicles.js; shooting lives in combat.js.
import * as THREE from 'three';
import { PLAYER, CAMERA, WORLD_HALF, WATER_Z } from './config.js';
import { clamp, damp, dampAngle, dist2D, circleVsBox } from './utils.js';

const GEO = {
  torso: new THREE.BoxGeometry(0.6, 0.75, 0.34),
  head: new THREE.BoxGeometry(0.36, 0.38, 0.36),
  cap: new THREE.BoxGeometry(0.4, 0.12, 0.4),
  leg: new THREE.BoxGeometry(0.22, 0.78, 0.24),
  arm: new THREE.BoxGeometry(0.16, 0.66, 0.2),
  gun: new THREE.BoxGeometry(0.09, 0.16, 0.42),
};

export function createPlayer(scene, city) {
  const colliders = city.colliders;
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: 0x2e8a7a, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc89060, roughness: 0.8 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2e3a4a, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.4 });

  const torso = new THREE.Mesh(GEO.torso, jacket);
  torso.position.y = 1.15;
  const head = new THREE.Mesh(GEO.head, skin);
  head.position.y = 1.75;
  const cap = new THREE.Mesh(GEO.cap, dark);
  cap.position.y = 1.95;
  const legL = new THREE.Mesh(GEO.leg, pants);
  legL.position.set(0, 0.39, 0.14);
  const legR = new THREE.Mesh(GEO.leg, pants);
  legR.position.set(0, 0.39, -0.14);
  const armL = new THREE.Mesh(GEO.arm, jacket);
  armL.position.set(0, 1.18, 0.42);
  const armR = new THREE.Mesh(GEO.arm, jacket);
  armR.position.set(0, 1.18, -0.42);
  const gun = new THREE.Mesh(GEO.gun, dark);
  gun.position.set(0.12, -0.4, 0);
  armR.add(gun);
  for (const part of [torso, head, cap, legL, legR, armL, armR]) {
    part.castShadow = true;
    group.add(part);
  }
  scene.add(group);

  const state = {
    x: 0, z: 174, y: 0, vy: 0,
    heading: Math.PI, // facing south, toward the marina
    camYaw: Math.PI, camPitch: 0.32,
    speed: 0,
    health: PLAYER.maxHealth,
    armor: 0,
    ammo: PLAYER.magSize,
    reloading: 0,
    inCar: false,
    car: null,
    walkPhase: 0,
    punchTimer: 0,
    lastDamageAt: -99,
    aimYawOffset: 0, // mouse offset while driving; recentres on its own
    holdCam: false, // staged screenshots hold the camera angle
    dead: false,
  };

  function collide(px, pz) {
    let x = px;
    let z = pz;
    for (const box of colliders) {
      if (x < box.minX - PLAYER.radius || x > box.maxX + PLAYER.radius || z < box.minZ - PLAYER.radius || z > box.maxZ + PLAYER.radius) continue;
      const hit = circleVsBox(x, z, PLAYER.radius, box);
      if (hit) {
        x = hit.x;
        z = hit.z;
      }
    }
    return { x, z };
  }

  function updateFoot(dt, input, world) {
    // Mouse steers the camera; the character follows the camera.
    state.camYaw -= input.mouseDX * 0.0028;
    state.camPitch = clamp(state.camPitch + input.mouseDY * 0.0022, -0.15, 1.05);
    const axes = input.moveAxes();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    const aiming = input.rightDown;
    const targetSpeed = (axes.x !== 0 || axes.y !== 0)
      ? (running && !aiming ? PLAYER.runSpeed : PLAYER.walkSpeed)
      : 0;
    state.speed = damp(state.speed, targetSpeed, 10, dt);
    if (targetSpeed > 0) {
      // Movement is relative to where the camera looks.
      const moveAngle = Math.atan2(axes.x, axes.y);
      const wishHeading = state.camYaw + moveAngle;
      state.heading = dampAngle(state.heading, wishHeading, 12, dt);
      const step = state.speed * dt;
      const nx = state.x + Math.sin(state.heading) * step;
      const nz = state.z - Math.cos(state.heading) * step;
      const fixed = collide(nx, nz);
      state.x = clamp(fixed.x, -WORLD_HALF, WORLD_HALF);
      state.z = clamp(fixed.z, -WORLD_HALF, WATER_Z - 3);
      state.walkPhase += dt * state.speed * 1.55;
    }
    if (aiming) state.heading = dampAngle(state.heading, state.camYaw, 14, dt);
    // Jump.
    if (input.justPressed('Space') && state.y <= 0.01) state.vy = PLAYER.jumpSpeed;
    if (state.y > 0 || state.vy > 0) {
      state.vy -= PLAYER.gravity * dt;
      state.y += state.vy * dt;
      if (state.y <= 0) {
        state.y = 0;
        state.vy = 0;
      }
    }
    // Punch timer.
    if (state.punchTimer > 0) state.punchTimer -= dt;
    if (input.justPressed('KeyF')) state.punchTimer = 0.35;
    // Health regen after a quiet stretch.
    if (world.time - state.lastDamageAt > PLAYER.regenDelay && state.health < PLAYER.maxHealth && state.health > 0) {
      state.health = Math.min(PLAYER.maxHealth, state.health + PLAYER.regenRate * dt);
    }
    if (state.reloading > 0) {
      state.reloading -= dt;
      if (state.reloading <= 0) state.ammo = PLAYER.magSize;
    }
    // Animate the mesh.
    const swing = Math.sin(state.walkPhase) * clamp(state.speed / PLAYER.runSpeed, 0, 1) * 0.7;
    legL.rotation.x = swing;
    legR.rotation.x = -swing;
    if (aiming) {
      armR.rotation.x = -1.35; // gun arm out front
      armL.rotation.x = -0.6;
    } else if (state.punchTimer > 0) {
      armR.rotation.x = -1.6 + (0.35 - state.punchTimer) * 4;
      armL.rotation.x = 0.3;
    } else {
      armL.rotation.x = -swing * 0.8;
      armR.rotation.x = swing * 0.8;
    }
    group.position.set(state.x, state.y, state.z);
    group.rotation.y = state.heading;
  }

  function updateCarCamera(dt, input) {
    // Mouse looks around while driving; the view drifts back behind the car.
    // Staged screenshots hold a fixed angle (holdCam) instead of recentring.
    if (state.holdCam) return;
    state.aimYawOffset -= input.mouseDX * 0.0028;
    state.aimYawOffset = clamp(state.aimYawOffset, -2.2, 2.2);
    if (Math.abs(input.mouseDX) < 0.5) state.aimYawOffset = damp(state.aimYawOffset, 0, 1.4, dt);
    state.camPitch = clamp(state.camPitch + input.mouseDY * 0.0022, 0.05, 0.9);
  }

  /** Third-person camera: behind the player on foot, behind the car driving. */
  function updateCamera(dt, camera, world) {
    const shake = world.effects.shakeOffset(dt);
    let targetX;
    let targetY;
    let targetZ;
    let lookX;
    let lookY;
    let lookZ;
    if (state.inCar && state.car) {
      const car = state.car;
      const yaw = car.heading + Math.PI + state.aimYawOffset;
      const dist = CAMERA.carDistance + Math.abs(car.speed) * 0.06;
      const height = CAMERA.carHeight + Math.abs(car.speed) * 0.02;
      targetX = car.x + Math.sin(yaw) * dist;
      targetY = height;
      targetZ = car.z - Math.cos(yaw) * dist;
      lookX = car.x + Math.sin(car.heading) * 6;
      lookY = 1.6;
      lookZ = car.z - Math.cos(car.heading) * 6;
    } else {
      const dist = CAMERA.footDistance;
      const height = CAMERA.footHeight + Math.sin(state.camPitch) * 4;
      const yaw = state.camYaw + Math.PI;
      targetX = state.x + Math.sin(yaw) * dist * Math.cos(state.camPitch);
      targetY = state.y + height;
      targetZ = state.z - Math.cos(yaw) * dist * Math.cos(state.camPitch);
      lookX = state.x;
      lookY = state.y + 1.7;
      lookZ = state.z;
    }
    // Keep the camera out of buildings: pull it toward the look point if blocked.
    const blocked = city && targetX !== undefined
      && world.colliders.some((box) => targetX > box.minX - 0.5 && targetX < box.maxX + 0.5 && targetZ > box.minZ - 0.5 && targetZ < box.maxZ + 0.5);
    if (blocked) {
      targetX = lookX + (targetX - lookX) * 0.35;
      targetY = lookY + (targetY - lookY) * 0.35;
      targetZ = lookZ + (targetZ - lookZ) * 0.35;
    }
    camera.position.x = damp(camera.position.x, targetX + shake.x, 12, dt);
    camera.position.y = damp(camera.position.y, targetY + shake.y, 12, dt);
    camera.position.z = damp(camera.position.z, targetZ, 12, dt);
    camera.lookAt(lookX, lookY, lookZ);
  }

  return {
    state,
    mesh: group,
    updateFoot,
    updateCarCamera,
    updateCamera,
    enterCar(car) {
      state.inCar = true;
      state.car = car;
      car.role = 'player';
      group.visible = false;
    },
    exitCar() {
      const car = state.car;
      if (!car) return;
      state.inCar = false;
      state.car = null;
      car.role = 'parked';
      // Step out on the driver's side.
      const sideX = Math.cos(car.heading);
      const sideZ = Math.sin(car.heading);
      const fixed = collide(car.x + sideX * 2.6, car.z + sideZ * 2.6);
      state.x = clamp(fixed.x, -WORLD_HALF, WORLD_HALF);
      state.z = clamp(fixed.z, -WORLD_HALF, WATER_Z - 3);
      state.y = 0;
      state.vy = 0;
      state.heading = car.heading;
      state.camYaw = car.heading;
      group.visible = true;
      group.position.set(state.x, 0, state.z);
    },
    teleport(x, z, heading) {
      state.x = x;
      state.z = z;
      state.y = 0;
      state.vy = 0;
      if (heading !== undefined) {
        state.heading = heading;
        state.camYaw = heading;
      }
      group.position.set(x, 0, z);
    },
    /** Damage the player; returns true when it kills them. */
    damage(amount, world) {
      if (state.dead) return false;
      state.lastDamageAt = world.time;
      let remaining = amount;
      if (state.armor > 0) {
        const absorbed = Math.min(state.armor, remaining);
        state.armor -= absorbed;
        remaining -= absorbed;
      }
      state.health -= remaining;
      if (state.health <= 0) {
        state.health = 0;
        state.dead = true;
        return true;
      }
      return false;
    },
    healFull() {
      state.health = PLAYER.maxHealth;
      state.armor = 0;
      state.dead = false;
    },
    /** Where a shot starts (the gun) and which way it goes (camera forward). */
    aimRay(camera) {
      const dir = new THREE.Vector3();
      camera.getWorldDirection(dir);
      const origin = new THREE.Vector3(state.x, state.y + 1.5, state.z);
      return { origin, dir };
    },
  };
}
