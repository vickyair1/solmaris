// SOLMARIS — side work between story jobs: taxi fares and the spray garage.
// A fare waits at a curb with a gold marker; pull up in a car and they get
// in, then drive them across town for cash. The spray garage at North Garage
// repaints the car and wipes the wanted level — for $200, when the heat is on.
import * as THREE from 'three';
import { PLACES, ROAD_LINES, PALETTE } from './config.js';
import { dist2D, pick, range } from './utils.js';
import { sfx } from './audio.js';

const FARE_WAIT = 20; // seconds between fares
const FARE_TIMEOUT = 180;
const SPRAY_COST = 200;
const SPRAY_RANGE = 9;

const FARE_DESTINATIONS = ['mara', 'docks', 'garage', 'safehouse', 'marina', 'bank', 'hideout', 'hospital', 'policeStation', 'docksWest'];

export function createActivities(scene, effects, rng) {
  // One marker, moved between the waiting fare (gold) and the destination (green).
  const diamondMat = new THREE.MeshBasicMaterial({ color: 0xffe93a });
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.7), diamondMat);
  diamond.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe93a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 20), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(diamond, ring);

  const state = {
    phase: 'cooldown', // cooldown | waiting | aboard
    timer: 8, // first fare shows up quickly
    farePed: null,
    fareX: 0,
    fareZ: 0,
    destKey: null,
    dest: null,
    fare: 0,
  };

  function setMarker(x, z, color) {
    diamond.visible = true;
    ring.visible = true;
    diamond.position.set(x, 3.6, z);
    ring.position.set(x, 0.35, z);
    diamondMat.color.setHex(color);
    ringMat.color.setHex(color);
  }

  function hideMarker() {
    diamond.visible = false;
    ring.visible = false;
  }

  function spawnFare(world) {
    // A curb 40-120 units from the player, on a sidewalk.
    const axis = rng() < 0.5 ? 'x' : 'z';
    const line = pick(rng, ROAD_LINES);
    const side = rng() < 0.5 ? 1 : -1;
    let along = 0;
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 20; tries += 1) {
      along = range(rng, -190, 190);
      x = axis === 'x' ? along : line + side * 9.2;
      z = axis === 'x' ? line + side * 9.2 : along;
      const d = dist2D(x, z, world.playerX, world.playerZ);
      if (d >= 40 && d <= 120) break;
    }
    const ped = world.peds.spawnAt(x, z, 0);
    ped.speed = 0; // the fare waits at the curb
    state.farePed = ped;
    state.fareX = x;
    state.fareZ = z;
    state.phase = 'waiting';
    setMarker(x, z, 0xffe93a);
  }

  function clearFare(world) {
    if (state.farePed) {
      const i = world.peds.peds.indexOf(state.farePed);
      if (i >= 0) world.peds.peds.splice(i, 1);
      scene.remove(state.farePed.mesh);
      state.farePed = null;
    }
    state.phase = 'cooldown';
    state.timer = FARE_WAIT;
    state.destKey = null;
    state.dest = null;
    hideMarker();
  }

  function update(dt, world) {
    // Marker bob.
    if (diamond.visible) {
      diamond.rotation.y += dt * 2;
      diamond.position.y = 3.6 + Math.sin(world.time * 2) * 0.3;
    }
    // Fares only run between story missions.
    if (world.missions.state.active) return;
    if (state.phase === 'cooldown') {
      state.timer -= dt;
      if (state.timer <= 0) spawnFare(world);
      return;
    }
    if (state.phase === 'waiting') {
      const ped = state.farePed;
      if (!ped || ped.state === 'down') {
        // The fare got flattened or wandered off; try again later.
        clearFare(world);
        return;
      }
      // Hold the fare at the curb (traffic must not scare them away).
      ped.x = state.fareX;
      ped.z = state.fareZ;
      ped.state = 'walk';
      ped.mesh.position.set(ped.x, 0.3, ped.z);
      const player = world.player.state;
      if (player.inCar && player.car && dist2D(world.playerX, world.playerZ, state.fareX, state.fareZ) < 6) {
        // They get in: pick a destination across town and light the beacon.
        const destKey = pick(rng, FARE_DESTINATIONS);
        state.destKey = destKey;
        state.dest = PLACES[destKey];
        const d = dist2D(state.fareX, state.fareZ, state.dest.x, state.dest.z);
        state.fare = 60 + Math.round(d * 0.5);
        const i = world.peds.peds.indexOf(ped);
        if (i >= 0) world.peds.peds.splice(i, 1);
        scene.remove(ped.mesh);
        state.farePed = null;
        state.phase = 'aboard';
        state.timer = FARE_TIMEOUT;
        setMarker(state.dest.x, state.dest.z, 0x3aff88);
        world.hud.flash(`Fare to ${state.dest.label} — $${state.fare} if you're quick`, '');
        sfx.pickup();
      }
      return;
    }
    // Aboard: drive them there, in the car, before the meter runs out.
    state.timer -= dt;
    const player = world.player.state;
    if (!player.inCar || state.timer <= 0) {
      if (state.timer <= 0) world.hud.flash('Fare cancelled — too slow', 'warning');
      clearFare(world);
      return;
    }
    if (dist2D(world.playerX, world.playerZ, state.dest.x, state.dest.z) < 7) {
      world.money += state.fare;
      effects.sparkle(state.dest.x, 1.5, state.dest.z);
      sfx.missionComplete();
      world.hud.flash(`Fare complete — +$${state.fare}`, '');
      if (world.save) world.save();
      clearFare(world);
    }
  }

  return {
    state,
    update,
    /** Where the fare is (or is going), for the HUD and the minimap. */
    markerTarget() {
      if (state.phase === 'waiting') return { x: state.fareX, z: state.fareZ };
      if (state.phase === 'aboard') return state.dest;
      return null;
    },
    objectiveText() {
      if (state.phase === 'waiting') return 'Taxi fare waiting — pull up in a car';
      if (state.phase === 'aboard') return `Taxi fare — drop them at ${state.dest.label} — ${Math.max(0, Math.ceil(state.timer))}s`;
      return '';
    },
    /** The spray garage: repaint + wipe the wanted level, for $200. */
    trySprayGarage(world) {
      const player = world.player.state;
      if (!player.inCar || !player.car) return false;
      if (dist2D(world.playerX, world.playerZ, PLACES.garage.x, PLACES.garage.z) > SPRAY_RANGE) return false;
      if (world.police.wanted === 0) return false; // no heat: E exits the car as usual
      if (world.money < SPRAY_COST) {
        world.hud.flash(`Respray costs $${SPRAY_COST} — you're short`, 'warning');
        return true;
      }
      world.money -= SPRAY_COST;
      const color = pick(rng, PALETTE.car);
      world.vehicles.repaintCar(player.car, color);
      world.police.setWanted(0, world);
      effects.sparkle(player.car.x, 1.5, player.car.z);
      sfx.pickup();
      world.hud.flash('Resprayed — the heat is gone', '');
      return true;
    },
    sprayPrompt(world) {
      const player = world.player.state;
      if (!player.inCar || !player.car) return '';
      if (dist2D(world.playerX, world.playerZ, PLACES.garage.x, PLACES.garage.z) > SPRAY_RANGE) return '';
      if (world.police.wanted === 0) return '';
      return `E — Respray $${SPRAY_COST} (lose the heat)`;
    },
  };
}
