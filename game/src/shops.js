// SOLMARIS — Harbor Arms and the safehouse. Dax sells iron at the gun shop
// (weapons, ammo, a vest, a medkit) — E on foot to browse. The safehouse is
// Riko's own place: patch up for free, save the game, and park a car in the
// garage so its upgrades survive the night. A stored car is the only car
// that comes back after a reload.
import * as THREE from 'three';
import { PLACES, WEAPONS, AMMO_PACKS, VEST_PRICE, MEDKIT_PRICE } from './config.js';
import { dist2D } from './utils.js';
import { sfx } from './audio.js';

const SHOP_RANGE = 8;
const SAFEHOUSE_RANGE = 9;
const RANK_NAMES = ['', 'RUNNER', 'HUSTLER', 'BIG SHOT', 'KINGPIN'];

export function createShops(scene, effects) {
  // Gold marker over Harbor Arms, green over the safehouse.
  const markers = [];
  for (const [place, color] of [[PLACES.gunshop, 0xffe93a], [PLACES.safehouse, 0x3aff88]]) {
    const mat = new THREE.MeshBasicMaterial({ color });
    const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), mat);
    diamond.position.set(place.x, 4.2, place.z);
    const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 20), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(place.x, 0.35, place.z);
    scene.add(diamond, ring);
    markers.push(diamond);
  }

  const state = { storedCar: null }; // { type, colorHex, upgrades, damage }

  function nearGunshop(world) {
    if (world.player.state.inCar) return false;
    return dist2D(world.playerX, world.playerZ, PLACES.gunshop.x, PLACES.gunshop.z) <= SHOP_RANGE;
  }

  function nearSafehouse(world) {
    return dist2D(world.playerX, world.playerZ, PLACES.safehouse.x, PLACES.safehouse.z) <= SAFEHOUSE_RANGE;
  }

  /** Harbor Arms' rows: weapons first, then ammo for what Riko owns, then kit. */
  function gunItems(world) {
    const rank = world.respect ? world.respect.rankIndex() : 0;
    const rows = [];
    for (const def of WEAPONS) {
      if (def.id === 'fists' || def.id === 'pistol') continue;
      const owned = world.weapons.state.owned.includes(def.id);
      rows.push({
        id: `weapon:${def.id}`,
        name: `${def.name} — ${def.short}`,
        desc: owned ? 'In the arsenal.' : `${def.desc} Mag ${def.mag} · damage ${def.damage}${def.pellets > 1 ? ` × ${def.pellets}` : ''}.`,
        price: def.price,
        owned,
        locked: !owned && rank < def.rank,
        lockReason: `Needs ${RANK_NAMES[def.rank]} respect`,
      });
    }
    for (const id of world.weapons.state.owned) {
      const pack = AMMO_PACKS[id];
      if (!pack) continue;
      const def = WEAPONS.find((w) => w.id === id);
      rows.push({
        id: `ammo:${id}`, name: `${def.name} ammo — ${pack.rounds} rounds`,
        desc: `Reserve now: ${world.weapons.state.ammo[id].reserve}.`, price: pack.price,
      });
    }
    const armor = world.player.state.armor;
    rows.push({
      id: 'vest', name: 'Armour vest — +50 armour',
      desc: armor >= 100 ? 'Armour is full.' : `Armour now: ${Math.round(armor)}.`,
      price: VEST_PRICE, owned: armor >= 100,
    });
    const health = world.player.state.health;
    rows.push({
      id: 'medkit', name: 'Medkit — full heal',
      desc: health >= 100 ? 'Health is full.' : `Health now: ${Math.round(health)}.`,
      price: MEDKIT_PRICE, owned: health >= 100,
    });
    return rows;
  }

  function buyGun(world, id) {
    if (id.startsWith('weapon:')) {
      const res = world.weapons.buy(id.slice(7), world);
      if (res.ok && world.save) world.save();
      return res;
    }
    if (id.startsWith('ammo:')) {
      const res = world.weapons.buyAmmo(id.slice(5), world);
      if (res.ok && world.save) world.save();
      return res;
    }
    if (id === 'vest') {
      if (world.player.state.armor >= 100) return { ok: false, reason: 'Armour is full' };
      if (world.money < VEST_PRICE) return { ok: false, reason: 'Not enough cash' };
      world.money -= VEST_PRICE;
      world.player.state.armor = Math.min(100, world.player.state.armor + 50);
      sfx.pickup();
      if (world.save) world.save();
      return { ok: true };
    }
    if (id === 'medkit') {
      if (world.player.state.health >= 100) return { ok: false, reason: 'Health is full' };
      if (world.money < MEDKIT_PRICE) return { ok: false, reason: 'Not enough cash' };
      world.money -= MEDKIT_PRICE;
      world.player.state.health = 100;
      sfx.pickup();
      if (world.save) world.save();
      return { ok: true };
    }
    return { ok: false, reason: 'Unknown item' };
  }

  /** The safehouse's rows: heal, save, and the garage slot. */
  function safehouseItems(world) {
    const rows = [];
    const hurt = world.player.state.health < 100 || world.player.state.armor < 100;
    rows.push({
      id: 'rest', name: 'Rest — patch up, free',
      desc: hurt ? 'Sleep it off: full health, full armour.' : 'Already fighting fit.',
      price: 0, owned: !hurt,
    });
    rows.push({ id: 'save', name: 'Save the game', desc: 'Writes the save now — money, missions, weapons, respect.', price: 0 });
    const inCar = world.player.state.inCar && world.player.state.car;
    if (inCar) {
      rows.push({
        id: 'store', name: 'Park this car in the garage',
        desc: state.storedCar ? 'Replaces the car already stored.' : 'Keeps its paint and upgrades, forever.',
        price: 0,
      });
      rows.push({ id: 'exitcar', name: 'Get out of the car', desc: 'Step out without parking it.', price: 0 });
    } else if (state.storedCar) {
      const c = state.storedCar;
      rows.push({
        id: 'retrieve', name: `Take the ${c.type === 'sports' ? 'Tempest GT' : c.type === 'truck' ? 'Bison Hauler' : c.type === 'taxi' ? 'Corvina Cab' : 'Corvina'} out`,
        desc: `Engine ${c.upgrades.engine || 0} · plating ${c.upgrades.armor || 0}${c.upgrades.turbo ? ' · turbo' : ''}.`,
        price: 0,
      });
    } else {
      rows.push({ id: 'retrieve', name: 'Garage is empty', desc: 'Drive a car you like here and park it.', price: 0, owned: true });
    }
    return rows;
  }

  function safehouseAction(world, id) {
    if (id === 'rest') {
      world.player.state.health = 100;
      world.player.state.armor = 100;
      sfx.pickup();
      if (world.save) world.save();
      return { ok: true };
    }
    if (id === 'save') {
      if (world.save) world.save();
      sfx.click();
      if (world.hud) world.hud.flash('Game saved', '');
      return { ok: true };
    }
    if (id === 'store') {
      const car = world.player.state.car;
      if (!car) return { ok: false, reason: 'No car to park' };
      state.storedCar = {
        type: car.type,
        colorHex: car.colorHex,
        upgrades: { ...(car.upgrades || { engine: 0, armor: 0, turbo: false }) },
        damage: 0,
      };
      world.player.exitCar();
      world.vehicles.removeCar(car);
      sfx.pickup();
      if (world.hud) world.hud.flash('Car parked — it will be here when you come back', '');
      if (world.save) world.save();
      return { ok: true };
    }
    if (id === 'retrieve') {
      if (!state.storedCar) return { ok: false, reason: 'Garage is empty' };
      const c = state.storedCar;
      state.storedCar = null;
      const spot = PLACES.safehouse;
      const car = world.vehicles.makeCar(c.type, c.colorHex, spot.x + 6, spot.z + 4, Math.PI / 2, 'parked');
      car.upgrades = { ...c.upgrades };
      car.maxDamage = [100, 150, 220][car.upgrades.armor || 0] || 100;
      car.axis = 'x';
      car.line = -116;
      car.dir = 1;
      world.player.enterCar(car); // "take the car out" means driving it, not fetching it
      sfx.pickup();
      if (world.save) world.save();
      return { ok: true };
    }
    return { ok: false, reason: 'Unknown action' };
  }

  return {
    state,
    nearGunshop,
    nearSafehouse,
    gunItems,
    buyGun,
    safehouseItems,
    safehouseAction,
    update(dt, world) {
      for (const m of markers) {
        m.rotation.y += dt * 2;
        m.position.y = 4.2 + Math.sin(world.time * 2) * 0.3;
      }
    },
    serialize() {
      return { storedCar: state.storedCar ? JSON.parse(JSON.stringify(state.storedCar)) : null };
    },
    apply(data) {
      if (data && data.storedCar && typeof data.storedCar === 'object') state.storedCar = data.storedCar;
    },
  };
}
