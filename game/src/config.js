// SOLMARIS — shared constants: city layout, palette, tuning, story data.
// One source of truth so every system agrees on the size of the world.

export const GAME_TITLE = 'SOLMARIS';
export const SAVE_KEY = 'solmaris-save-v1';

// ---- city grid -------------------------------------------------------------
// Roads run on both axes at multiples of PITCH; blocks sit between them.
export const PITCH = 58; // road centre to road centre
export const ROAD_W = 14; // asphalt width
export const BLOCK = PITCH - ROAD_W; // 44, building ground per block
export const ROAD_LINES = [-174, -116, -58, 0, 58, 116, 174]; // 7 roads each way
export const CITY_HALF = 208; // playable edge (buildings end near here)
export const WORLD_HALF = 232; // hard clamp for player and cars
export const BEACH_Z = 214; // sand starts south of this line
export const WATER_Z = 252; // water plane starts here

// ---- palette (sun-soaked coastal city, warm noon light) --------------------
export const PALETTE = {
  sky: 0x8fc3ea,
  fog: 0xb8d4ec,
  sun: 0xfff1cf,
  ground: 0x9aa08a,
  asphalt: 0x3d4148,
  asphaltLine: 0xd8d3a8,
  sidewalk: 0xb9b3a4,
  sand: 0xe8d9a8,
  water: 0x2e7fa8,
  grass: 0x7fae5a,
  building: [0xf2e8d8, 0xe8d8c0, 0xd8e2e8, 0xe8c8b0, 0xc8d8c8, 0xf0d8d8, 0xd0d0e0, 0xe8e0c8],
  roof: [0x8a7a68, 0x6a6a72, 0x9a6a5a, 0x5a6a72],
  car: [0xc23b2e, 0x2e6ac2, 0xe8c832, 0x38a05a, 0xe8e8e8, 0x222226, 0x7a4ac2, 0xd87828, 0x38b8c2, 0xa8b0b8],
  shirt: [0xd84a4a, 0x4a8ad8, 0x4ad88a, 0xd8c84a, 0xd84ab0, 0x8a4ad8, 0x4ad8d0, 0xe8e8e8, 0x3a3a3a],
  skin: [0xe8b88a, 0xc89060, 0x8a5a38, 0xf0c8a0, 0x6a4530],
};

// ---- player ----------------------------------------------------------------
export const PLAYER = {
  walkSpeed: 6.5,
  runSpeed: 11,
  accel: 40,
  jumpSpeed: 8.5,
  gravity: 24,
  radius: 0.7,
  height: 1.8,
  maxHealth: 100,
  maxArmor: 100,
  regenDelay: 6,
  regenRate: 6,
  punchDamage: 25,
  punchRange: 2.4,
  gunDamage: 34,
  gunRange: 70,
  magSize: 12,
  reloadTime: 1.2,
  fireInterval: 0.22,
};

// ---- cars ------------------------------------------------------------------
export const CAR = {
  accel: 15,
  sportsAccel: 20,
  truckAccel: 10,
  maxSpeed: 27,
  sportsMax: 38,
  truckMax: 22,
  reverseMax: 10,
  brake: 32,
  drag: 0.55,
  steerRate: 2.1,
  radius: 2.4,
  maxDamage: 100,
  smokeAt: 65,
};

export const TRAFFIC_COUNT = 22;
export const PARKED_COUNT = 12;
export const PED_COUNT = 38;

// ---- police helicopter -----------------------------------------------------
// Air One joins the chase at 3 stars: it shadows the player from above and
// its searchlight gives the pursuit away on the minimap and in the sky.
export const HELI = {
  wantedLevel: 3,
  height: 26, // low enough to sit inside the driving camera's frame
  speed: 30,
  followDistance: 26, // trails behind, where the chase camera looks
};

// ---- wanted / police -------------------------------------------------------
export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  killPed: 2,
  hitCop: 2,
  killCop: 2,
  shootPublic: 1,
  hideDistance: 55,
  hideTime: 8,
  decayEvery: 5,
  bustedRange: 7,
  bustedTime: 2.5,
  maxPolice: [0, 1, 2, 3, 4, 5],
};

