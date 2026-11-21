// SOLMARIS — the game itself: a complete open-world crime game in a desktop
// browser, from static files, no network. A sun-soaked coastal city to
// explore on foot and by car, traffic and pedestrians, cars to steal, a
// wanted level with police who respond, eight story missions, combat, a HUD
// with a minimap, a crew with abilities, district standing, street races,
// sun charms and stunt jumps, a career with ratings and completion, a
// tabbed pause menu with a map, and three save slots.
//
// This file wires the systems together and runs the loop. One job per file:
// config (numbers), utils (math), textures (procedural art), audio (synth
// sound), input (keys/mouse), city (the world), effects (particles),
// vehicles (cars + traffic), pedestrians (the crowds), player (Riko on
// foot), police (wanted + pursuit), combat (shooting + enemies), missions
// (the story), weapons (the arsenal + wheel), respect (standing + ranks),
// crew (specialists + abilities), standing (district reputation), races
// (street time trials), collectibles (sun charms), stunts (jump ramps),
// career (ratings + completion), pause (the tabbed menu), garage (car
// upgrades), shops (Harbor Arms + safehouse), hud (menus + minimap), save
// (localStorage slots), shots (staged screenshots). All original: own city,
// characters, names and story.
import * as THREE from 'three';
// Import order is the dossier's order (the kit lists sources depth-first
// from here), so the systems that carry the game — story, arsenal, respect,
// crew, standing, races, charms, stunts, career, the pause menu, garage,
// shops, side work, the helicopter, pickups, combat, the law — come first,
// ahead of the plumbing.
import { CAMERA, DAY_MINUTES_START, DAY_MINUTES_PER_SECOND, MISSIONS, PLACES, WANTED } from './config.js';
import { mulberry32, queryParam, clamp, dist2D, angleDiff, moneyString } from './utils.js';
import { createMissions } from './missions.js';
import { createWeapons } from './weapons.js';
import { createRespect } from './respect.js';
import { createCrew } from './crew.js';
import { createStanding } from './standing.js';
import { createRaces } from './races.js';
import { createCollectibles } from './collectibles.js';
import { createStunts } from './stunts.js';
import { createCareer } from './career.js';
import { createPauseMenu } from './pause.js';
import { createGarage } from './garage.js';
import { createShops } from './shops.js';
import { createActivities } from './activities.js';
import { createHelicopter } from './helicopter.js';
import { createPickups } from './pickups.js';
import { createCombat } from './combat.js';
import { createPolice } from './police.js';
import { createPlayer } from './player.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createInput } from './input.js';
import { buildCity } from './city.js';
import { createEffects } from './effects.js';
import { setMuted, isMuted, updateEngine, nextStation, currentTrack, sfx } from './audio.js';
import { createHUD } from './hud.js';
import { loadSlot, writeSlot, writeSave, clearSlot, applySave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const SHOT_NAME = queryParam('shot', '');
const SEED = parseInt(queryParam('seed', '1'), 10) || 1;

// ---- renderer, scene, camera -------------------------------------------------
const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / window.innerHeight, 0.1, 900);
camera.position.set(0, 5, 184);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---- the world: every system reads and writes this one object ---------------
const rng = mulberry32(SEED);
const world = {
  time: 0,
  dayMinutes: DAY_MINUTES_START,
  money: 0,
  completedMissions: [],
  playerX: PLACES.spawn.x,
  playerZ: PLACES.spawn.z,
  playerSpeed: 0,
  playing: false,
  paused: false,
  briefingOpen: false,
  panelOpen: false, // a shop/garage panel is up; the action pauses like a briefing
  prompt: '',
  interactPressed: false,
  lastShotAt: -99,
  lastShotX: 0,
  lastShotZ: 0,
  titleAngle: 0.6,
  titleRadius: 150,
  titleHeight: 60,
  autoDrive: false, // staged screenshots drive the chase car themselves
  activeSlot: 1, // the save slot autosave writes to (1-3)
  waypoint: null, // { x, z } set by clicking the pause map, or null
  scene, // exposed for debugging via window.__solmaris
  camera,
};

