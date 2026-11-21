// SOLMARIS — street races: four time trials on the street grid. Drive to
// an R marker in a car, press E, and chase the checkpoints — 3-2-1-GO, a
// running timer, a route line on the minimap, and a medal at the line.
// Gold pays the most cash and respect; the best time per race is saved.
// The law does not pause for a race: police still chase, which is the fun.
import * as THREE from 'three';
import { RACES, PLACES } from './config.js';
import { dist2D } from './utils.js';
import { sfx } from './audio.js';

const START_RADIUS = 9;
const CHECKPOINT_RADIUS = 8;
const COUNTDOWN_SECONDS = 3.2;
const MEDAL_RESPECT = { GOLD: 40, SILVER: 25, BRONZE: 15 };

export function raceDef(id) {
  return RACES.find((r) => r.id === id) || null;
}

/** 65.4 -> "1:05.4" for the race HUD. */
export function raceTimeString(seconds) {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, '0')}`;
}

export function createRaces(scene, effects) {
  // Start markers: a teal diamond + ring at every race start, always up.
  const startMarkers = [];
  for (const race of RACES) {
    const place = PLACES[race.start];
    const mat = new THREE.MeshBasicMaterial({ color: 0x40d0ff });
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), mat);
    diamond.position.set(place.x, 4.2, place.z);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 20), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(place.x, 0.35, place.z);
    scene.add(diamond, ring);
    startMarkers.push(diamond);
  }

  // The checkpoint beacon: a column of light over the next checkpoint.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0x40d0ff, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true), beaconMat);
  beacon.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x40d0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  scene.add(beacon, ring);

  const state = {
    active: false,
    raceId: null,
    checkpointIndex: 0,
    timer: 0,
    countdown: 0, // >0 while the 3-2-1-GO runs; the timer starts at GO
    best: {}, // race id -> best seconds
    medals: {}, // race id -> 'GOLD' | 'SILVER' | 'BRONZE' (best so far)
  };

  function currentRace() {
    return state.raceId ? raceDef(state.raceId) : null;
  }

  function currentCheckpoint() {
    const race = currentRace();
    if (!race) return null;
    const key = race.checkpoints[state.checkpointIndex];
    return key ? PLACES[key] : null;
  }

  function checkpointCount() {
    const race = currentRace();
    return race ? race.checkpoints.length : 0;
  }

  function hideBeacon() {
    beacon.visible = false;
    ring.visible = false;
  }

  function showBeaconAt(target) {
    beacon.visible = true;
    ring.visible = true;
    beacon.position.set(target.x, 17, target.z);
    ring.position.set(target.x, 0.35, target.z);
  }

  /** The race whose start marker the player is standing on, if any. */
  function nearestStart(x, z) {
    for (const race of RACES) {
      const place = PLACES[race.start];
      if (dist2D(x, z, place.x, place.z) < START_RADIUS) return race;
    }
    return null;
  }

  function countdownActive() {
    return state.active && state.countdown > 0;
  }

  function startRace(id, world) {
    const race = raceDef(id);
    if (!race || state.active) return { ok: false, reason: 'Already racing' };
    if (!world.player.state.inCar) return { ok: false, reason: 'Races start in a car' };
    if (world.missions.state.active) return { ok: false, reason: 'Finish the mission first' };
    state.active = true;
    state.raceId = id;
    state.checkpointIndex = 0;
    state.timer = 0;
    state.countdown = COUNTDOWN_SECONDS;
    const first = currentCheckpoint();
    if (first) showBeaconAt(first);
    sfx.checkpoint();
    if (world.hud) world.hud.flash(`${race.name} — ${race.checkpoints.length} checkpoints. ${raceTimeString(race.gold)} for Gold.`, '');
    return { ok: true, reason: '' };
  }

  function finishRace(world) {
    const race = currentRace();
    const time = state.timer;
    const medal = time <= race.gold ? 'GOLD' : time <= race.silver ? 'SILVER' : 'BRONZE';
    const bestBefore = state.best[race.id];
    const newBest = bestBefore === undefined || time < bestBefore;
    if (newBest) state.best[race.id] = time;
    const medalRank = { BRONZE: 1, SILVER: 2, GOLD: 3 };
    if (!state.medals[race.id] || medalRank[medal] > medalRank[state.medals[race.id]]) {
      state.medals[race.id] = medal;
    }
    world.money += race.prize;
    if (world.respect) world.respect.add(world, MEDAL_RESPECT[medal], `${race.name} — ${medal}`, true);
    if (world.career && medal === 'GOLD') world.career.state.racesGold += 1;
    sfx.missionComplete();
    if (world.hud) {
      world.hud.showBanner(
        `${race.name} — ${medal} MEDAL`,
        `${raceTimeString(time)}${newBest ? ' · new best' : ''} · +$${race.prize.toLocaleString('en-US')} · +${MEDAL_RESPECT[medal]} respect`,
        3.2,
      );
    }
    state.active = false;
    state.raceId = null;
    state.checkpointIndex = 0;
    state.countdown = 0;
    hideBeacon();
    if (world.save) world.save();
    return medal;
  }

  function abort() {
    state.active = false;
    state.raceId = null;
    state.checkpointIndex = 0;
    state.timer = 0;
    state.countdown = 0;
    hideBeacon();
  }

  function update(dt, world) {
    for (const m of startMarkers) {
      m.rotation.y += dt * 2;
      m.position.y = 4.2 + Math.sin(world.time * 2) * 0.3;
    }
    if (beacon.visible) {
      beaconMat.opacity = 0.18 + Math.sin(world.time * 3) * 0.08;
      const pulse = 1 + Math.sin(world.time * 3) * 0.06;
      ring.scale.set(pulse, pulse, 1);
    }
    if (!state.active) return;
    if (state.countdown > 0) {
      const before = Math.ceil(state.countdown);
      state.countdown -= dt;
      if (state.countdown <= 0) {
        state.countdown = 0;
        sfx.checkpoint();
        if (world.hud) world.hud.showBanner('GO!', currentRace().name, 1);
      } else if (Math.ceil(state.countdown) !== before && world.hud) {
        world.hud.showBanner(String(Math.ceil(state.countdown)), currentRace().name, 0.9);
      }
      return;
    }
    state.timer += dt;
    const target = currentCheckpoint();
    if (!target) return;
    if (!beacon.visible) showBeaconAt(target); // staged races start mid-run
    if (dist2D(world.playerX, world.playerZ, target.x, target.z) < CHECKPOINT_RADIUS) {
      effects.sparkle(target.x, 1.5, target.z);
      sfx.checkpoint();
      state.checkpointIndex += 1;
      if (state.checkpointIndex >= checkpointCount()) {
        finishRace(world);
      } else {
        const next = currentCheckpoint();
        if (next) showBeaconAt(next);
        if (world.hud) world.hud.flash(`Checkpoint ${state.checkpointIndex}/${checkpointCount()}`, '');
      }
    }
  }

  return {
    state,
    currentRace,
    currentCheckpoint,
    checkpointCount,
    nearestStart,
    countdownActive,
    startRace,
    finishRace,
    abort,
    /** Where the next checkpoint is, for the HUD and the minimap. */
    markerTarget() {
      return state.active ? currentCheckpoint() : null;
    },
    /** The race HUD line: checkpoint, timer, best, gold target. */
    hudText() {
      if (!state.active) return '';
      const race = currentRace();
      if (state.countdown > 0) return `${race.name} — ${Math.ceil(state.countdown)}…`;
      const best = state.best[race.id];
      const bestText = best === undefined ? '—' : raceTimeString(best);
      return `${race.name} · ${Math.min(state.checkpointIndex + 1, checkpointCount())}/${checkpointCount()} · ${raceTimeString(state.timer)} · BEST ${bestText} · GOLD ${raceTimeString(race.gold)}`;
    },
    update,
    reset() {
      abort();
      state.best = {};
      state.medals = {};
    },
    serialize() {
      return { best: { ...state.best }, medals: { ...state.medals } };
    },
    apply(data) {
      this.reset();
      if (!data || typeof data !== 'object') return;
      if (data.best && typeof data.best === 'object') {
        for (const race of RACES) {
          if (typeof data.best[race.id] === 'number') state.best[race.id] = data.best[race.id];
        }
      }
      if (data.medals && typeof data.medals === 'object') {
        for (const race of RACES) {
          if (['GOLD', 'SILVER', 'BRONZE'].includes(data.medals[race.id])) state.medals[race.id] = data.medals[race.id];
        }
      }
    },
  };
}
