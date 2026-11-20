// SOLMARIS — the North Garage: Juno's workshop. Drive in (E opens the
// shop) and spend cash on the car you're sitting in: three engine tiers, two
// armour platings, a turbocharger, and a respray — the hot respray also wipes
// the wanted level. Upgrades live on the car, so a car worth keeping belongs
// in the safehouse garage. An orange marker hangs over the shop.
import * as THREE from 'three';
import { PLACES, UPGRADES, PALETTE, SPRAY_HEAT_PRICE } from './config.js';
import { dist2D, pick } from './utils.js';
import { sfx } from './audio.js';

const GARAGE_RANGE = 9;
const RANK_NAMES = ['', 'RUNNER', 'HUSTLER', 'BIG SHOT', 'KINGPIN'];

export function createGarage(scene, effects, rng) {
  const diamondMat = new THREE.MeshBasicMaterial({ color: 0xff9030 });
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), diamondMat);
  diamond.position.set(PLACES.garage.x, 4.2, PLACES.garage.z);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xff9030, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 20), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(PLACES.garage.x, 0.35, PLACES.garage.z);
  scene.add(diamond, ring);

  function nearGarage(world) {
    const player = world.player.state;
    if (!player.inCar || !player.car) return false;
    return dist2D(world.playerX, world.playerZ, PLACES.garage.x, PLACES.garage.z) <= GARAGE_RANGE;
  }

  function carUpgrades(car) {
    if (!car.upgrades) car.upgrades = { engine: 0, armor: 0, turbo: false };
    return car.upgrades;
  }

  /** The shop's rows for the car the player is sitting in. */
  function items(world) {
    const car = world.player.state.car;
    if (!car) return [];
    const up = carUpgrades(car);
    const rank = world.respect ? world.respect.rankIndex() : 0;
    const rows = [];
    const nextEngine = UPGRADES.engine[up.engine] || null;
    rows.push(nextEngine
      ? { id: 'engine', name: nextEngine.name, desc: `Top speed ×${nextEngine.speed}, acceleration ×${nextEngine.accel}`, price: nextEngine.price, locked: rank < nextEngine.rank, lockReason: `Needs ${RANK_NAMES[nextEngine.rank]} respect` }
      : { id: 'engine', name: 'Engine III — Race', desc: 'Maxed out. Nothing left to bolt on.', price: 0, owned: true });
    const nextArmor = UPGRADES.armor[up.armor] || null;
    rows.push(nextArmor
      ? { id: 'armor', name: nextArmor.name, desc: `Takes ${nextArmor.maxDamage} damage before it burns (now ${car.maxDamage || 100})`, price: nextArmor.price, locked: rank < nextArmor.rank, lockReason: `Needs ${RANK_NAMES[nextArmor.rank]} respect` }
      : { id: 'armor', name: 'Plating II — Armoured', desc: 'Maxed out. A tank with paint on it.', price: 0, owned: true });
    rows.push(up.turbo
      ? { id: 'turbo', name: 'Turbocharger', desc: 'Fitted. Listen to it spool.', price: 0, owned: true }
      : { id: 'turbo', name: 'Turbocharger', desc: `Top speed ×${UPGRADES.turbo.speed}, acceleration ×${UPGRADES.turbo.accel}`, price: UPGRADES.turbo.price, locked: rank < UPGRADES.turbo.rank, lockReason: `Needs ${RANK_NAMES[UPGRADES.turbo.rank]} respect` });
    rows.push({ id: 'paint', name: 'Respray — new colour', desc: 'A fresh coat from Juno\'s rack. Same car, new look.', price: UPGRADES.paint.price });
    if (world.police.wanted > 0) {
      rows.push({ id: 'heat', name: 'Hot respray — lose the heat', desc: `New plates, new paint, ${world.police.wanted} star${world.police.wanted > 1 ? 's' : ''} gone.`, price: SPRAY_HEAT_PRICE });
    }
    rows.push({ id: 'exitcar', name: 'Get out of the car', desc: 'Step out and leave the car here.', price: 0 });
    return rows;
  }

  function buy(world, id) {
    const car = world.player.state.car;
    if (!car) return { ok: false, reason: 'No car here' };
    const up = carUpgrades(car);
    const rank = world.respect ? world.respect.rankIndex() : 0;
    const pay = (price) => {
      if (world.money < price) return false;
      world.money -= price;
      return true;
    };
    if (id === 'engine') {
      const next = UPGRADES.engine[up.engine];
      if (!next) return { ok: false, reason: 'Engine is maxed' };
      if (rank < next.rank) return { ok: false, reason: `Needs ${RANK_NAMES[next.rank]} respect` };
      if (!pay(next.price)) return { ok: false, reason: 'Not enough cash' };
      up.engine += 1;
    } else if (id === 'armor') {
      const next = UPGRADES.armor[up.armor];
      if (!next) return { ok: false, reason: 'Armour is maxed' };
      if (rank < next.rank) return { ok: false, reason: `Needs ${RANK_NAMES[next.rank]} respect` };
      if (!pay(next.price)) return { ok: false, reason: 'Not enough cash' };
      up.armor += 1;
      car.maxDamage = next.maxDamage;
    } else if (id === 'turbo') {
      if (up.turbo) return { ok: false, reason: 'Turbo already fitted' };
      if (rank < UPGRADES.turbo.rank) return { ok: false, reason: `Needs ${RANK_NAMES[UPGRADES.turbo.rank]} respect` };
      if (!pay(UPGRADES.turbo.price)) return { ok: false, reason: 'Not enough cash' };
      up.turbo = true;
    } else if (id === 'paint') {
      if (!pay(UPGRADES.paint.price)) return { ok: false, reason: 'Not enough cash' };
      world.vehicles.repaintCar(car, pick(rng, PALETTE.car));
    } else if (id === 'heat') {
      if (world.police.wanted === 0) return { ok: false, reason: 'No heat to lose' };
      if (!pay(SPRAY_HEAT_PRICE)) return { ok: false, reason: 'Not enough cash' };
      world.vehicles.repaintCar(car, pick(rng, PALETTE.car));
      world.police.setWanted(0, world);
    } else {
      return { ok: false, reason: 'Unknown part' };
    }
    effects.sparkle(car.x, 1.5, car.z);
    sfx.pickup();
    if (world.save) world.save();
    return { ok: true };
  }

  return {
    nearGarage,
    items,
    buy,
    update(dt, world) {
      diamond.rotation.y += dt * 2;
      diamond.position.y = 4.2 + Math.sin(world.time * 2) * 0.3;
    },
  };
}