world.input = createInput(canvas);
world.city = buildCity(scene, rng);
world.colliders = world.city.colliders;
world.effects = createEffects(scene);
world.vehicles = createVehicles(scene, world.city, world.effects, rng);
world.cars = world.vehicles.cars;
world.peds = createPedestrians(scene, world.city, world.effects, rng);
world.player = createPlayer(scene, world.city);
world.police = createPolice(scene, world.vehicles, world.city, world.effects, rng);
world.heli = createHelicopter(scene);
world.combat = createCombat(scene, world.city, world.effects, rng);
world.missions = createMissions(scene, world.effects);
world.pickups = createPickups(scene, world.effects);
world.activities = createActivities(scene, world.effects, rng);
world.weapons = createWeapons();
world.respect = createRespect();
world.crew = createCrew();
world.standing = createStanding();
world.races = createRaces(scene, world.effects);
world.collectibles = createCollectibles(scene, world.effects);
world.stunts = createStunts(scene, world.effects);
world.career = createCareer();
world.garage = createGarage(scene, world.effects, rng);
world.shops = createShops(scene, world.effects);
world.save = () => writeSave(world);

world.vehicles.initTraffic(world.playerX, world.playerZ);
world.vehicles.spawnParked();
world.peds.init(world.playerX, world.playerZ);
world.player.teleport(PLACES.spawn.x, PLACES.spawn.z, Math.PI);

// ---- consequences: what happens when the world pushes back ------------------
let gameState = 'title'; // title | play | pause | busted | wasted
let statusTimer = 0;
let autosaveTimer = 0;
let topUpTimer = 0;

function handleWasted() {
  if (gameState !== 'play') return;
  gameState = 'wasted';
  statusTimer = 3;
  const lost = Math.floor(world.money * 0.1);
  world.money -= lost;
  if (world.missions.state.active) world.missions.state.deathsThisAttempt += 1;
  world.missions.failMission(world, 'You got wasted.');
  world.races.abort();
  world.hud.showBanner('WASTED', lost > 0 ? `Hospital bill: -$${lost.toLocaleString('en-US')}` : 'You wake up at the hospital.', 3);
  sfx.missionFail();
  document.getElementById('fade').classList.add('show');
}

function handleBusted() {
  if (gameState !== 'play') return;
  gameState = 'busted';
  statusTimer = 3;
  const lost = Math.floor(world.money * 0.15);
  world.money -= lost;
  world.missions.failMission(world, 'The cops got you.');
  world.races.abort();
  world.hud.showBanner('BUSTED', lost > 0 ? `Bail: -$${lost.toLocaleString('en-US')}` : 'The cops let you off with a warning.', 3);
  sfx.busted();
  document.getElementById('fade').classList.add('show');
}

function respawn() {
  document.getElementById('fade').classList.remove('show');
  const atHospital = gameState === 'wasted';
  if (world.player.state.inCar) {
    const car = world.player.state.car;
    world.player.state.inCar = false;
    world.player.state.car = null;
    world.player.mesh.visible = true;
    if (car && !car.dead) car.role = 'parked';
  }
  world.player.healFull();
  world.police.reset();
  const spot = atHospital ? PLACES.hospital : PLACES.policeStation;
  world.player.teleport(spot.x, spot.z, 0);
  world.playerX = spot.x;
  world.playerZ = spot.z;
  gameState = 'play';
  world.playing = true;
  world.save();
}

world.onPlayerDamage = (amount) => {
  if (world.player.damage(amount, world)) handleWasted();
};
world.onPlayerCrash = (relSpeed) => {
  if (relSpeed > 16) world.onPlayerDamage((relSpeed - 16) * 0.8);
};
world.onCarDestroyed = (car) => {
  world.peds.scatter(car.x, car.z, 30);
  if (car === world.player.state.car) {
    world.player.state.inCar = false;
    world.player.state.car = null;
    world.player.mesh.visible = true;
    world.player.teleport(car.x + 3.5, car.z + 3.5, car.heading);
    world.onPlayerDamage(20);
  }
};
world.onPedHit = (ped, car) => {
  // Only the player's own car earns heat; traffic accidents are not your crime.
  if (car && car.role === 'player') world.police.addWanted(WANTED.hitPed, world, 'ASSAULT');
};
world.onEnemyKilled = () => {
  world.missions.onEnemyKilled();
  if (world.respect) world.respect.add(world, 3, 'Vulture down');
  if (world.career) world.career.state.peopleTakenOut += 1;
};
world.onBusted = () => handleBusted();
// A clean getaway: the heat peaked at 3+ stars and is now gone entirely.
let peakWanted = 0;
world.onWantedChange = (level) => {
  if (level > peakWanted) peakWanted = level;
  if (world.career) world.career.state.highestWanted = Math.max(world.career.state.highestWanted, level);
  if (level === 0) {
    if (peakWanted >= 3 && world.respect) world.respect.add(world, 25, 'clean getaway');
    if (peakWanted >= 3 && world.career) world.career.state.copsEscaped += 1;
    peakWanted = 0;
  }
};

