// SOLMARIS — respect: Riko's standing in the city. Missions, fares, kills
// and clean getaways all pay respect points; the rank they buy unlocks
// weapons at Harbor Arms, garage tiers at the North Garage, and the final
// mission itself. The HUD shows the rank and the bar to the next one.
import { RANKS } from './config.js';
import { sfx } from './audio.js';

export function createRespect() {
  const state = { points: 0 };

  function rankIndex() {
    let idx = 0;
    for (let i = 0; i < RANKS.length; i += 1) {
      if (state.points >= RANKS[i].at) idx = i;
    }
    return idx;
  }

  function rank() {
    return RANKS[rankIndex()];
  }

  function nextRank() {
    const idx = rankIndex();
    return idx + 1 < RANKS.length ? RANKS[idx + 1] : null;
  }

  /** Fraction of the way to the next rank (1 when maxed). */
  function progress() {
    const idx = rankIndex();
    if (idx + 1 >= RANKS.length) return 1;
    const cur = RANKS[idx].at;
    const nxt = RANKS[idx + 1].at;
    return Math.min(1, Math.max(0, (state.points - cur) / (nxt - cur)));
  }

  /** Award points. Returns { rankUp, rank } so callers (missions) can fold
   * the rank-up into their own banner instead of fighting over the screen.
   * quiet=true skips the flash/banner entirely — the caller reports it. */
  function add(world, amount, reason, quiet) {
    if (amount <= 0) return { rankUp: false, rank: rank().name };
    const before = rankIndex();
    state.points += amount;
    const after = rankIndex();
    const rankUp = after > before;
    if (!quiet) {
      if (rankUp) {
        sfx.missionComplete();
        if (world && world.hud) {
          world.hud.showBanner(`RESPECT — ${RANKS[after].name}`, reason || 'The city knows your name now.', 3);
        }
      } else if (world && world.hud && reason) {
        world.hud.flash(`+${amount} respect — ${reason}`, '');
      }
    }
    return { rankUp, rank: RANKS[after].name };
  }

  return {
    state,
    rankIndex,
    rank,
    nextRank,
    progress,
    add,
    serialize() {
      return { points: state.points };
    },
    apply(data) {
      if (data && typeof data.points === 'number') state.points = Math.max(0, Math.floor(data.points));
    },
  };
}
