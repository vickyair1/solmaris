// SOLMARIS — saving: money, mission progress, position, health and the clock,
// in localStorage. Autosaves on mission completion and when pausing; the
// start screen offers Continue whenever a save exists.
import { SAVE_KEY } from './config.js';

/** Read the save, or null when there is none (or it is corrupt). */
export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return null;
    return data;
  } catch {
    return null;
  }
}

/** Write the current game state. Never throws: a failed save must not crash play. */
export function writeSave(world) {
  try {
    const player = world.player.state;
    const data = {
      version: 1,
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
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch { /* storage unavailable; nothing to clear */ }
}

/** Apply a loaded save to a fresh world. */
export function applySave(world, data) {
  world.money = typeof data.money === 'number' ? data.money : 0;
  world.completedMissions = Array.isArray(data.completedMissions) ? data.completedMissions : [];
  world.missions.state.index = typeof data.missionIndex === 'number' ? data.missionIndex : 0;
  world.missions.state.active = false;
  world.dayMinutes = typeof data.dayMinutes === 'number' ? data.dayMinutes : 600;
  const player = world.player.state;
  player.health = typeof data.health === 'number' ? data.health : 100;
  player.armor = typeof data.armor === 'number' ? data.armor : 0;
  if (typeof data.playerX === 'number' && typeof data.playerZ === 'number') {
    world.player.teleport(data.playerX, data.playerZ, data.playerHeading || 0);
  }
}
