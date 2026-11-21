// SOLMARIS — the crew: three specialists who join Riko as the story lands.
// Nadia "Ghost" Rey drives, Iris "Eyes" Voss watches, Theo "Fix" Marlowe
// wrenches. Each brings one active ability on its own key (Z / C / X) with
// a real cooldown, and the HUD shows their cards on the right — locked,
// with the job that recruits them, until they join.
import { CREW } from './config.js';
import { sfx } from './audio.js';

export function crewDef(id) {
  return CREW.find((c) => c.id === id) || null;
}

export function createCrew() {
  const state = {
    recruited: [], // crew ids, in recruit order
    cooldowns: {}, // crew id -> game time when the ability is ready again
    abilitiesUsed: 0,
    overwatchUntil: 0, // game time; Iris's OVERWATCH marks the map until then
  };

  function isRecruited(id) {
    return state.recruited.includes(id);
  }

  function cooldownLeft(id, now) {
    return Math.max(0, (state.cooldowns[id] || 0) - now);
  }

  function overwatchActive(now) {
    return now < state.overwatchUntil;
  }

  /** Bring a crew member aboard. Returns false when they are already in. */
  function recruit(id, world) {
    const def = crewDef(id);
    if (!def || isRecruited(id)) return false;
    state.recruited.push(id);
    if (world && world.hud) {
      world.hud.flash(`CREW — ${def.name} joined (${def.role})`, '');
    }
    if (world && world.save) world.save();
    return true;
  }

  /** Why an ability cannot fire right now, or '' when it can. */
  function blockReason(id, world) {
    const def = crewDef(id);
    if (!def) return 'Unknown crew';
    if (!isRecruited(id)) return `${def.short} hasn't joined yet — ${def.recruitText}`;
    const left = cooldownLeft(id, world.time);
    if (left > 0) return `${def.ability} — ready in ${Math.ceil(left)}s`;
    if (id === 'nadia' && world.police.wanted === 0) return 'CLEAN PLATES needs heat — no wanted stars right now';
    if (id === 'theo' && !(world.player.state.inCar && world.player.state.car)) return 'FIELD REPAIR needs a car — get in one first';
    return '';
  }

  /** Fire a crew ability. Returns { ok, reason } — the HUD flashes the reason. */
  function useAbility(id, world) {
    const def = crewDef(id);
    if (!def) return { ok: false, reason: 'Unknown crew' };
    const blocked = blockReason(id, world);
    if (blocked) {
      if (world.hud) world.hud.flash(blocked, 'warning');
      return { ok: false, reason: blocked };
    }
    state.cooldowns[id] = world.time + def.cooldown;
    state.abilitiesUsed += 1;
    if (world.career) world.career.state.abilitiesUsed += 1;
    sfx.pickup();
    if (id === 'nadia') {
      world.police.setWanted(world.police.wanted - 1, world);
      if (world.hud) world.hud.flash('CLEAN PLATES — Ghost swapped the plates. One star down.', '');
    } else if (id === 'theo') {
      const car = world.player.state.car;
      car.damage = 0;
      if (world.effects) world.effects.sparkle(car.x, 1.5, car.z);
      if (world.hud) world.hud.flash('FIELD REPAIR — Fix patched her up. Full condition.', '');
    } else if (id === 'iris') {
      state.overwatchUntil = world.time + 20;
      if (world.hud) world.hud.flash('OVERWATCH — Eyes has the whole map for 20s.', '');
    }
    if (world.save) world.save();
    return { ok: true, reason: '' };
  }

  return {
    state,
    isRecruited,
    recruit,
    cooldownLeft,
    overwatchActive,
    blockReason,
    useAbility,
    /** Distance to the nearest police unit, for the OVERWATCH readout. */
    nearestPoliceDistance(world) {
      const d = world.police.nearestDistance(world.playerX, world.playerZ);
      return d === Infinity ? null : Math.round(d);
    },
    update() {
      // Cooldowns and OVERWATCH are game-clock timestamps; nothing ticks here.
    },
    reset() {
      state.recruited = [];
      state.cooldowns = {};
      state.abilitiesUsed = 0;
      state.overwatchUntil = 0;
    },
    serialize() {
      return {
        recruited: [...state.recruited],
        cooldowns: { ...state.cooldowns },
        abilitiesUsed: state.abilitiesUsed,
      };
    },
    apply(data) {
      this.reset();
      if (!data || typeof data !== 'object') return;
      if (Array.isArray(data.recruited)) {
        state.recruited = data.recruited.filter((id) => crewDef(id));
      }
      if (data.cooldowns && typeof data.cooldowns === 'object') state.cooldowns = { ...data.cooldowns };
      if (typeof data.abilitiesUsed === 'number') state.abilitiesUsed = Math.max(0, data.abilitiesUsed | 0);
    },
  };
}