// ---- missions --------------------------------------------------------------
// Story: Riko Vale, driver-for-hire in Solmaris. Fixer Mara works the marina.
// Rival crew "The Vultures" (boss: Kestrel) want the harbour ledger.
export const MISSIONS = [
  {
    id: 'first-fare',
    name: 'First Fare',
    giver: 'Mara',
    reward: 400,
    briefing: 'Mara needs a driver she can trust. Pick up the crate at the docks and bring it to the north garage. No heat, no hurry — just drive clean.',
    steps: [
      { type: 'goto', label: 'Pick up the crate at the docks', target: 'docks', radius: 6 },
      { type: 'interact', label: 'Grab the crate', target: 'docks', radius: 6, prompt: 'Press E — Grab the crate' },
      { type: 'goto', label: 'Deliver the crate to the north garage', target: 'garage', radius: 7 },
    ],
  },
  {
    id: 'getaway',
    name: 'Getaway',
    giver: 'Mara',
    reward: 800,
    briefing: 'One of Mara\'s runners is cornered in the east alley and the cops are already rolling. Get him, then lose the heat and bring him to the safehouse.',
    steps: [
      { type: 'goto', label: 'Reach the runner in the east alley', target: 'alley', radius: 6 },
      { type: 'escape', label: 'Lose the cops — break line of sight', wanted: 2 },
      { type: 'goto', label: 'Take the runner to the safehouse', target: 'safehouse', radius: 7 },
    ],
  },
  {
    id: 'harbor-heat',
    name: 'Harbor Heat',
    giver: 'Mara',
    reward: 1500,
    briefing: 'The Vultures grabbed the harbour ledger. They are holding the marina — four of them, armed. Clear them out and bring the ledger home.',
    steps: [
      { type: 'goto', label: 'Reach the marina', target: 'marina', radius: 10 },
      { type: 'kill', label: 'Clear the Vultures from the marina', count: 4, target: 'marina' },
      { type: 'interact', label: 'Take the ledger', target: 'marina', radius: 6, prompt: 'Press E — Take the ledger' },
      { type: 'goto', label: 'Bring the ledger back to Mara', target: 'mara', radius: 7 },
    ],
  },
  {
    id: 'the-exchange',
    name: 'The Exchange',
    giver: 'Mara',
    reward: 2000,
    briefing: 'A buyer is waiting at the west docks and the window is short. Four checkpoints, one clock. Drive like the money depends on it — it does.',
    steps: [
      { type: 'timed', label: 'Hit every checkpoint before the clock runs out', target: 'docksWest', radius: 8, time: 150, checkpoints: ['cp1', 'cp2', 'cp3', 'docksWest'] },
    ],
  },
  {
    id: 'night-shift',
    name: 'Night Shift',
    giver: 'Mara',
    reward: 2500,
    briefing: 'Mara\'s late courier never showed, and four drops are still waiting across town. One clock, four stops — the city at dusk is yours, but the money is not.',
    steps: [
      { type: 'timed', label: 'Make every drop before the clock runs out', target: 'docksWest', radius: 8, time: 150, checkpoints: ['cp1', 'hospital', 'cp3', 'docksWest'] },
    ],
  },
  {
    id: 'rat-trap',
    name: 'Rat Trap',
    giver: 'Mara',
    reward: 3000,
    briefing: 'Kestrel\'s crew is holed up in the old warehouse by the hideout, sitting on a stash that belongs to Mara. Five of them, armed. Go in loud, come out rich.',
    steps: [
      { type: 'goto', label: 'Reach the warehouse by the hideout', target: 'hideout', radius: 10 },
      { type: 'kill', label: 'Clear the Vultures from the warehouse', count: 5, target: 'hideout' },
      { type: 'interact', label: 'Grab the stash', target: 'hideout', radius: 6, prompt: 'Press E — Grab the stash' },
      { type: 'goto', label: 'Bring the stash back to Mara', target: 'mara', radius: 7 },
    ],
  },
  {
    id: 'bank-job',
    name: 'Bank Job',
    giver: 'Mara',
    reward: 3500,
    briefing: 'Solmaris Bank keeps a cash drop in the back, and the Vultures are already inside casing it. Beat them to it: clear the crew, take the cash, and vanish before the sirens find you.',
    steps: [
      { type: 'goto', label: 'Reach Solmaris Bank', target: 'bank', radius: 8 },
      { type: 'kill', label: 'Clear the Vultures from the bank', count: 4, target: 'bank' },
      { type: 'interact', label: 'Grab the cash', target: 'bank', radius: 6, prompt: 'Press E — Grab the cash' },
      { type: 'goto', label: 'Stash the cash at the hideout', target: 'hideout', radius: 9 },
    ],
  },
  {
    id: 'the-big-score',
    name: 'The Big Score',
    giver: 'Mara',
    reward: 5000,
    briefing: 'An armoured truck is sitting at the bank, full of harbour cash. Take it, outrun everything the city throws at you, and bring it to the hideout. This is the one, Riko.',
    steps: [
      { type: 'goto', label: 'Reach the armoured truck at the bank', target: 'bank', radius: 8 },
      { type: 'steal', label: 'Steal the armoured truck', target: 'bank', radius: 6, prompt: 'Press E — Steal the truck' },
      { type: 'goto', label: 'Drive the truck to the hideout', target: 'hideout', radius: 9 },
      { type: 'escape', label: 'Lose the cops', wanted: 0 },
    ],
  },
];