// ---- menus ------------------------------------------------------------------
function startPlaying() {
  gameState = 'play';
  world.playing = true;
  world.paused = false;
  world.hud.hideMenu();
  world.hud.hidePause();
  world.input.requestLock();
}

function resetWorld() {
  clearSlot(world.activeSlot || 1);
  resetWorldState();
}

/** Fresh state without touching the save — New Game clears the slot first,
 * loading a slot applies its save right after. */
function resetWorldState() {
  world.money = 0;
  world.completedMissions = [];
  world.dayMinutes = DAY_MINUTES_START;
  world.waypoint = null;
  world.missions.reset();
  world.combat.clearEnemies();
  world.police.reset();
  world.heli.reset();
  world.races.reset();
  world.weapons = createWeapons();
  world.respect = createRespect();
  world.crew.reset();
  world.standing.reset();
  world.collectibles.reset();
  world.stunts.reset();
  world.career.reset();
  world.shops.state.storedCar = null;
  world.player.state.jack = null;
  world.player.healFull();
  if (world.player.state.inCar) {
    const car = world.player.state.car;
    world.player.state.inCar = false;
    world.player.state.car = null;
    world.player.mesh.visible = true;
    if (car && !car.dead) car.role = 'parked';
  }
  world.player.teleport(PLACES.spawn.x, PLACES.spawn.z, Math.PI);
}

world.hud = createHUD({
  onNewGame: (slot) => {
    sfx.click();
    world.activeSlot = slot || 1;
    resetWorld();
    startPlaying();
    world.hud.flash('Welcome to Solmaris. Find Mara at the marina — follow the green marker.', '');
  },
  onContinue: (slot) => {
    sfx.click();
    world.activeSlot = slot || 1;
    const data = loadSlot(world.activeSlot);
    if (data) {
      resetWorldState();
      applySave(world, data);
    }
    startPlaying();
  },
  onResume: () => {
    sfx.click();
    gameState = 'play';
    world.playing = true;
    world.paused = false;
    world.hud.hidePause();
    world.input.requestLock();
  },
  onRestart: () => {
    sfx.click();
    resetWorld();
    startPlaying();
  },
  onTitle: () => {
    sfx.click();
    gameState = 'title';
    world.playing = false;
    world.paused = false;
    world.save();
    world.hud.hidePause();
    world.input.exitLock();
    world.hud.showMenu(world, world.missions.state.index >= MISSIONS.length);
  },
  onBriefingClose: () => {
    sfx.click();
    world.briefingOpen = false;
    world.hud.hideBriefing();
    world.input.requestLock();
  },
  onMute: () => {
    setMuted(!isMuted());
    world.hud.setMutedLabel(isMuted());
  },
  onPanelClose: () => {
    closePanel();
  },
  onPanelMessage: (msg) => {
    world.hud.flash(msg, 'warning');
  },
});

// The pause menu owns the #pause overlay; the HUD's showPause/hidePause
// delegate to it, and the SAVE tab writes and loads the three slots.
world.pause = createPauseMenu({
  onSaveSlot: (slot) => {
    world.activeSlot = slot;
    writeSlot(world, slot);
    world.hud.flash(`Saved to slot ${slot}`, '');
    sfx.click();
  },
  onLoadSlot: (slot) => {
    const data = loadSlot(slot);
    if (!data) return;
    sfx.click();
    world.activeSlot = slot;
    resetWorldState();
    applySave(world, data);
    gameState = 'play';
    world.playing = true;
    world.paused = false;
    world.hud.hidePause();
    world.input.requestLock();
    world.hud.flash(`Loaded slot ${slot}`, '');
  },
});
world.hud.setPauseMenu(world.pause);

// ---- shop / garage panels ---------------------------------------------------
// A panel pauses the action (like a briefing) and frees the mouse for clicks.
function closePanel() {
  world.panelOpen = false;
  world.hud.closePanel();
  world.input.requestLock();
}

