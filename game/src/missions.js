// SOLMARIS — the story: eight missions for Mara, from a first fare to the big
// score. Each mission is a list of steps (drive somewhere, grab something,
// clear the Vultures out, outrun the law); a beacon in the world and a blip
// on the minimap always show where the job is.
import * as THREE from 'three';
import { MISSIONS, PLACES } from './config.js';
import { dist2D } from './utils.js';
import { sfx } from './audio.js';

// What Mara says when a job starts and when it lands. Shown on the dialogue
// card — the story's voice, not just a briefing screen.
const DIALOGUE = {
  'first-fare': {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'Drive clean, Riko. That crate is worth more than both of us.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'Clean run. You\'re hired, driver.', color: '#d88a2e' },
  },
  getaway: {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'My runner\'s cornered in the east alley. Get him out — and don\'t bring the law home.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'You lose cops like a bad habit. I like it.', color: '#d88a2e' },
  },
  'harbor-heat': {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'The Vultures took my ledger. Take it back — all of it.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'The harbour is mine again. Kestrel will hear about this.', color: '#d88a2e' },
  },
  'the-exchange': {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'Four checkpoints, one clock. The buyer doesn\'t wait.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'On time, every time. That\'s why I call you.', color: '#d88a2e' },
  },
  'night-shift': {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'Four drops, one night. The city sleeps — you don\'t.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'Every drop made. Even the night respects you now.', color: '#d88a2e' },
  },
  'rat-trap': {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'Kestrel\'s stash is sitting in that warehouse. Go collect it.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'Five Vultures down and the stash is home. Beautiful.', color: '#d88a2e' },
  },
  'bank-job': {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'The bank\'s cash drop, and the Vultures are already inside. Beat them to it.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'You robbed a bank before breakfast. Don\'t let it go to your head.', color: '#d88a2e' },
  },
  'the-big-score': {
    start: { name: 'Mara', role: 'FIXER · MARINA', line: 'The armoured truck. The harbour cash. This is the one, Riko.', color: '#d88a2e' },
    done: { name: 'Mara', role: 'FIXER · MARINA', line: 'It\'s done. Solmaris is yours now — all of it.', color: '#d88a2e' },
  },
};