// Named places on the map (x, z). Roads are at multiples of 58; these sit on roads.
export const PLACES = {
  mara: { x: 0, z: 196, label: "Mara's Marina" },
  docks: { x: -116, z: 174, label: 'South Docks' },
  docksWest: { x: -174, z: 58, label: 'West Docks' },
  garage: { x: 58, z: -174, label: 'North Garage' },
  alley: { x: 174, z: 0, label: 'East Alley' },
  safehouse: { x: 116, z: -116, label: 'Safehouse' },
  marina: { x: -58, z: 196, label: 'Marina' },
  bank: { x: 0, z: -58, label: 'Solmaris Bank' },
  hideout: { x: -174, z: -174, label: 'Hideout' },
  hospital: { x: 116, z: 116, label: 'Hospital' },
  policeStation: { x: -116, z: -58, label: 'Police HQ' },
  cp1: { x: -174, z: -116, label: 'Checkpoint 1' },
  cp2: { x: 58, z: -116, label: 'Checkpoint 2' },
  cp3: { x: 174, z: 116, label: 'Checkpoint 3' },
  spawn: { x: 0, z: 174, label: 'Start' },
};

// ---- districts -------------------------------------------------------------
// Named neighbourhoods; the HUD shows where Riko is, and fares pay by how
// far across town they go. First match wins (checked in this order).
export const DISTRICTS = [
  { name: 'The Beach', x0: -232, z0: 214, x1: 232, z1: 260 },
  { name: 'The Marina', x0: -232, z0: 145, x1: 232, z1: 214 },
  { name: 'Downtown', x0: -87, z0: -87, x1: 87, z1: 145 },
  { name: 'West Docks', x0: -232, z0: -87, x1: -87, z1: 145 },
  { name: 'East Alley', x0: 87, z0: -87, x1: 232, z1: 145 },
  { name: 'Northside', x0: -232, z0: -232, x1: 232, z1: -87 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  }
  return 'Solmaris';
}

// ---- camera ----------------------------------------------------------------
export const CAMERA = {
  footDistance: 7.5,
  footHeight: 3.1,
  carDistance: 9.5,
  carHeight: 3.8,
  fov: 62,
};

// ---- misc ------------------------------------------------------------------
export const DAY_MINUTES_START = 10 * 60; // 10:00
export const DAY_MINUTES_PER_SECOND = 1; // one game minute per real second