function openPanel(kind) {
  world.panelOpen = true;
  world.input.exitLock();
  if (kind === 'gun') {
    world.hud.openPanel({
      title: 'HARBOR ARMS',
      subtitle: 'Dax: cash up front, no questions, no returns.',
      getItems: () => world.shops.gunItems(world),
      getMoney: () => moneyString(world.money),
      onBuy: (id) => world.shops.buyGun(world, id),
    });
  } else if (kind === 'garage') {
    world.hud.openPanel({
      title: 'NORTH GARAGE',
      subtitle: 'Juno: bring cash, leave faster.',
      getItems: () => world.garage.items(world),
      getMoney: () => moneyString(world.money),
      onBuy: (id) => {
        if (id === 'exitcar') {
          world.player.exitCar();
          closePanel();
          return { ok: true };
        }
        return world.garage.buy(world, id);
      },
    });
  } else if (kind === 'safehouse') {
    world.hud.openPanel({
      title: 'SAFEHOUSE',
      subtitle: 'Home. The only place in Solmaris that wants nothing from you.',
      getItems: () => world.shops.safehouseItems(world),
      getMoney: () => moneyString(world.money),
      onBuy: (id) => {
        if (id === 'exitcar') {
          world.player.exitCar();
          closePanel();
          return { ok: true };
        }
        return world.shops.safehouseAction(world, id);
      },
    });
  }
}

// Missions pause the action while the briefing is up.
const showBriefing = world.hud.showBriefing;
world.hud.showBriefing = (mission) => {
  showBriefing(mission);
  world.briefingOpen = true;
};

// ---- per-frame interaction --------------------------------------------------
function handleInteraction() {
  const input = world.input;
  const player = world.player;
  world.interactPressed = input.justPressed('KeyE');
  if (!world.interactPressed) return;
  if (world.panelOpen || player.state.jack) return;
  // A district job's package claims E first — on foot or in the car.
  if (world.activities.tryJobPickup(world)) return;
  // Shops claim E before the car does.
  if (!player.state.inCar && world.shops.nearGunshop(world)) {
    openPanel('gun');
    return;
  }
  if (world.shops.nearSafehouse(world)) {
    openPanel('safehouse');
    return;
  }
  if (player.state.inCar) {
    if (world.garage.nearGarage(world)) {
      openPanel('garage');
      return;
    }
    // A race start claims E before getting out of the car.
    const race = world.races.nearestStart(world.playerX, world.playerZ);
    if (race && !world.races.state.active && !world.missions.state.active) {
      world.races.startRace(race.id, world);
      return;
    }
    player.exitCar();
    sfx.click();
    return;
  }
  const car = world.vehicles.nearestCar(player.state.x, player.state.z, 4.5);
  if (car) {
    if (car.role === 'traffic') {
      // Jacking a moving car: the driver brakes, Riko works the door.
      player.startJack(world, car);
    } else {
      if (world.police.nearestDistance(player.state.x, player.state.z) < 40) {
        world.police.addWanted(WANTED.stealCar, world, 'GRAND THEFT AUTO');
      }
      if (world.career) world.career.state.carsStolen += 1;
      player.enterCar(car);
      sfx.click();
    }
  }
  // Otherwise the E press falls through to missions (Mara, pickups).
}

function computePrompt() {
  const player = world.player;
  if (player.state.jack) {
    world.prompt = 'Jacking the car… stay close';
    return;
  }
  const jobPrompt = world.activities.jobPrompt(world);
  if (jobPrompt) {
    world.prompt = jobPrompt;
    return;
  }
  if (player.state.inCar) {
    if (world.garage.nearGarage(world)) {
      world.prompt = 'E — North Garage (upgrades, respray)';
      return;
    }
    if (world.shops.nearSafehouse(world)) {
      world.prompt = 'E — Safehouse (park this car)';
      return;
    }
    const race = world.races.nearestStart(world.playerX, world.playerZ);
    if (race && !world.races.state.active && !world.missions.state.active) {
      world.prompt = `E — Start race: ${race.name} (${race.checkpoints.length} checkpoints, $${race.prize.toLocaleString('en-US')})`;
      return;
    }
    world.prompt = 'E — Get out   ·   Space — Handbrake';
    return;
  }
  if (world.shops.nearGunshop(world)) {
    world.prompt = 'E — Harbor Arms (weapons, ammo)';
    return;
  }
  if (world.shops.nearSafehouse(world)) {
    world.prompt = 'E — Safehouse (rest, save, garage)';
    return;
  }
  const step = world.missions.state.active ? world.missions.currentStep() : null;
  if (step && step.type === 'interact') {
    const target = world.missions.markerTarget();
    if (target && dist2D(world.playerX, world.playerZ, target.x, target.z) < step.radius + 2) {
      world.prompt = step.prompt || 'E — Interact';
      return;
    }
  }
  if (!world.missions.state.active && world.missions.state.index < MISSIONS.length) {
    if (dist2D(world.playerX, world.playerZ, PLACES.mara.x, PLACES.mara.z) < 8) {
      world.prompt = 'E — Talk to Mara';
      return;
    }
  }
  const car = world.vehicles.nearestCar(player.state.x, player.state.z, 4.5);
  if (car) {
    world.prompt = car.role === 'traffic' ? 'E — Jack the car' : 'E — Get in the car';
    return;
  }
  world.prompt = 'WASD — Move   ·   Shift — Run   ·   Click — Shoot   ·   1–6/Q — Weapons   ·   Z/X/C — Crew   ·   P — Pause';
}

