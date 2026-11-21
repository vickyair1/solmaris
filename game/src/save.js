// SOLMARIS — saving, v4: three slots, each holding money, mission
// progress, position, health, the clock, the arsenal, respect, the car
// parked in the safehouse garage — and the v4 systems: crew, district
// standing, races, sun charms, stunt jumps and the career (ratings included).
// Autosaves on mission completion and when pausing; the start screen shows
// all three slots with their metadata, and the pause menu's SAVE tab
// switches between them. v2 saves load fine — the new systems start fresh.
import { districtAt } from './config.js';

export const SAVE_VERSION = 4;
const SLOT_KEYS = ['solmaris-save-v4-1', 'solmaris-save-v4-2', 'solmaris-save-v4-3'];

export function slotKey(i) {
  const n = Math.min(3, Math.max(1, Math.floor(i) || 1));
  return SLOT_KEYS[n - 1];
}

/** Read one slot, or null when there is none (or it is corrupt). */
export function loadSlot(i) {
  try {
    const raw = window.localStorage.getItem(slotKey(i));
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

/** Metadata for a slot card: percent, missions, money, location, time. */
export function slotMeta(i) {
  const data = loadSlot(i);
  if (!data) return null;
  return {
    exists: true,
    percent: typeof data.percent === 'number' ? data.percent : 0,
    missions: Array.isArray(data.completedMissions) ? data.completedMissions.length : 0,
    money: typeof data.money === 'number' ? data.money : 0,
    location: typeof data.location === 'string' ? data.location : 'Solmaris',
    time: typeof data.savedAt === 'string' ? data.savedAt.slice(0, 10) : '',
  };
}

/** Write the current game state into one slot. Never throws. */
export function writeSlot(world, i) {
  try {
    const player = world.player.state;
    const data = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      money: Math.floor(world.money),
      missionIndex: world.missions.state.index,
      completedMissions: world.completedMissions,
      playerX: player.x,
      playerZ: player.z,
      playerHeading: player.heading,
      health: Math.max(1, Math.round(player.health)),
      armor: Math.round(player.armor),
      dayMinutes: Math.round(world.dayMinutes),
      weapons: world.weapons ? world.weapons.serialize() : null,
      respect: world.respect ? world.respect.serialize() : null,
      shops: world.shops ? world.shops.serialize() : null,
      crew: world.crew ? world.crew.serialize() : null,
      standing: world.standing ? world.standing.serialize() : null,
      races: world.races ? world.races.serialize() : null,
      collectibles: world.collectibles ? world.collectibles.serialize() : null,
      stunts: world.stunts ? world.stunts.serialize() : null,
      career: world.career ? world.career.serialize() : null,
      percent: world.career ? world.career.completionPercent(world) : 0,
      location: districtAt(world.playerX, world.playerZ),
    };
    window.localStorage.setItem(slotKey(i), JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSlot(i) {
  try {
    window.localStorage.removeItem(slotKey(i));
  } catch { /* storage unavailable; nothing to clear */ }
}

// ---- slot-1 aliases (the active slot is what the game writes) --------------
/** Read the save from the active slot (slot 1 by default). */
export function loadSave(world) {
  return loadSlot(world && world.activeSlot ? world.activeSlot : 1);
}

/** Write the current game state to the active slot. */
export function writeSave(world) {
  return writeSlot(world, world && world.activeSlot ? world.activeSlot : 1);
}

export function clearSave(world) {
  clearSlot(world && world.activeSlot ? world.activeSlot : 1);
}

/** Apply a loaded save to a fresh world. v2 saves (no v4 fields) load fine
 * — the new systems just start fresh, because apply(null) resets them. */
export function applySave(world, data) {
  world.money = typeof data.money === 'number' ? data.money : 0;
  world.completedMissions = Array.isArray(data.completedMissions) ? data.completedMissions : [];
  world.missions.state.index = typeof data.missionIndex === 'number' ? data.missionIndex : 0;
  world.missions.state.active = false;
  world.dayMinutes = typeof data.dayMinutes === 'number' ? data.dayMinutes : 600;
  const player = world.player.state;
  player.health = typeof data.health === 'number' ? data.health : 100;
  player.armor = typeof data.armor === 'number' ? data.armor : 0;
  if (world.weapons) world.weapons.apply(data.weapons || null);
  if (world.respect) world.respect.apply(data.respect || null);
  if (world.shops) world.shops.apply(data.shops || null);
  if (world.crew) world.crew.apply(data.crew || null);
  if (world.standing) world.standing.apply(data.standing || null);
  if (world.races) world.races.apply(data.races || null);
  if (world.collectibles) world.collectibles.apply(data.collectibles || null);
  if (world.stunts) world.stunts.apply(data.stunts || null);
  if (world.career) world.career.apply(data.career || null);
  if (typeof data.playerX === 'number' && typeof data.playerZ === 'number') {
    world.player.teleport(data.playerX, data.playerZ, data.playerHeading || 0);
  }
}
