// SOLMARIS — staged screenshot scenes behind ?shot=chase|foot|race|pause.
// Each one sets up a real game state (a chase, a shootout, a street race,
// the pause menu's career page) and lets the normal simulation run, so the
// frame is what the game really looks like mid-play — never a mock-up.
// The cover is the chase: wanted stars, police with flashing light bars,
// the crew cards, district standing, the dispatch ticker, the minimap and
// a live mission objective in a single frame.
import { PLACES } from './config.js';
import { setTrack } from './audio.js';

function hideMenuForShot(world) {
  world.hud.hideMenu();
  world.playing = true;
  world.paused = false;
}

/** Put the player in a car at a road, rolling, ready for the camera. */
function stageDrive(world, type, color, x, z, heading, speed, camPitch) {
  const car = world.vehicles.makeCar(type, color, x, z, heading, 'parked');
  car.speed = speed;
  // shotProof keeps the car intact through the warm-up (rams and bumps),
  // so no staging armour is needed — and none is faked: a negative damage
  // would leak into the v4 condition readout as over 100%.
  car.damage = 0;
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
    car.callSign = world.police.nextCallsign(); // the dispatch board names them
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
    // The dispatch board names the pursuit and carries the crime + ticker;
    // the weapon slots, the respect bar, the crew cards and the standing bar
    // show what Riko has earned. The car is already 30% battered.
    world.missions.state.index = 1;
    world.missions.state.active = true;
    world.missions.state.stepIndex = 1;
    world.missions.state.kills = 0;
    world.respect.state.points = 290; // HUSTLER
    world.weapons.state.owned.push('smg');
    world.weapons.state.ammo.smg = { mag: 30, reserve: 90 };
    world.weapons.select('smg', world);
    world.crew.recruit('nadia', world); // CLEAN PLATES ready on the crew card
    world.standing.state.values.Downtown = 58; // NEUTRAL, under the district name
    world.police.setWanted(3, world, 'GRAND THEFT AUTO');
    world.police.logEvent('VIPER-7: shots fired near Downtown', world);
    world.police.logEvent('AIR-1: visual on suspect', world);
    setTrack(0); // SOL FM — Mara Voss — Neon Harbor
    // Camera tilted up (0.56) so the helicopter sits inside the frame while
    // the player's car still shows at the bottom of the frame.
    const car = stageDrive(world, 'sports', 0xc23b2e, 3.5, -58, Math.PI, 26, 0.56);
    car.damage = 30; // condition 70% — shotProof keeps it there
    // Four units, tight on the tail and closing (speed 30 > player 26):
    // the cover must show the chase, not an empty road behind the car.
    stagePolice(world, 4, 3.5, -58, Math.PI, 14, 30, 8);
    // Oncoming traffic in the far lane + people watching from the sidewalks.
    stageTraffic(world, -3.5, -30, 0, 'z', 0, -1, 11);
    stageTraffic(world, -3.5, -8, 0, 'z', 0, -1, 10);
    stagePeds(world, [[-9.5, -70, 0], [9.5, -66, Math.PI], [-9.5, -44, 0], [9.5, -40, Math.PI]]);
    world.money = 3450;
    world.dayMinutes = 17 * 60 + 24; // golden hour
    return;
  }

  if (shot === 'foot') {
    // On foot at the marina at dusk, weapon wheel open, Vultures ahead —
    // mission 3, two of four down. The wheel, the dispatch board (2 stars),
    // Mara's dialogue card, the respect bar, Iris's OVERWATCH readout and
    // a FRIENDLY Marina standing bar are all in the frame.
    world.missions.state.index = 2;
    world.missions.state.active = true;
    world.missions.state.stepIndex = 1;
    world.missions.state.kills = 2;
    world.missions.state.killsNeeded = 4;
    world.respect.state.points = 260; // HUSTLER
    world.weapons.state.owned.push('smg');
    world.weapons.state.ammo.smg = { mag: 30, reserve: 90 };
    world.weapons.select('smg', world);
    world.weapons.state.wheelOpen = true;
    world.crew.recruit('nadia', world);
    world.crew.recruit('iris', world);
    world.crew.state.overwatchUntil = world.time + 20; // OVERWATCH active for the frame
    world.standing.state.values['The Marina'] = 74; // FRIENDLY
    world.police.setWanted(2, world, 'ASSAULT');
    world.hud.showDialogue('Mara', 'FIXER · MARINA', 'The Vultures took my ledger. Take it back — all of it.', '#d88a2e', 120);
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
    world.dayMinutes = 19 * 60 + 31; // dusk
    return;
  }

  if (shot === 'race') {
    // Mid-race on the MARINA MILE: checkpoint 2 of 4, timer running, the
    // sports car at speed on the coast road, the route line on the minimap,
    // the race HUD up top, no heat, sunset light.
    world.respect.state.points = 290; // HUSTLER
    world.weapons.state.owned.push('smg');
    world.weapons.state.ammo.smg = { mag: 30, reserve: 90 };
    world.weapons.select('smg', world);
    world.crew.recruit('nadia', world);
    world.races.state.best['marina-mile'] = 72;
    world.races.state.medals['marina-mile'] = 'SILVER';
    world.races.state.active = true;
    world.races.state.raceId = 'marina-mile';
    world.races.state.checkpointIndex = 1; // checkpoint 2/4 (docksWest)
    world.races.state.timer = 38;
    world.races.state.countdown = 0;
    // Coast road westbound, camera behind the car looking forward. The car
    // starts at x=-30 so the warm-up drive ends near x=-61 — clear of the
    // Beach Run start marker at the docks (-116, 174), which the car would
    // otherwise drive straight through and fill the frame with.
    stageDrive(world, 'sports', 0x2e6ac2, -30, 174, -Math.PI / 2, 26, 0.3);
    world.player.state.aimYawOffset = 0;
    stageTraffic(world, -3.5, 174, Math.PI / 2, 'x', 174, 1, 10);
    stagePeds(world, [[-96, 166, 0], [-64, 166, Math.PI]]);
    world.money = 1880;
    world.dayMinutes = 18 * 60 + 5; // sunset
    return;
  }

  if (shot === 'pause') {
    // The pause menu's STATS tab: a mid-game career — 5 of 8 missions done
    // with ratings, a race gold, 12 of 20 charms, 5 of 6 stunts, three
    // friendly districts and the full crew. The completion ring, the
    // checklist, the medals, the big map and the career grid all show.
    // (main.js opens the menu on the STATS tab after this returns.)
    // Staging triggers autosaves (every recruit saves), which would freeze
    // a half-staged career into slot 1 — hold them, then save once at the
    // end so the slot shows the finished state: 59.3% · $12,480.
    const realSave = world.save;
    world.save = () => {};
    world.missions.state.index = 5;
    world.completedMissions = ['first-fare', 'getaway', 'harbor-heat', 'the-exchange', 'night-shift'];
    world.career.state.ratings = {
      'first-fare': 'GOLD',
      getaway: 'SILVER',
      'harbor-heat': 'GOLD',
      'the-exchange': 'BRONZE',
      'night-shift': 'SILVER',
    };
    world.career.state.missionsGold = 2;
    world.career.state.carsStolen = 14;
    world.career.state.copsEscaped = 6;
    world.career.state.distanceDrivenKm = 128.4;
    world.career.state.peopleTakenOut = 23;
    world.career.state.longestJumpM = 34;
    world.career.state.abilitiesUsed = 11;
    world.career.state.hiddenByLocals = 4;
    world.career.state.faresCompleted = 9;
    world.career.state.racesGold = 1;
    world.career.state.charmsFound = 12;
    world.career.state.highestWanted = 4;
    world.races.state.best['marina-mile'] = 61.2;
    world.races.state.medals['marina-mile'] = 'GOLD';
    world.races.state.medals['downtown-circuit'] = 'SILVER';
    world.collectibles.apply({ found: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
    world.stunts.state.cleared = [0, 1, 2, 3, 4];
    world.stunts.state.longest = 34;
    world.stunts.state.jumps = 7;
    world.crew.recruit('nadia', world);
    world.crew.recruit('iris', world);
    world.crew.recruit('theo', world);
    world.standing.state.values['The Marina'] = 74;
    world.standing.state.values.Downtown = 68;
    world.standing.state.values['The Beach'] = 71;
    world.standing.state.values.Northside = 58;
    world.standing.state.values['West Docks'] = 50;
    world.standing.state.values['East Alley'] = 42;
    world.respect.state.points = 560; // BIG SHOT
    world.weapons.state.owned.push('smg', 'shotgun');
    world.weapons.state.ammo.smg = { mag: 30, reserve: 90 };
    world.weapons.state.ammo.shotgun = { mag: 6, reserve: 24 };
    world.player.teleport(0, 58, 0);
    world.playerX = 0;
    world.playerZ = 58;
    world.money = 12480;
    world.dayMinutes = 15 * 60 + 40;
    world.save = realSave;
    world.save(); // one clean save of the fully staged career into slot 1
    return;
  }

  // Unknown shot name: fall back to the title.
  world.titleAngle = 2.4;
  world.titleRadius = 150;
  world.titleHeight = 60;
}