// ---- the update ---------------------------------------------------------------
/** Staged-shot autopilot: hold the road, cruise at 26, overtake into the free lane. */
function autoDriveAxes(world, car) {
  const city = world.city;
  const fx = Math.sin(car.heading);
  const fz = -Math.cos(car.heading);
  // A car ahead in our lane? Pass it in the opposite lane — never brake to
  // a stop behind it (that gridlocks the chase) and never reverse (that
  // turns the car around and ruins the reverse-camera frame).
  let blocker = null;
  for (const other of world.cars) {
    if (other === car || other.dead) continue;
    const ox = other.x - car.x;
    const oz = other.z - car.z;
    const ahead = ox * fx + oz * fz;
    const lateral = Math.abs(ox * -fz + oz * fx);
    if (ahead > 0 && ahead < 25 && lateral < 3.2) {
      blocker = other;
      break;
    }
  }
  let tx;
  let tz;
  if (Math.abs(fz) > Math.abs(fx)) {
    const centre = city.nearestRoadValue(car.x);
    let targetX = centre;
    if (blocker) targetX = centre + (blocker.x >= centre ? -3.5 : 3.5);
    tx = targetX;
    tz = car.z + fz * 24;
  } else {
    const centre = city.nearestRoadValue(car.z);
    let targetZ = centre;
    if (blocker) targetZ = centre + (blocker.z >= centre ? -3.5 : 3.5);
    tx = car.x + fx * 24;
    tz = targetZ;
  }
  const desired = Math.atan2(tx - car.x, -(tz - car.z));
  const steer = clamp(angleDiff(car.heading, desired) * 2.2, -1, 1);
  const throttle = Math.abs(car.speed) > 26 ? 0 : 1;
  return { x: steer, y: throttle };
}

function refreshPlayerPosition() {
  const player = world.player;
  if (player.state.inCar && player.state.car) {
    world.playerX = player.state.car.x;
    world.playerZ = player.state.car.z;
    world.playerSpeed = Math.abs(player.state.car.speed);
  } else {
    world.playerX = player.state.x;
    world.playerZ = player.state.z;
    world.playerSpeed = player.state.speed;
  }
}

