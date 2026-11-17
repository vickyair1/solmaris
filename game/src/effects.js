// SOLMARIS — particles, flashes and screen shake. One THREE.Points pool for
// sparks, smoke, explosions and hit puffs; sprites for muzzle flashes and
// beacons. Everything is pooled so combat never allocates mid-frame.
import * as THREE from 'three';
import { glowTexture } from './textures.js';

const MAX_PARTICLES = 700;

export function createEffects(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const gravity = new Float32Array(MAX_PARTICLES);
  const drag = new Float32Array(MAX_PARTICLES);
  let cursor = 0;
  let shakeAmount = 0;
  let now = 0; // game time, set by update(); flashes measure against this clock

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const glowTex = glowTexture();
  const mat = new THREE.PointsMaterial({
    size: 0.7,
    map: glowTex, // round soft dots — without it every particle is a hard square
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  scene.add(points);
  // Park every particle far underground until it is spawned.
  for (let i = 0; i < MAX_PARTICLES; i += 1) positions[i * 3 + 1] = -100;

  const flashPool = [];
  for (let i = 0; i < 6; i += 1) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffe9a0, transparent: true, depthWrite: false }));
    sprite.visible = false;
    scene.add(sprite);
    flashPool.push({ sprite, until: 0 });
  }
  let flashCursor = 0;

  function spawn(x, y, z, vx, vy, vz, r, g, b, ttl, grav, dragK) {
    const i = cursor;
    cursor = (cursor + 1) % MAX_PARTICLES;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    velocities[i * 3] = vx;
    velocities[i * 3 + 1] = vy;
    velocities[i * 3 + 2] = vz;
    colors[i * 3] = r;
    colors[i * 3 + 1] = g;
    colors[i * 3 + 2] = b;
    life[i] = ttl;
    maxLife[i] = ttl;
    gravity[i] = grav;
    drag[i] = dragK;
    sizes[i] = 1;
  }

  function randSpread(v) {
    return (Math.random() - 0.5) * 2 * v;
  }

  return {
    /** Yellow sparks from a crash or a bullet hitting concrete. */
    sparks(x, y, z, count = 14) {
      for (let i = 0; i < count; i += 1) {
        spawn(x, y, z, randSpread(6), Math.random() * 7, randSpread(6), 1, 0.8, 0.25, 0.4 + Math.random() * 0.4, 18, 0.98);
      }
    },
    /** Grey smoke: car damage, handbrake drifts, explosions. */
    smoke(x, y, z, count = 6, dark = false) {
      for (let i = 0; i < count; i += 1) {
        const shade = dark ? 0.15 : 0.55;
        spawn(
          x + randSpread(0.5), y + randSpread(0.3), z + randSpread(0.5),
          randSpread(1), 1.5 + Math.random() * 2, randSpread(1),
          shade, shade, shade, 1 + Math.random() * 1.2, -1.5, 0.96,
        );
      }
    },
    /** Orange fireball + smoke + a flash: a car going up. */
    explosion(x, y, z) {
      for (let i = 0; i < 40; i += 1) {
        const hot = Math.random() < 0.6;
        spawn(
          x, y + 0.5, z, randSpread(9), Math.random() * 9, randSpread(9),
          1, hot ? 0.55 : 0.25, 0.08, 0.5 + Math.random() * 0.7, 6, 0.94,
        );
      }
      this.smoke(x, y + 1, z, 16, true);
      this.flash(x, y + 1.5, z, 0xffa040, 6, 0.18);
      shakeAmount = Math.min(1.2, shakeAmount + 0.9);
    },
    /** Red puff where a shot lands on a person. */
    hitPuff(x, y, z) {
      for (let i = 0; i < 8; i += 1) {
        spawn(x, y, z, randSpread(2.5), Math.random() * 2.5, randSpread(2.5), 0.75, 0.08, 0.08, 0.35 + Math.random() * 0.3, 8, 0.94);
      }
    },
    /** A quick additive glow: muzzle flash, explosion core, pickup sparkle. */
    flash(x, y, z, color, scale, dur) {
      const slot = flashPool[flashCursor];
      flashCursor = (flashCursor + 1) % flashPool.length;
      slot.sprite.position.set(x, y, z);
      slot.sprite.material.color.setHex(color);
      slot.sprite.scale.setScalar(scale);
      slot.sprite.visible = true;
      slot.until = now + dur;
    },
    /** A burst of golden sparkles for pickups and mission markers. */
    sparkle(x, y, z) {
      for (let i = 0; i < 16; i += 1) {
        spawn(x, y, z, randSpread(2), 2 + Math.random() * 3, randSpread(2), 1, 0.85, 0.3, 0.6 + Math.random() * 0.5, 4, 0.97);
      }
    },
    addShake(amount) {
      shakeAmount = Math.min(1.5, shakeAmount + amount);
    },
    /** Current shake offset for the camera; call every frame, it decays. */
    shakeOffset(dt) {
      shakeAmount = Math.max(0, shakeAmount - dt * 2.2);
      if (shakeAmount <= 0.001) return { x: 0, y: 0 };
      return {
        x: randSpread(1) * shakeAmount * 0.25,
        y: randSpread(1) * shakeAmount * 0.25,
      };
    },
    update(dt, t) {
      now = t;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -100;
          continue;
        }
        velocities[i * 3 + 1] -= gravity[i] * dt;
        velocities[i * 3] *= drag[i];
        velocities[i * 3 + 1] *= drag[i];
        velocities[i * 3 + 2] *= drag[i];
        positions[i * 3] += velocities[i * 3] * dt;
        positions[i * 3 + 1] += velocities[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocities[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.1 && gravity[i] > 0) {
          positions[i * 3 + 1] = 0.1;
          velocities[i * 3 + 1] = 0;
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      for (const slot of flashPool) {
        if (slot.sprite.visible && now > slot.until) slot.sprite.visible = false;
      }
    },
  };
}
