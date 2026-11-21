// SOLMARIS — district standing: how each of the six neighbourhoods feels
// about Riko, 0-100, starting at a wary 50. Missions, fares and district
// jobs raise it; the label runs HOSTILE / WARY / NEUTRAL / FRIENDLY /
// BELOVED. Friendly streets hide you — wanted stars decay twice as fast
// there, and the locals count it. Hostile streets bring the law 15% closer.
import { DISTRICTS } from './config.js';
import { clamp } from './utils.js';

export const STANDING_LABELS = [
  { max: 24, name: 'HOSTILE' },
  { max: 44, name: 'WARY' },
  { max: 64, name: 'NEUTRAL' },
  { max: 84, name: 'FRIENDLY' },
  { max: 100, name: 'BELOVED' },
];

export function labelFor(value) {
  for (const entry of STANDING_LABELS) {
    if (value <= entry.max) return entry.name;
  }
  return 'BELOVED';
}

export function createStanding() {
  const state = { values: {} }; // district name -> 0..100; absent means 50

  function get(district) {
    const v = state.values[district];
    return typeof v === 'number' ? v : 50;
  }

  function label(district) {
    return labelFor(get(district));
  }

  function isFriendly(district) {
    return get(district) >= 65;
  }

  function friendlyCount() {
    let n = 0;
    for (const d of DISTRICTS) {
      if (isFriendly(d.name)) n += 1;
    }
    return n;
  }

  /** Heat decays this many times faster in a district (locals hide you). */
  function hideMultiplier(district) {
    return isFriendly(district) ? 2 : 1;
  }

  /** Police spawn this much closer in a hostile district. */
  function spawnDistanceFactor(district) {
    return get(district) < 25 ? 0.85 : 1;
  }

  /** Move a district's standing; flashes when the label changes. */
  function addStanding(district, amount, world) {
    const before = get(district);
    const beforeLabel = labelFor(before);
    const after = clamp(before + amount, 0, 100);
    state.values[district] = after;
    const afterLabel = labelFor(after);
    if (world && world.hud && afterLabel !== beforeLabel) {
      world.hud.flash(`${district}: ${afterLabel} (${Math.round(after)})`, afterLabel === 'HOSTILE' ? 'warning' : '');
    }
    return after;
  }

  return {
    state,
    get,
    label,
    isFriendly,
    friendlyCount,
    hideMultiplier,
    spawnDistanceFactor,
    addStanding,
    update() {
      // Standing only moves when something happens; nothing ticks here.
    },
    reset() {
      state.values = {};
    },
    serialize() {
      return { values: { ...state.values } };
    },
    apply(data) {
      this.reset();
      if (!data || typeof data !== 'object' || !data.values) return;
      for (const d of DISTRICTS) {
        if (typeof data.values[d.name] === 'number') {
          state.values[d.name] = clamp(data.values[d.name], 0, 100);
        }
      }
    },
  };
}