function update(dt) {
  const input = world.input;
  const player = world.player;
  world.time += dt;
  world.dayMinutes += dt * DAY_MINUTES_PER_SECOND;

  // Pause, map, radio, crew abilities, reload, punch.
  if (input.justPressed('KeyP') || input.justPressed('Escape')) {
    if (world.briefingOpen) {
      world.briefingOpen = false;
      world.hud.hideBriefing();
    } else {
      gameState = 'pause';
      world.playing = false;
      world.paused = true;
      world.hud.showPause(world);
      world.input.exitLock();
      world.save();
      return;
    }
  }
  if (input.justPressed('KeyM') || input.justPressed('Tab')) {
    // M / Tab open the pause menu straight on the MAP tab.
    gameState = 'pause';
    world.playing = false;
    world.paused = true;
    world.hud.showPause(world, 'map');
    world.input.exitLock();
    world.save();
    return;
  }
  if (input.justPressed('KeyN')) {
    const station = nextStation();
    const track = currentTrack();
    world.hud.flash(`♪ ${station.name} — ${track.artist} — ${track.title}`, '');
  }
  // The crew: Z drops a star, X repairs the car, C marks the map.
  if (input.justPressed('KeyZ')) world.crew.useAbility('nadia', world);
  if (input.justPressed('KeyX')) world.crew.useAbility('theo', world);
  if (input.justPressed('KeyC')) world.crew.useAbility('iris', world);
  // The arsenal: number keys swap instantly, Q opens the wheel, R reloads.
  for (const code of ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6']) {
    if (input.justPressed(code)) world.weapons.selectByKey(code, world);
  }
  if (input.justPressed('KeyQ')) {
    world.weapons.state.wheelOpen = !world.weapons.state.wheelOpen;
    sfx.click();
  }
  if (input.justPressed('KeyR')) world.weapons.startReload(world);
  if (input.justPressed('KeyF')) world.combat.playerPunch(world);

  handleInteraction();

  // Move the player (on foot or driving) — or finish the carjacking.
  if (player.state.jack) {
    player.updateJack(dt, world);
  } else if (player.state.inCar && player.state.car) {
    const car = player.state.car;
    player.updateCarCamera(dt, input);
    let axes = input.moveAxes();
    let handbrake = input.isDown('Space');
    if (world.autoDrive) {
      // Staged chase: hold the road, cruise just under police pace so the
      // units stay on the tail, and brake for traffic ahead.
      axes = autoDriveAxes(world, car);
      handbrake = false;
    }
    // A race countdown holds the car on the line until GO.
    if (world.races.countdownActive()) {
      axes = { x: 0, y: 0 };
      handbrake = true;
    }
    world.vehicles.drive(car, axes.y, axes.x, dt, handbrake);
    if (world.career) world.career.state.distanceDrivenKm += Math.abs(car.speed) * dt / 1000;
    const impact = world.vehicles.collideBuildings(car);
    if (impact > 6) {
      world.effects.sparks(car.x, 1, car.z, 10);
      sfx.crash(Math.min(1, impact / 22));
      world.effects.addShake(0.3);
      world.vehicles.damageCar(car, (impact - 5) * 1.4, car.x, car.z, world);
      world.onPlayerCrash(impact);
    }
    if (handbrake && Math.abs(car.speed) > 8) {
      world.effects.smoke(car.x - Math.sin(car.heading) * 1.8, 0.4, car.z + Math.cos(car.heading) * 1.8, 1, false);
    }
    car.x = clamp(car.x, -232, 232);
    car.z = clamp(car.z, -232, 226);
    updateEngine(Math.abs(car.speed) / 38, axes.y !== 0, true);
    // Shooting from a car is not a thing here; the click just steers the camera.
  } else {
    player.updateFoot(dt, input, world);
    updateEngine(0, false, false);
    // Click to shoot: hold to fire once the mouse is locked, single clicks otherwise.
    if (input.mouseClicked || (input.locked && input.mouseDown)) {
      if (input.mouseClicked) input.requestLock();
      world.combat.playerShoot(world, camera);
    }
  }

  refreshPlayerPosition();
  computePrompt();

  // The rest of the city.
  world.police.update(dt, world);
  world.heli.update(dt, world);
  world.vehicles.update(dt, world);
  world.peds.update(dt, world);
  world.combat.update(dt, world);
  world.missions.update(dt, world);
  world.pickups.update(dt, world);
  world.activities.update(dt, world);
  world.weapons.update(dt, world);
  world.crew.update(dt, world);
  world.standing.update(dt, world);
  world.races.update(dt, world);
  world.collectibles.update(dt, world);
  world.stunts.update(dt, world);
  world.career.update(dt, world);
  world.garage.update(dt, world);
  world.shops.update(dt, world);
  world.effects.update(dt, world.time);
  world.city.update(dt, world.time, world.playerX, world.playerZ, world.dayMinutes);
  world.hud.update(dt, world);

  // Housekeeping: traffic top-up and autosave.
  topUpTimer -= dt;
  if (topUpTimer <= 0) {
    topUpTimer = 5;
    world.vehicles.topUpTraffic(world.playerX, world.playerZ);
  }
  autosaveTimer -= dt;
  if (autosaveTimer <= 0) {
    autosaveTimer = 30;
    world.save();
  }
}

