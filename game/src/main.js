// SOLMARIS — the game itself: a complete open-world crime game in a desktop
// browser, from static files, no network. A sun-soaked coastal city to
// explore on foot and by car, traffic and pedestrians, cars to steal, a
// wanted level with police who respond, five story missions, combat, a HUD
// with a minimap, a start screen and a save.
//
// This file wires the systems together and runs the loop. One job per file:
// config (numbers), utils (math), textures (procedural art), audio (synth
// sound), input (keys/mouse), city (the world), effects (particles),
// vehicles (cars + traffic), pedestrians (the crowds), player (Riko on
// foot), police (wanted + pursuit), combat (shooting + enemies), missions
// (the story), hud (menus + minimap), save (localStorage), shots (staged
// screenshots). All original: own city, characters, names and story.
import * as THREE from 'three';
// Import order is the dossier's order (the kit lists sources depth-first
// from here), so the systems that carry the game — story, side work, the
// helicopter, pickups — come first, ahead of the plumbing.
import { CAMERA, DAY_MINUTES_START, DAY_MINUTES_PER_SECOND, MISSIONS, PLACES, WANTED } from './config.js';
import { mulberry32, queryParam, clamp, dist2D, angleDiff } from './utils.js';
import { createMissions } from './missions.js';
import { createActivities } from './activities.js';
import { createHelicopter } from './helicopter.js';
import { createPickups } from './pickups.js';
import { setMuted, isMuted, updateEngine, nextStation, sfx } from './audio.js';
import { createInput } from './input.js';
import { buildCity } from './city.js';
import { createEffects } from './effects.js';
import { createVehicles } from './vehicles.js';
import { createPedestrians } from './pedestrians.js';
import { createPlayer } from './player.js';
import { createPolice } from './police.js';
import { createCombat } from './combat.js';
import { createHUD } from './hud.js';
import { loadSave, writeSave, clearSave, applySave } from './save.js';
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
  prompt: '',
  interactPressed: false,
  lastShotAt: -99,
  lastShotX: 0,
  lastShotZ: 0,
  titleAngle: 0.6,
  titleRadius: 150,
  titleHeight: 60,
  autoDrive: false, // staged screenshots drive the chase car themselves
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
  world.missions.failMission(world, 'You got wasted.');
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
  if (car && car.role === 'player') world.police.addWanted(WANTED.hitPed, world);
};
world.onEnemyKilled = () => world.missions.onEnemyKilled();
world.onBusted = () => handleBusted();
world.onWantedChange = () => {};

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
  clearSave();
  world.money = 0;
  world.completedMissions = [];
  world.dayMinutes = DAY_MINUTES_START;
  world.missions.reset();
  world.combat.clearEnemies();
  world.police.reset();
  world.heli.reset();
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
  onNewGame: () => {
    sfx.click();
    resetWorld();
    startPlaying();
    world.hud.flash('Welcome to Solmaris. Find Mara at the marina — follow the green marker.', '');
  },
  onContinue: () => {
    sfx.click();
    const data = loadSave();
    if (data) applySave(world, data);
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
    world.hud.showMenu(loadSave(), world.missions.state.index >= MISSIONS.length);
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
});

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
  if (player.state.inCar) {
    // At the spray garage, E resprays first (and only exits when it declines).
    if (world.activities.trySprayGarage(world)) return;
    player.exitCar();
    sfx.click();
    return;
  }
  const car = world.vehicles.nearestCar(player.state.x, player.state.z, 4.5);
  if (car) {
    if (car.role === 'traffic') {
      // Jacking a moving car: the driver bails, the law may notice.
      world.vehicles.topUpTraffic(player.state.x, player.state.z);
      if (world.police.nearestDistance(player.state.x, player.state.z) < 70) {
        world.police.addWanted(WANTED.stealCar, world);
      }
    } else if (world.police.nearestDistance(player.state.x, player.state.z) < 40) {
      world.police.addWanted(WANTED.stealCar, world);
    }
    player.enterCar(car);
    sfx.click();
  }
  // Otherwise the E press falls through to missions (Mara, pickups).
}

function computePrompt() {
  const player = world.player;
  if (player.state.inCar) {
    const spray = world.activities.sprayPrompt(world);
    world.prompt = spray || 'E — Get out   ·   Space — Handbrake';
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
  world.prompt = 'WASD — Move   ·   Shift — Run   ·   Click — Shoot   ·   F — Punch   ·   P — Pause';
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

  // Pause, mute, reload, punch.
  if (input.justPressed('KeyP') || input.justPressed('Escape')) {
    if (world.briefingOpen) {
      world.briefingOpen = false;
      world.hud.hideBriefing();
    } else {
      gameState = 'pause';
      world.playing = false;
      world.paused = true;
      world.hud.showPause();
      world.input.exitLock();
      world.save();
      return;
    }
  }
  if (input.justPressed('KeyM')) {
    setMuted(!isMuted());
    world.hud.setMutedLabel(isMuted());
  }
  if (input.justPressed('KeyN')) {
    const station = nextStation();
    world.hud.flash(`♪ ${station.name} — ${station.desc}`, '');
  }
  if (input.justPressed('KeyR') && player.state.ammo < 12 && player.state.reloading <= 0) {
    player.state.reloading = 1.2;
    sfx.reload();
  }
  if (input.justPressed('KeyF')) world.combat.playerPunch(world);

  handleInteraction();

  // Move the player (on foot or driving).
  if (player.state.inCar && player.state.car) {
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
    world.vehicles.drive(car, axes.y, axes.x, dt, handbrake);
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
let heistBoomDone = false;

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (gameState === 'play' && !world.briefingOpen) {
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
  // A briefing can also be dismissed from the keyboard.
  if (world.briefingOpen && (world.input.justPressed('KeyP') || world.input.justPressed('Enter') || world.input.justPressed('Escape'))) {
    world.briefingOpen = false;
    world.hud.hideBriefing();
    world.input.requestLock();
  }
  world.input.endFrame();

  // Staged screenshots: tell the capture script the scene has settled.
  // Timed on the game clock, not on frames, so the frame is the same on a
  // fast desktop and on a slow software renderer.
  if (SHOT_NAME && !shotReadySent) {
    // The heist frame gets a roadside explosion just before capture, so its
    // smoke is still in the air (visual only — it damages nothing).
    if (SHOT_NAME === 'heist' && !heistBoomDone && world.time >= 0.9) {
      heistBoomDone = true;
      world.effects.explosion(world.playerX + 12, 1, world.playerZ - 8);
      world.effects.smoke(world.playerX + 12, 2, world.playerZ - 8, 10, true);
    }
    const warmup = SHOT_NAME === 'start' ? 0.75 : 1.2;
    if (world.time >= warmup) {
      shotReadySent = true;
      window.__shotReady = true;
    }
  }
}

// ---- boot ---------------------------------------------------------------------
world.hud.showMenu(loadSave(), false);
world.hud.setMutedLabel(isMuted());
if (SHOT_NAME) {
  stageShot(SHOT_NAME, world);
  if (SHOT_NAME !== 'start') {
    gameState = 'play';
    world.playing = true;
  }
}
window.__solmaris = world;
requestAnimationFrame(frame);
