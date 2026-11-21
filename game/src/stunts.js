// SOLMARIS — stunt jumps: six ramps around the city — a beach dune, a
// docks edge, the downtown parking lot, the marina, a northside hill and
// the hospital approach. Hit one faster than 12 and the car leaves the
// ground on a real ballistic arc; land more than 15m out and it counts:
// a banner, $10 per metre, and the longest jump in the career stats.
// Ramps are wedge meshes built here, added to the scene.
import * as THREE from 'three';
import { STUNT_RAMPS } from './config.js';
import { dist2D } from './utils.js';
import { sfx } from './audio.js';

const LAUNCH_SPEED = 12;
const LAUNCH_RADIUS = 4.5;
const MIN_JUMP = 15;
const GRAVITY = 24;
const REARM_SECONDS = 2;

export function createStunts(scene, effects) {
  // Each ramp: a tilted steel plate on a low concrete base, angled along
  // its heading so the car reads it as a launch ramp, not a wall.
  for (const ramp of STUNT_RAMPS) {
    const group = new THREE.Group();
    const plate = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x8a9098, metalness: 0.5, roughness: 0.5 }),
    );
    plate.position.y = 1.1;
    plate.rotation.x = -0.32; // the lip lifts toward the launch direction
    plate.castShadow = true;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(5.4, 0.5, 8.4),
      new THREE.MeshStandardMaterial({ color: 0x5a5e64, roughness: 0.9 }),
    );
    base.position.y = 0.25;
    const stripe = new THREE.Mesh(
      new THREE.BoxGeometry(5.1, 0.1, 1),
      new THREE.MeshStandardMaterial({ color: 0xffe93a, roughness: 0.6 }),
    );
    stripe.position.set(0, 1.75, -3.4);
    stripe.rotation.x = -0.32;
    group.add(plate, base, stripe);
    group.position.set(ramp.x, 0, ramp.z);
    group.rotation.y = ramp.heading;
    scene.add(group);
  }

  const state = {
    cleared: [], // ramp indices jumped at least once
    longest: 0, // metres, best jump so far
    jumps: 0,
    airborne: false,
    launchX: 0,
    launchZ: 0,
    airY: 0,
    airVy: 0,
    rampIndex: -1,
    rearmUntil: 0, // game time; no relaunch off the same ramp before this
  };

  function update(dt, world) {
    const player = world.player.state;
    const car = player.inCar ? player.car : null;
    if (!car || car.dead) {
      if (state.airborne) {
        state.airborne = false;
        if (car) car.airY = 0;
      }
      return;
    }
    if (!state.airborne) {
      if (Math.abs(car.speed) <= LAUNCH_SPEED || world.time < state.rearmUntil) return;
      for (let i = 0; i < STUNT_RAMPS.length; i += 1) {
        const ramp = STUNT_RAMPS[i];
        if (dist2D(car.x, car.z, ramp.x, ramp.z) < LAUNCH_RADIUS) {
          state.airborne = true;
          state.rampIndex = i;
          state.launchX = car.x;
          state.launchZ = car.z;
          state.airY = 0;
          state.airVy = 8 + Math.abs(car.speed) * 0.18;
          car.airY = 0;
          effects.sparks(car.x, 0.6, car.z, 8);
          sfx.checkpoint();
          return;
        }
      }
      return;
    }
    // Ballistic arc: the car keeps its road speed, gravity does the rest.
    state.airVy -= GRAVITY * dt;
    state.airY += state.airVy * dt;
    if (state.airY <= 0) {
      state.airY = 0;
      state.airborne = false;
      car.airY = 0;
      state.rearmUntil = world.time + REARM_SECONDS;
      const distance = dist2D(state.launchX, state.launchZ, car.x, car.z);
      if (distance > MIN_JUMP) {
        const cash = Math.round(distance) * 10;
        state.jumps += 1;
        if (distance > state.longest) state.longest = distance;
        if (!state.cleared.includes(state.rampIndex)) state.cleared.push(state.rampIndex);
        if (world.career) {
          world.career.state.longestJumpM = Math.max(world.career.state.longestJumpM, Math.round(distance));
        }
        world.money += cash;
        effects.smoke(car.x, 1, car.z, 6, false);
        sfx.missionComplete();
        if (world.hud) {
          world.hud.showBanner(`STUNT JUMP — ${Math.round(distance)}m!`, `+$${cash.toLocaleString('en-US')} · longest ${Math.round(state.longest)}m`, 2.6);
        }
        if (world.save) world.save();
      }
      return;
    }
    car.airY = state.airY;
  }

  return {
    state,
    update,
    reset() {
      state.cleared = [];
      state.longest = 0;
      state.jumps = 0;
      state.airborne = false;
      state.airY = 0;
      state.airVy = 0;
      state.rampIndex = -1;
      state.rearmUntil = 0;
    },
    serialize() {
      return { cleared: [...state.cleared], longest: state.longest, jumps: state.jumps };
    },
    apply(data) {
      this.reset();
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.cleared)) {
        state.cleared = data.cleared.filter((i) => Number.isInteger(i) && i >= 0 && i < STUNT_RAMPS.length);
      }
      if (typeof data.longest === 'number') state.longest = Math.max(0, data.longest);
      if (typeof data.jumps === 'number') state.jumps = Math.max(0, data.jumps | 0);
    },
  };
}