function updateAmbient(dt) {
  // Title screen and busted/wasted: the city lives on without the player.
  world.time += dt;
  world.interactPressed = false;
  refreshPlayerPosition();
  world.vehicles.update(dt, world);
  world.peds.update(dt, world);
  world.missions.update(dt, world);
  world.effects.update(dt, world.time);
  world.city.update(dt, world.time, world.playerX, world.playerZ, world.dayMinutes);
}

// ---- the loop -----------------------------------------------------------------
let last = performance.now();
let accumulator = 0;
let shotReadySent = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // Pause keys only count when the game was already paused as this frame
  // began — otherwise the P press that pauses would resume at once.
  const wasPaused = gameState === 'pause';

  if (gameState === 'play' && !world.briefingOpen && !world.panelOpen) {
    accumulator += dt;
    let steps = 0;
    while (accumulator >= STEP && steps < 5) {
      update(STEP);
      accumulator -= STEP;
      steps += 1;
      if (gameState !== 'play') {
        accumulator = 0;
        break;
      }
    }
    if (steps === 5) accumulator = 0;
    world.player.updateCamera(dt, camera, world);
  } else if (gameState === 'title') {
    updateAmbient(dt);
    // Slow cinematic orbit over the city for the start screen.
    world.titleAngle += dt * 0.03;
    camera.position.set(
      Math.sin(world.titleAngle) * world.titleRadius,
      world.titleHeight,
      Math.cos(world.titleAngle) * world.titleRadius,
    );
    camera.lookAt(0, 0, 30);
  } else if (gameState === 'busted' || gameState === 'wasted') {
    updateAmbient(dt);
    statusTimer -= dt;
    if (statusTimer <= 0) respawn();
    world.player.updateCamera(dt, camera, world);
  }
  // Pause: render the frozen frame as-is.

  renderer.render(scene, camera);
  // The pause menu's keys: P/Esc resumes, Q/E switch tabs, M/Tab jumps to MAP.
  if (wasPaused) {
    if (world.input.justPressed('KeyP') || world.input.justPressed('Escape')) {
      gameState = 'play';
      world.playing = true;
      world.paused = false;
      world.hud.hidePause();
      world.input.requestLock();
    } else if (world.input.justPressed('KeyQ')) {
      world.pause.cycleTab(-1);
    } else if (world.input.justPressed('KeyE')) {
      world.pause.cycleTab(1);
    } else if (world.input.justPressed('KeyM') || world.input.justPressed('Tab')) {
      world.hud.showPauseTab('map');
    }
  }
  // A briefing can also be dismissed from the keyboard.
  if (world.briefingOpen && (world.input.justPressed('KeyP') || world.input.justPressed('Enter') || world.input.justPressed('Escape'))) {
    world.briefingOpen = false;
    world.hud.hideBriefing();
    world.input.requestLock();
  }
  // Same for a shop panel: Esc or P closes it and play resumes.
  if (world.panelOpen && (world.input.justPressed('KeyP') || world.input.justPressed('Escape'))) {
    closePanel();
  }
  world.input.endFrame();

  // Staged screenshots: tell the capture script the scene has settled.
  // Timed on the game clock, not on frames, so the frame is the same on a
  // fast desktop and on a slow software renderer. The pause shot never
  // runs the clock (the game is paused), so it is ready on the first frame.
  if (SHOT_NAME && !shotReadySent) {
    if (SHOT_NAME === 'pause') {
      shotReadySent = true;
      window.__shotReady = true;
    } else {
      const warmup = SHOT_NAME === 'start' ? 0.75 : 1.2;
      if (world.time >= warmup) {
        shotReadySent = true;
        window.__shotReady = true;
      }
    }
  }
}

// ---- boot ---------------------------------------------------------------------
world.hud.showMenu(world, false);
world.hud.setMutedLabel(isMuted());
if (SHOT_NAME) {
  stageShot(SHOT_NAME, world);
  if (SHOT_NAME === 'pause') {
    gameState = 'pause';
    world.playing = false;
    world.paused = true;
    world.hud.showPause(world, 'stats');
    // The sim is frozen while paused, so the per-frame HUD update never
    // runs for this shot — sync the background HUD once from the staged
    // state (money, clock, crew, standing) so it matches the menu.
    world.playing = true;
    world.hud.update(0, world);
    world.playing = false;
  } else if (SHOT_NAME !== 'start') {
    gameState = 'play';
    world.playing = true;
  }
}
window.__solmaris = world;
requestAnimationFrame(frame);