export function createMissions(scene, effects) {
  // The beacon: a column of light, a ring on the ground, a spinning diamond.
  const beaconMat = new THREE.MeshBasicMaterial({
    color: 0xffe93a, transparent: true, opacity: 0.22,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 34, 12, 1, true), beaconMat);
  beacon.visible = false;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffe93a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.6, 3.4, 24), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.visible = false;
  const diamondMat = new THREE.MeshBasicMaterial({ color: 0xffe93a });
  const diamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.85), diamondMat);
  diamond.visible = false;
  scene.add(beacon, ring, diamond);

  const state = {
    index: 0, // next mission to run (0..7); 8 = story complete
    active: false,
    stepIndex: 0,
    kills: 0,
    killsNeeded: 0,
    timer: 0,
    checkpointIndex: 0,
    truck: null,
    startedAt: 0,
  };

  function currentMission() {
    return MISSIONS[state.index] || null;
  }

  function currentStep() {
    const mission = currentMission();
    return mission ? mission.steps[state.stepIndex] || null : null;
  }

  function stepTarget(step) {
    if (!step) return null;
    if (step.type === 'timed') {
      const key = step.checkpoints[state.checkpointIndex];
      return key ? PLACES[key] : null;
    }
    return PLACES[step.target] || null;
  }

  function setMarker(x, z, color) {
    beacon.visible = true;
    ring.visible = true;
    diamond.visible = true;
    beacon.position.set(x, 17, z);
    ring.position.set(x, 0.35, z);
    diamond.position.set(x, 4.5, z);
    beaconMat.color.setHex(color);
    ringMat.color.setHex(color);
    diamondMat.color.setHex(color);
  }

  function hideMarker() {
    beacon.visible = false;
    ring.visible = false;
    diamond.visible = false;
  }

  /** Where the current objective is, for the HUD and the minimap. */
  function markerTarget() {
    if (state.active) {
      const step = currentStep();
      if (!step) return null;
      if (step.type === 'escape') return null; // no place to go — just vanish
      return stepTarget(step);
    }
    if (state.index < MISSIONS.length) return PLACES.mara;
    return null;
  }

  function objectiveText() {
    if (state.active) {
      const mission = currentMission();
      const step = currentStep();
      if (!mission || !step) return '';
      let text = step.label;
      if (step.type === 'kill') text += ` — ${state.kills}/${state.killsNeeded}`;
      if (step.type === 'timed') text += ` — ${Math.max(0, Math.ceil(state.timer))}s`;
      return text;
    }
    if (state.index < MISSIONS.length) {
      return `Go to Mara at the marina to start: ${MISSIONS[state.index].name}`;
    }
    return 'Story complete — Solmaris is yours. Free roam.';
  }

  function startStep(world) {
    const step = currentStep();
    if (!step) return;
    if (step.type === 'kill') {
      state.kills = 0;
      state.killsNeeded = step.count;
      const base = stepTarget(step);
      const spots = [
        [base.x - 8, base.z - 4], [base.x + 8, base.z + 2],
        [base.x - 2, base.z + 10], [base.x + 12, base.z - 8],
        [base.x - 12, base.z + 8], [base.x + 4, base.z - 12],
      ];
      for (let i = 0; i < step.count; i += 1) {
        world.combat.makeEnemy(spots[i][0], spots[i][1]);
      }
      world.hud.flash(`Vultures at ${base.label} — ${step.count} hostiles`, 'warning');
    } else if (step.type === 'escape') {
      if (step.wanted > 0) world.police.setWanted(step.wanted, world);
      world.hud.flash('Lose the cops — break line of sight', 'warning');
    } else if (step.type === 'steal') {
      const base = stepTarget(step);
      if (!state.truck) {
        const truck = world.vehicles.makeCar('truck', 0x9aa0a8, base.x + 6, base.z + 2, Math.PI / 2, 'parked');
        truck.axis = 'x';
        truck.line = -58;
        truck.dir = 1;
        state.truck = truck;
      }
    } else if (step.type === 'timed') {
      state.timer = step.time;
      state.checkpointIndex = 0;
      world.hud.flash(`Clock's running — ${step.time}s for ${step.checkpoints.length} checkpoints`, 'warning');
    }
  }

  function advanceStep(world) {
    const mission = currentMission();
    state.stepIndex += 1;
    if (state.stepIndex >= mission.steps.length) {
      completeMission(world);
    } else {
      sfx.checkpoint();
      startStep(world);
    }
  }

  function completeMission(world) {
    const mission = currentMission();
    state.active = false;
    state.index += 1;
    state.stepIndex = 0;
    state.truck = null;
    world.money += mission.reward;
    world.completedMissions.push(mission.id);
    const rep = world.respect ? world.respect.add(world, mission.respect || 0, mission.name, true) : { rankUp: false };
    sfx.missionComplete();
    let sub = `+$${mission.reward.toLocaleString('en-US')}`;
    if (mission.respect) sub += ` · +${mission.respect} respect`;
    if (rep.rankUp) sub += ` · now ${rep.rank}`;
    world.hud.showBanner(`MISSION COMPLETE — ${mission.name}`, sub, 3.2);
    const line = DIALOGUE[mission.id] && DIALOGUE[mission.id].done;
    if (line) world.hud.showDialogue(line.name, line.role, line.line, line.color);
    if (state.index >= MISSIONS.length) {
      world.hud.showBanner('STORY COMPLETE', 'You own this city now, Riko.', 5);
    }
    if (world.save) world.save();
  }

  function failMission(world, reason) {
    if (!state.active) return;
    state.active = false;
    state.stepIndex = 0;
    state.checkpointIndex = 0;
    if (state.truck && !state.truck.dead) {
      world.vehicles.removeCar(state.truck);
      state.truck = null;
    }
    world.combat.clearEnemies();
    sfx.missionFail();
    world.hud.showBanner('MISSION FAILED', reason, 3.2);
  }

  function startMission(world) {
    const mission = currentMission();
    if (!mission || state.active) return false;
    // The finale is gated on respect: Mara only trusts a KINGPIN with it.
    if (mission.respectRequired && world.respect && world.respect.state.points < mission.respectRequired) {
      const need = mission.respectRequired - world.respect.state.points;
      world.hud.flash(`Mara: not yet — ${need} more respect before the Big Score. Missions, fares and getaways all pay.`, 'warning');
      world.hud.showDialogue('Mara', 'FIXER · MARINA', `The Big Score needs a KINGPIN, Riko. ${need} more respect and it's yours.`, '#d88a2e');
      return false;
    }
    state.active = true;
    state.stepIndex = 0;
    state.kills = 0;
    state.checkpointIndex = 0;
    state.startedAt = world.time;
    sfx.missionStart();
    world.hud.showBriefing(mission);
    const line = DIALOGUE[mission.id] && DIALOGUE[mission.id].start;
    if (line) world.hud.showDialogue(line.name, line.role, line.line, line.color);
    startStep(world);
    return true;
  }

  function update(dt, world) {
    const now = world.time;
    // Beacon pulse.
    if (beacon.visible) {
      beaconMat.opacity = 0.18 + Math.sin(now * 3) * 0.08;
      const pulse = 1 + Math.sin(now * 3) * 0.06;
      ring.scale.set(pulse, pulse, 1);
      diamond.rotation.y += dt * 2;
      diamond.position.y = 4.5 + Math.sin(now * 2) * 0.4;
    }
    // Idle: the start marker glows over Mara's marina.
    if (!state.active) {
      if (state.index < MISSIONS.length) {
        setMarker(PLACES.mara.x, PLACES.mara.z, 0x3aff88);
        if (world.interactPressed && dist2D(world.playerX, world.playerZ, PLACES.mara.x, PLACES.mara.z) < 8) {
          startMission(world);
        }
      } else {
        hideMarker();
      }
      return;
    }
    const step = currentStep();
    if (!step) return;
    const target = stepTarget(step);
    const px = world.playerX;
    const pz = world.playerZ;
    if (target && step.type !== 'escape') setMarker(target.x, target.z, 0xffe93a);
    else if (step.type === 'escape') hideMarker();

    if (step.type === 'goto') {
      if (dist2D(px, pz, target.x, target.z) < step.radius) {
        effects.sparkle(target.x, 1.5, target.z);
        advanceStep(world);
      }
    } else if (step.type === 'interact') {
      if (dist2D(px, pz, target.x, target.z) < step.radius && world.interactPressed) {
        effects.sparkle(target.x, 1.5, target.z);
        sfx.pickup();
        advanceStep(world);
      }
    } else if (step.type === 'kill') {
      if (state.kills >= state.killsNeeded) advanceStep(world);
    } else if (step.type === 'escape') {
      if (world.police.wanted === 0) advanceStep(world);
    } else if (step.type === 'steal') {
      const truck = state.truck;
      if (truck && world.player.state.inCar && world.player.state.car === truck) {
        world.police.setWanted(4, world);
        world.hud.flash('Four stars! Get to the hideout!', 'warning');
        advanceStep(world);
      } else if (truck && truck.dead) {
        failMission(world, 'The truck is scrap.');
      }
    } else if (step.type === 'timed') {
      state.timer -= dt;
      if (state.timer <= 0) {
        failMission(world, 'Out of time.');
        return;
      }
      if (target && dist2D(px, pz, target.x, target.z) < step.radius) {
        effects.sparkle(target.x, 1.5, target.z);
        sfx.checkpoint();
        state.checkpointIndex += 1;
        if (state.checkpointIndex >= step.checkpoints.length) {
          advanceStep(world);
        }
      }
    }
  }

  return {
    state,
    currentMission,
    currentStep,
    markerTarget,
    objectiveText,
    startMission,
    failMission,
    update,
    onEnemyKilled() {
      if (state.active && currentStep() && currentStep().type === 'kill') {
        state.kills += 1;
      }
    },
    reset() {
      state.index = 0;
      state.active = false;
      state.stepIndex = 0;
      state.kills = 0;
      state.checkpointIndex = 0;
      state.truck = null;
    },
  };
}
