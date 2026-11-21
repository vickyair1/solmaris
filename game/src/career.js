// SOLMARIS — the career: everything Riko has done, counted. Cars stolen,
// cops escaped, kilometres driven, Vultures taken out, the longest jump,
// abilities used, times the locals hid him, fares run, race golds, charms
// found, mission golds — plus a Gold/Silver/Bronze rating per mission
// (par time, no deaths for Gold) and the completion percentage that ties
// the whole game together: story 40%, races 10%, charms 10%, stunts 10%,
// friendly districts 10%, crew 10%, gold ratings 10%.
import { MISSIONS, MISSION_PARS, RACES, CHARMS, STUNT_RAMPS, CREW, DISTRICTS } from './config.js';

const MEDAL_RANK = { BRONZE: 1, SILVER: 2, GOLD: 3 };

export function createCareer() {
  const state = {
    carsStolen: 0,
    copsEscaped: 0,
    distanceDrivenKm: 0,
    peopleTakenOut: 0,
    longestJumpM: 0,
    abilitiesUsed: 0,
    hiddenByLocals: 0,
    faresCompleted: 0,
    racesGold: 0,
    charmsFound: 0,
    missionsGold: 0,
    highestWanted: 0,
    ratings: {}, // mission id -> 'GOLD' | 'SILVER' | 'BRONZE' (best so far)
  };

  /** Rate a finished mission: Gold at par with no deaths, Silver within
   * 1.5x par, Bronze otherwise. Keeps the best rating per mission. */
  function rateMission(missionId, seconds, deaths) {
    const par = MISSION_PARS[missionId] || 300;
    const rating = seconds <= par && deaths === 0 ? 'GOLD' : seconds <= par * 1.5 ? 'SILVER' : 'BRONZE';
    const prev = state.ratings[missionId];
    if (!prev || MEDAL_RANK[rating] > MEDAL_RANK[prev]) state.ratings[missionId] = rating;
    state.missionsGold = Object.values(state.ratings).filter((r) => r === 'GOLD').length;
    return rating;
  }

  function goldRatings() {
    return Object.values(state.ratings).filter((r) => r === 'GOLD').length;
  }

  /** The seven completion buckets, each with its weight and progress. */
  function completionParts(world) {
    const story = world.completedMissions.length;
    const racesGold = world.races
      ? Object.values(world.races.state.medals).filter((m) => m === 'GOLD').length : 0;
    const charms = world.collectibles ? world.collectibles.state.found.length : 0;
    const stunts = world.stunts ? world.stunts.state.cleared.length : 0;
    const districts = world.standing ? world.standing.friendlyCount() : 0;
    const crew = world.crew ? world.crew.state.recruited.length : 0;
    const gold = goldRatings();
    return [
      { id: 'story', label: 'Story missions', done: story, total: MISSIONS.length, weight: 40 },
      { id: 'races', label: 'Race golds', done: racesGold, total: RACES.length, weight: 10 },
      { id: 'charms', label: 'Sun charms', done: charms, total: CHARMS.length, weight: 10 },
      { id: 'stunts', label: 'Stunt jumps', done: stunts, total: STUNT_RAMPS.length, weight: 10 },
      { id: 'districts', label: 'Friendly districts', done: districts, total: DISTRICTS.length, weight: 10 },
      { id: 'crew', label: 'Crew recruited', done: crew, total: CREW.length, weight: 10 },
      { id: 'gold', label: 'Gold mission ratings', done: gold, total: MISSIONS.length, weight: 10 },
    ];
  }

  /** Completion percentage, one decimal. */
  function completionPercent(world) {
    let total = 0;
    for (const part of completionParts(world)) {
      total += (part.done / part.total) * part.weight;
    }
    return Math.round(total * 10) / 10;
  }

  return {
    state,
    rateMission,
    goldRatings,
    completionParts,
    completionPercent,
    update() {
      // Counters are pushed by the systems that own them; nothing ticks here.
    },
    reset() {
      state.carsStolen = 0;
      state.copsEscaped = 0;
      state.distanceDrivenKm = 0;
      state.peopleTakenOut = 0;
      state.longestJumpM = 0;
      state.abilitiesUsed = 0;
      state.hiddenByLocals = 0;
      state.faresCompleted = 0;
      state.racesGold = 0;
      state.charmsFound = 0;
      state.missionsGold = 0;
      state.highestWanted = 0;
      state.ratings = {};
    },
    serialize() {
      return {
        carsStolen: state.carsStolen,
        copsEscaped: state.copsEscaped,
        distanceDrivenKm: Math.round(state.distanceDrivenKm * 100) / 100,
        peopleTakenOut: state.peopleTakenOut,
        longestJumpM: state.longestJumpM,
        abilitiesUsed: state.abilitiesUsed,
        hiddenByLocals: state.hiddenByLocals,
        faresCompleted: state.faresCompleted,
        racesGold: state.racesGold,
        charmsFound: state.charmsFound,
        missionsGold: state.missionsGold,
        highestWanted: state.highestWanted,
        ratings: { ...state.ratings },
      };
    },
    apply(data) {
      this.reset();
      if (!data || typeof data !== 'object') return;
      for (const key of ['carsStolen', 'copsEscaped', 'peopleTakenOut', 'longestJumpM', 'abilitiesUsed', 'hiddenByLocals', 'faresCompleted', 'racesGold', 'charmsFound', 'missionsGold', 'highestWanted']) {
        if (typeof data[key] === 'number') state[key] = Math.max(0, data[key]);
      }
      if (typeof data.distanceDrivenKm === 'number') state.distanceDrivenKm = Math.max(0, data.distanceDrivenKm);
      if (data.ratings && typeof data.ratings === 'object') {
        for (const mission of MISSIONS) {
          if (['GOLD', 'SILVER', 'BRONZE'].includes(data.ratings[mission.id])) {
            state.ratings[mission.id] = data.ratings[mission.id];
          }
        }
        state.missionsGold = goldRatings();
      }
    },
  };
}
