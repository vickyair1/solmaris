// SOLMARIS — the arsenal: five weapon slots on a wheel (keys 1-5, Q to open
// it), bought at Harbor Arms and gated by respect rank. Fists are always
// there; the Sparrow 9 is Riko's carry pistol; the Hornet, Bulldog and
// Longshot are earned. Ammo is per weapon (magazine + reserve); R reloads
// from the reserve, and the shop sells more.
import { WEAPONS, AMMO_PACKS } from './config.js';
import { sfx } from './audio.js';

const RELOAD_TIME = 1.2;

export function weaponDef(id) {
  return WEAPONS.find((w) => w.id === id) || WEAPONS[0];
}

export function createWeapons() {
  const state = {
    current: 'pistol',
    owned: ['fists', 'pistol'],
    ammo: { pistol: { mag: 12, reserve: 72 } },
    reloading: false,
    reloadTimer: 0,
    wheelOpen: false,
  };

  function currentDef() {
    return weaponDef(state.current);
  }

  function currentAmmo() {
    return state.ammo[state.current] || null; // fists: no ammo at all
  }

  function select(id, world) {
    if (!state.owned.includes(id)) return false;
    if (state.current === id) return true;
    state.current = id;
    state.reloading = false;
    state.reloadTimer = 0;
    state.wheelOpen = false;
    if (world && world.hud) world.hud.flash(weaponDef(id).name, '');
    sfx.click();
    return true;
  }

  function selectByKey(code, world) {
    const def = WEAPONS.find((w) => `Digit${w.key}` === code);
    if (!def) return false;
    if (!state.owned.includes(def.id)) {
      if (world && world.hud) {
        const locked = world.respect && world.respect.rankIndex() < def.rank;
        world.hud.flash(locked ? `${def.name} — needs ${['', 'RUNNER', 'HUSTLER', 'BIG SHOT', 'KINGPIN'][def.rank]} respect` : `${def.name} — buy it at Harbor Arms`, 'warning');
      }
      return false;
    }
    return select(def.id, world);
  }

  function buy(id, world) {
    const def = weaponDef(id);
    if (state.owned.includes(id)) return { ok: false, reason: 'Already owned' };
    if (world.respect && world.respect.rankIndex() < def.rank) {
      return { ok: false, reason: `Needs ${['', 'RUNNER', 'HUSTLER', 'BIG SHOT', 'KINGPIN'][def.rank]} respect` };
    }
    if (world.money < def.price) return { ok: false, reason: 'Not enough cash' };
    world.money -= def.price;
    state.owned.push(id);
    state.ammo[id] = { mag: def.mag, reserve: def.startReserve || 0 };
    select(id, world);
    sfx.pickup();
    return { ok: true };
  }

  function buyAmmo(id, world) {
    const pack = AMMO_PACKS[id];
    if (!pack) return { ok: false, reason: 'No ammo for that' };
    if (!state.owned.includes(id)) return { ok: false, reason: 'Buy the weapon first' };
    if (world.money < pack.price) return { ok: false, reason: 'Not enough cash' };
    world.money -= pack.price;
    state.ammo[id].reserve += pack.rounds;
    sfx.pickup();
    return { ok: true };
  }

  function startReload(world) {
    const def = currentDef();
    const ammo = currentAmmo();
    if (!ammo || def.mag === 0) return false;
    if (state.reloading || ammo.mag >= def.mag || ammo.reserve <= 0) return false;
    state.reloading = true;
    state.reloadTimer = RELOAD_TIME;
    sfx.reload();
    return true;
  }

  function update(dt) {
    if (!state.reloading) return;
    state.reloadTimer -= dt;
    if (state.reloadTimer > 0) return;
    state.reloading = false;
    const def = currentDef();
    const ammo = currentAmmo();
    if (!ammo) return;
    const need = def.mag - ammo.mag;
    const take = Math.min(need, ammo.reserve);
    ammo.mag += take;
    ammo.reserve -= take;
  }

  return {
    state,
    def: weaponDef,
    current: currentDef,
    currentAmmo,
    select,
    selectByKey,
    buy,
    buyAmmo,
    startReload,
    update,
    /** One trigger pull from the current weapon; false when it cannot fire. */
    consumeShot() {
      const ammo = currentAmmo();
      if (!ammo) return true; // fists never run dry
      if (state.reloading || ammo.mag <= 0) return false;
      ammo.mag -= 1;
      return true;
    },
    serialize() {
      return {
        current: state.current,
        owned: [...state.owned],
        ammo: JSON.parse(JSON.stringify(state.ammo)),
      };
    },
    apply(data) {
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.owned)) state.owned = data.owned.filter((id) => WEAPONS.some((w) => w.id === id));
      if (!state.owned.includes('fists')) state.owned.unshift('fists');
      if (data.ammo && typeof data.ammo === 'object') {
        for (const id of state.owned) {
          if (data.ammo[id]) state.ammo[id] = { mag: data.ammo[id].mag | 0, reserve: data.ammo[id].reserve | 0 };
        }
      }
      if (typeof data.current === 'string' && state.owned.includes(data.current)) state.current = data.current;
    },
  };
}
