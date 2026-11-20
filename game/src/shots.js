// SOLMARIS — staged screenshot scenes behind ?shot=start|chase|foot|heist.
// Each one sets up a real game state (a chase, a shootout, the big score)
// and lets the normal simulation run, so the frame is what the game really
// looks like mid-play — never a mock-up. The cover is the chase: wanted
// stars, police with flashing light bars, the minimap and a live mission
// objective in a single frame.
import { PLACES } from './config.js';

function hideMenuForShot(world) {
  world.hud.hideMenu();
  world.playing = true;
  world.paused = false;
}

/** Put the player in a car at a road, rolling, ready for the camera. */
function stageDrive(world, type, color, x, z, heading, speed, camPitch) {
  const car = world.vehicles.makeCar(type, color, x, z, heading, 'parked');
  car.speed = speed;
  // Staging armour: the chase car must survive the warm-up (rams, bumps and
  // the odd building clip) so the frame shows a chase, not a wreck.
  car.damage = -60;
  car.shotProof = true;
  world.player.enterCar(car);
  car.role = 'player';
  world.player.state.aimYawOffset = Math.PI; // camera ahead, looking back: the chase is visible
  world.player.state.holdCam = true;
  world.player.state.camPitch = camPitch === undefined ? 0.42 : camPitch;
  world.autoDrive = true; // the car drives itself while the shot is staged
  return car;
}

/** A traffic car placed on a road, already rolling in its lane. */
function stageTraffic(world, x, z, heading, axis, line, dir, speed) {
  const car = world.vehicles.makeCar('sedan', 0x2e6ac2, x, z, heading, 'traffic');
  car.axis = axis;
  car.line = line;
  car.dir = dir;
  car.cruise = speed || 10;
  car.speed = car.cruise;
  return car;
}

/** Pedestrians on the sidewalk near the action, so the streets read as lived-in. */
function stagePeds(world, spots) {
  for (const [x, z, heading] of spots) {
    world.peds.spawnAt(x, z, heading);
  }
}

/** Spawn police cars right behind the player, already hunting. */
function stagePolice(world, count, behindX, behindZ, heading, gap, speed, spacing) {
  const cars = [];
  for (let i = 0; i < count; i += 1) {
    const offset = i * (spacing || 14);
    const lateral = (i % 2 === 0 ? -1 : 1) * 3.5;
    const fx = Math.sin(heading);
    const fz = -Math.cos(heading);
    const car = world.vehicles.makeCar(
      'police', 0xf0f0f0,
      behindX - fx * ((gap || 26) + offset) + -fz * lateral,
      behindZ - fz * ((gap || 26) + offset) + fx * lateral,
      heading, 'police',
    );
    car.speed = speed || 24;
    car.path = [];
    car.pathIndex = 0;
    car.stuckTimer = 0;
    car.repathAt = 0;
    world.police.policeCars.push(car);
    cars.push(car);
  }
  return cars;
}

export function stageShot(name, world) {
  const shot = name || 'start';
  if (shot === 'start') {
    // Title screen over a slow orbit of the city; the menu is the shot.
    world.titleAngle = 2.4;
    world.titleRadius = 150;
    world.titleHeight = 60;
    return;
  }
  hideMenuForShot(world);

  if (shot === 'chase') {
    // COVER: mission 2, mid-getaway at golden hour — 3 stars, four units on
    // the tail, Air One overhead, oncoming traffic and people on the sidewalks.
    world.missions.state.index = 1;
    world.missions.state.active = true;
    world.missions.state.stepIndex = 1;
    world.missions.state.kills = 0;
    world.police.setWanted(3, world);
    // Camera tilted up (0.56) so the helicopter sits inside the frame while
    // the player's car still shows at the bottom of the frame.
    stageDrive(world, 'sports', 0xc23b2e, 3.5, -58, Math.PI, 26, 0.56);
    // Four units, tight on the tail and closing (speed 30 > player 26):
    // the cover must show the chase, not an empty road behind the car.
    stagePolice(world, 4, 3.5, -58, Math.PI, 5, 30, 8);
    // Oncoming traffic in the far lane + people watching from the sidewalks.
    stageTraffic(world, -3.5, -30, 0, 'z', 0, -1, 11);
    stageTraffic(world, -3.5, -8, 0, 'z', 0, -1, 10);
    stagePeds(world, [[-9.5, -70, 0], [9.5, -66, Math.PI], [-9.5, -44, 0], [9.5, -40, Math.PI]]);
    world.money = 1250;
    world.dayMinutes = 17 * 60 + 24; // golden hour
    return;
  }

  if (shot === 'foot') {
    // On foot at the marina, pistol out, Vultures ahead — mission 3.
    world.missions.state.index = 2;
    world.missions.state.active = true;
    world.missions.state.stepIndex = 1;
    world.missions.state.kills = 1;
    world.missions.state.killsNeeded = 4;
    world.player.teleport(-58, 206, 0);
    world.player.state.camYaw = 0;
    world.player.state.camPitch = 0.3;
    world.combat.makeEnemy(-62, 188);
    world.combat.makeEnemy(-50, 184);
    world.combat.makeEnemy(-70, 192);
    // Bystanders scattering + a car passing on the road behind the fight.
    stagePeds(world, [[-48, 200, Math.PI / 2], [-68, 198, -Math.PI / 2]]);
    stageTraffic(world, -30, 174, Math.PI / 2, 'x', 174, 1, 10);
    world.money = 2450;
    world.dayMinutes = 11 * 60 + 5;
    return;
  }

  if (shot === 'heist') {
    // The big score: armoured truck, 4 stars, four units closing, Air One up.
    // (The roadside explosion fires late in the warm-up, from main.js, so
    // its smoke is still in the air when the frame is taken.)
    world.missions.state.index = 7;
    world.missions.state.active = true;
    world.missions.state.stepIndex = 2;
    world.police.setWanted(4, world);
    stageDrive(world, 'truck', 0x9aa0a8, 3.5, 0, Math.PI, 16, 0.55);
    stagePolice(world, 4, 3.5, 0, Math.PI, 12, 30, 8);
    stagePeds(world, [[-9.5, -12, 0], [9.5, -8, Math.PI]]);
    world.money = 5400;
    world.dayMinutes = 12 * 60 + 40;
    return;
  }

  // Unknown shot name: fall back to the title.
  world.titleAngle = 2.4;
  world.titleRadius = 150;
  world.titleHeight = 60;
}
