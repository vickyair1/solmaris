// SOLMARIS — the pause menu: five tabs over the frozen game. MAP is the
// big city map with district standing and a click-to-set waypoint; STORY
// lists the eight missions under their three acts with ratings; STATS is
// the career page (completion ring, checklist, medals, rank, stats grid);
// CREW shows the three specialists; SAVE holds the three save slots.
// Q/E switch tabs, Esc/P resumes. The menu owns the #pause overlay; the
// HUD's showPause/hidePause delegate here once it is registered.
import {
  MISSIONS, ACTS, PLACES, DISTRICTS, RACES, CREW, ROAD_LINES, ROAD_W,
  CITY_HALF, WORLD_HALF, BEACH_Z, WATER_Z, districtAt,
} from './config.js';
import { clockString, moneyString, dist2D } from './utils.js';
import { slotMeta } from './save.js';

const TABS = ['map', 'story', 'stats', 'crew', 'save'];
const TAB_LABELS = { map: 'MAP', story: 'STORY', stats: 'STATS', crew: 'CREW', save: 'SAVE' };

function $(id) {
  return document.getElementById(id);
}

function medalHtml(rating) {
  if (!rating) return '<span class="medal none">—</span>';
  return `<span class="medal ${rating.toLowerCase()}">${rating}</span>`;
}

/** A district's centre on the map, for its label. */
function districtCentre(d) {
  return { x: (d.x0 + d.x1) / 2, z: (d.z0 + d.z1) / 2 };
}

export function createPauseMenu(callbacks) {
  let currentTab = 'map';
  let lastTab = 'map';
  let worldRef = null;
  let openFlag = false;

  /** The big map: the minimap's drawing scaled up, with district names,
   * standing labels, markers (Mara M, shops $/G/H, races R, jobs J),
   * the waypoint, and the race route line. */
  function drawBigMap(canvas, world) {
    const size = canvas.width;
    const scale = size / (WORLD_HALF * 2 + 16);
    const ctx = canvas.getContext('2d');
    const toX = (x) => size / 2 + x * scale;
    const toZ = (z) => size / 2 + z * scale;
    ctx.fillStyle = '#16283a';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, toZ(WATER_Z), size, size - toZ(WATER_Z));
    ctx.fillStyle = '#c8b078';
    ctx.fillRect(0, toZ(BEACH_Z), size, toZ(WATER_Z) - toZ(BEACH_Z));
    ctx.fillStyle = '#3f7a34';
    ctx.fillRect(toX(-51), toZ(-51), 44 * scale, 44 * scale);
    ctx.strokeStyle = '#43566a';
    ctx.lineWidth = Math.max(2, ROAD_W * scale);
    for (const line of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(toX(-CITY_HALF - 10), toZ(line));
      ctx.lineTo(toX(CITY_HALF + 10), toZ(line));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toX(line), toZ(-CITY_HALF - 10));
      ctx.lineTo(toX(line), toZ(CITY_HALF + 10));
      ctx.stroke();
    }
    // District names + standing labels.
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      const c = districtCentre(d);
      const standing = world.standing ? world.standing.get(d.name) : 50;
      const label = world.standing ? world.standing.label(d.name) : 'NEUTRAL';
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.max(10, size * 0.028)}px Arial, sans-serif`;
      ctx.fillText(d.name.toUpperCase(), toX(c.x), toZ(c.z));
      ctx.fillStyle = standing >= 65 ? '#7ddb6a' : standing < 25 ? '#ff6060' : '#bcd';
      ctx.font = `${Math.max(9, size * 0.022)}px Arial, sans-serif`;
      ctx.fillText(`${label} ${Math.round(standing)}`, toX(c.x), toZ(c.z) + size * 0.035);
    }
    // Route line: the race's remaining checkpoints, or the waypoint.
    ctx.strokeStyle = '#40d0ff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    if (world.races && world.races.state.active) {
      const race = world.races.currentRace();
      ctx.beginPath();
      ctx.moveTo(toX(world.playerX), toZ(world.playerZ));
      for (let i = world.races.state.checkpointIndex; i < race.checkpoints.length; i += 1) {
        const p = PLACES[race.checkpoints[i]];
        ctx.lineTo(toX(p.x), toZ(p.z));
      }
      ctx.stroke();
    } else if (world.waypoint) {
      ctx.beginPath();
      ctx.moveTo(toX(world.playerX), toZ(world.playerZ));
      ctx.lineTo(toX(world.waypoint.x), toZ(world.waypoint.z));
      ctx.stroke();
    }
    ctx.setLineDash([]);
    // Markers.
    ctx.font = `bold ${Math.max(11, size * 0.03)}px Arial, sans-serif`;
    const glyph = (x, z, color, text) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toX(x), toZ(z), Math.max(6, size * 0.016), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.fillText(text, toX(x), toZ(z) + Math.max(4, size * 0.011));
    };
    glyph(PLACES.mara.x, PLACES.mara.z, world.missions.state.active ? '#ffe93a' : '#3aff88', 'M');
    glyph(PLACES.gunshop.x, PLACES.gunshop.z, '#ffe93a', '$');
    glyph(PLACES.garage.x, PLACES.garage.z, '#ff9030', 'G');
    glyph(PLACES.safehouse.x, PLACES.safehouse.z, '#3aff88', 'H');
    for (const race of RACES) {
      const p = PLACES[race.start];
      glyph(p.x, p.z, '#40d0ff', 'R');
    }
    if (world.activities && world.activities.jobMarkerTarget) {
      const job = world.activities.jobMarkerTarget();
      if (job) glyph(job.x, job.z, '#ff9030', 'J');
    }
    // Objective marker (mission / fare / race checkpoint).
    const marker = (world.races && world.races.markerTarget())
      || world.missions.markerTarget()
      || (world.activities ? world.activities.markerTarget() : null);
    if (marker) {
      const pulse = Math.max(5, size * 0.014);
      ctx.fillStyle = '#ffe93a';
      ctx.save();
      ctx.translate(toX(marker.x), toZ(marker.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      ctx.restore();
    }
    // Waypoint diamond.
    if (world.waypoint) {
      const s = Math.max(6, size * 0.016);
      ctx.fillStyle = '#40d0ff';
      ctx.save();
      ctx.translate(toX(world.waypoint.x), toZ(world.waypoint.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-s / 2, -s / 2, s, s);
      ctx.restore();
    }
    // Player arrow.
    const heading = world.player.state.inCar && world.player.state.car
      ? world.player.state.car.heading
      : world.player.state.heading;
    ctx.save();
    ctx.translate(toX(world.playerX), toZ(world.playerZ));
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 7);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Arial, sans-serif';
    ctx.fillText('N', size / 2, 14);
  }

  function wireMapClick(canvas, world) {
    canvas.addEventListener('click', (event) => {
      const rect = canvas.getBoundingClientRect();
      const size = canvas.width;
      const scale = size / (WORLD_HALF * 2 + 16);
      const px = ((event.clientX - rect.left) / rect.width) * size;
      const pz = ((event.clientY - rect.top) / rect.height) * size;
      const x = Math.round((px - size / 2) / scale);
      const z = Math.round((pz - size / 2) / scale);
      world.waypoint = { x, z };
      drawBigMap(canvas, world);
      const wp = $('waypoint-line');
      if (wp) {
        const d = Math.round(dist2D(world.playerX, world.playerZ, x, z));
        wp.textContent = `Waypoint set — ${districtAt(x, z)} · ${d}m away`;
      }
    });
  }

  function renderMapTab(world, body) {
    const wp = world.waypoint;
    const wpText = wp
      ? `Waypoint set — ${districtAt(wp.x, wp.z)} · ${Math.round(dist2D(world.playerX, world.playerZ, wp.x, wp.z))}m away`
      : 'Click the map to set a waypoint.';
    let districtsHtml = '';
    for (const d of DISTRICTS) {
      const value = world.standing ? world.standing.get(d.name) : 50;
      const label = world.standing ? world.standing.label(d.name) : 'NEUTRAL';
      districtsHtml += `<div class="stand-row"><span class="stand-name">${d.name}</span><div class="bar"><div class="fill" style="width:${Math.round(value)}%"></div></div><span class="stand-val">${label} ${Math.round(value)}</span></div>`;
    }
    body.innerHTML = `
      <div class="pause-map-wrap">
        <canvas id="pause-map" width="460" height="460"></canvas>
        <div class="pause-map-side">
          <div class="pause-section-title">DISTRICT STANDING</div>
          ${districtsHtml}
          <div id="waypoint-line" class="waypoint-line">${wpText}</div>
          <button id="btn-clear-wp" class="menu-btn secondary small">Clear waypoint</button>
          <div class="map-legend">M Mara · $ Harbor Arms · G North Garage · H Safehouse<br>R Street race · J District job · ◆ Waypoint</div>
        </div>
      </div>`;
    const canvas = $('pause-map');
    drawBigMap(canvas, world);
    wireMapClick(canvas, world);
    $('btn-clear-wp').addEventListener('click', () => {
      world.waypoint = null;
      render(world);
    });
  }

  function renderStoryTab(world, body) {
    let html = '';
    for (const act of ACTS) {
      html += `<div class="act-head">${act.name}</div>`;
      for (let i = act.from; i <= act.to; i += 1) {
        const mission = MISSIONS[i];
        const done = world.completedMissions.includes(mission.id);
        const active = world.missions.state.active && world.missions.state.index === i;
        const status = done ? 'DONE' : active ? 'ACTIVE' : i < world.missions.state.index ? 'DONE' : i === world.missions.state.index ? 'READY' : 'LOCKED';
        const rating = world.career ? world.career.state.ratings[mission.id] : null;
        html += `<div class="story-row ${active ? 'active' : ''}"><span class="story-name">${i + 1}. ${mission.name}</span>${medalHtml(rating)}<span class="story-reward">$${mission.reward.toLocaleString('en-US')}</span><span class="story-status ${status.toLowerCase()}">${status}</span></div>`;
      }
    }
    body.innerHTML = `<div class="pause-section-title">THE STORY — ${world.completedMissions.length}/${MISSIONS.length} MISSIONS</div>${html}`;
  }

  function renderStatsTab(world, body) {
    const career = world.career;
    const pct = career ? career.completionPercent(world) : 0;
    const parts = career ? career.completionParts(world) : [];
    const ringC = 2 * Math.PI * 52;
    const ringOff = ringC * (1 - pct / 100);
    let checklist = '';
    for (const part of parts) {
      const frac = part.total ? part.done / part.total : 0;
      checklist += `<div class="check-row"><span class="check-label">${part.label}</span><div class="bar"><div class="fill" style="width:${Math.round(frac * 100)}%"></div></div><span class="check-val">${part.done}/${part.total}</span></div>`;
    }
    let medals = '';
    for (const mission of MISSIONS) {
      const rating = career ? career.state.ratings[mission.id] : null;
      medals += `<span class="medal-cell" title="${mission.name}">${medalHtml(rating)}</span>`;
    }
    const rank = world.respect.rank();
    const next = world.respect.nextRank();
    const rp = world.respect.state.points;
    const progress = Math.round(world.respect.progress() * 100);
    const s = career ? career.state : {};
    const stats = [
      ['Cars stolen', s.carsStolen || 0],
      ['Cops escaped', s.copsEscaped || 0],
      ['Highest wanted', s.highestWanted || 0],
      ['Distance driven', `${(s.distanceDrivenKm || 0).toFixed(1)} km`],
      ['People taken out', s.peopleTakenOut || 0],
      ['Longest jump', `${s.longestJumpM || 0}m`],
      ['Abilities used', s.abilitiesUsed || 0],
      ['Hidden by locals', s.hiddenByLocals || 0],
      ['Fares completed', s.faresCompleted || 0],
      ['Race golds', s.racesGold || 0],
      ['Sun charms', s.charmsFound || 0],
      ['Mission golds', s.missionsGold || 0],
    ];
    let statsHtml = '';
    for (const [label, value] of stats) {
      statsHtml += `<div class="stat-cell"><div class="stat-val">${value}</div><div class="stat-label">${label}</div></div>`;
    }
    let slotsHtml = '';
    for (let i = 1; i <= 3; i += 1) {
      const meta = slotMeta(i);
      slotsHtml += `<div class="slot-mini"><span>SLOT ${i}</span><span>${meta ? `${meta.percent}% · ${meta.missions}/${MISSIONS.length} missions · ${moneyString(meta.money)}` : 'Empty'}</span></div>`;
    }
    body.innerHTML = `
      <div class="pause-stats">
        <div class="stats-col">
          <div class="ring-wrap">
            <svg width="130" height="130" viewBox="0 0 130 130">
              <circle cx="65" cy="65" r="52" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="10"/>
              <circle cx="65" cy="65" r="52" fill="none" stroke="#ffe93a" stroke-width="10" stroke-linecap="round"
                stroke-dasharray="${ringC.toFixed(1)}" stroke-dashoffset="${ringOff.toFixed(1)}" transform="rotate(-90 65 65)"/>
            </svg>
            <div class="ring-num">${pct.toFixed(1)}%</div>
            <div class="ring-label">COMPLETE</div>
          </div>
          ${checklist}
          <div class="pause-section-title" style="margin-top:14px">MISSION RATINGS</div>
          <div class="medals-row">${medals}</div>
        </div>
        <div class="stats-col center">
          <canvas id="pause-map-stats" width="300" height="300"></canvas>
          <div class="map-legend">${districtAt(world.playerX, world.playerZ)} · ${clockString(world.dayMinutes)} · ${moneyString(world.money)}</div>
        </div>
        <div class="stats-col">
          <div class="pause-section-title">RANK — ${rank.name}</div>
          <div class="rp-line">${rp}${next ? ` / ${next.at} RP` : ' — MAX'}</div>
          <div class="bar"><div class="fill" style="width:${progress}%"></div></div>
          <div class="pause-section-title" style="margin-top:14px">CAREER</div>
          <div class="stats-grid">${statsHtml}</div>
          <div class="pause-section-title" style="margin-top:14px">SAVE SLOTS</div>
          ${slotsHtml}
        </div>
      </div>`;
    const canvas = $('pause-map-stats');
    drawBigMap(canvas, world);
    wireMapClick(canvas, world);
  }

  function renderCrewTab(world, body) {
    let html = '';
    for (const def of CREW) {
      const recruited = world.crew ? world.crew.isRecruited(def.id) : false;
      const left = world.crew ? world.crew.cooldownLeft(def.id, world.time) : 0;
      const cdText = !recruited ? 'LOCKED' : left > 0 ? `${Math.ceil(left)}s` : 'READY';
      const cdClass = !recruited ? 'locked' : left > 0 ? 'cooling' : 'ready';
      html += `<div class="crew-card ${recruited ? '' : 'locked'}">
        <div class="crew-portrait" style="background:${def.color}">${def.short.slice(0, 1)}</div>
        <div class="crew-info">
          <div class="crew-name">${def.name}</div>
          <div class="crew-role">${def.role}</div>
          <div class="crew-ability">${def.ability} [${def.keyLabel}] — ${def.desc}</div>
          <div class="crew-status ${cdClass}">${recruited ? cdText : `Recruit: ${def.recruitText}`}</div>
        </div>
      </div>`;
    }
    body.innerHTML = `<div class="pause-section-title">THE CREW — ${world.crew ? world.crew.state.recruited.length : 0}/${CREW.length} RECRUITED</div>${html}`;
  }

  function renderSaveTab(world, body) {
    let html = '';
    for (let i = 1; i <= 3; i += 1) {
      const meta = slotMeta(i);
      const active = (world.activeSlot || 1) === i;
      html += `<div class="save-slot ${active ? 'active' : ''}">
        <div class="save-slot-head"><span>SLOT ${i}${active ? ' · ACTIVE' : ''}</span></div>
        <div class="save-slot-meta">${meta
          ? `${meta.percent}% complete · ${meta.missions}/${MISSIONS.length} missions · ${meta.location} · ${moneyString(meta.money)} · ${meta.time}`
          : 'Empty slot — nothing saved yet.'}</div>
        <div class="save-slot-btns">
          <button class="menu-btn small" data-save="${i}">Save here</button>
          <button class="menu-btn secondary small" data-load="${i}" ${meta ? '' : 'disabled'}>Load</button>
        </div>
      </div>`;
    }
    body.innerHTML = `<div class="pause-section-title">SAVE SLOTS</div>${html}
      <div class="pause-section-title" style="margin-top:16px">CONTROLS</div>
      <div class="controls" style="margin-top:6px;text-align:left">
        <b>WASD</b> move / drive · <b>Mouse</b> camera · <b>Click</b> shoot · <b>F</b> punch<br>
        <b>1–6</b> weapons · <b>Q</b> weapon wheel · <b>R</b> reload · <b>E</b> enter / jack car, talk, shop, start race<br>
        <b>Z / X / C</b> crew abilities · <b>Shift</b> run · <b>Space</b> jump / handbrake<br>
        <b>N</b> radio · <b>M</b> map · <b>P / Esc</b> pause · progress autosaves
      </div>`;
    body.querySelectorAll('[data-save]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (callbacks.onSaveSlot) callbacks.onSaveSlot(Number(btn.dataset.save));
        render(world);
      });
    });
    body.querySelectorAll('[data-load]').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (callbacks.onLoadSlot) callbacks.onLoadSlot(Number(btn.dataset.load));
      });
    });
  }

  function render(world) {
    worldRef = world;
    const body = $('pause-body');
    if (!body) return;
    document.querySelectorAll('#pause-tabs button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === currentTab);
    });
    if (currentTab === 'map') renderMapTab(world, body);
    else if (currentTab === 'story') renderStoryTab(world, body);
    else if (currentTab === 'stats') renderStatsTab(world, body);
    else if (currentTab === 'crew') renderCrewTab(world, body);
    else if (currentTab === 'save') renderSaveTab(world, body);
  }

  function open(world, tab) {
    if (tab && TABS.includes(tab)) currentTab = tab;
    else currentTab = lastTab;
    lastTab = currentTab;
    openFlag = true;
    render(world);
    $('pause').classList.remove('hidden');
  }

  function close() {
    openFlag = false;
    $('pause').classList.add('hidden');
  }

  function setTab(tab) {
    if (!TABS.includes(tab)) return;
    currentTab = tab;
    lastTab = tab;
    if (worldRef) render(worldRef);
  }

  function cycleTab(dir) {
    const idx = TABS.indexOf(currentTab);
    const next = TABS[(idx + dir + TABS.length) % TABS.length];
    setTab(next);
  }

  // Tab buttons.
  document.querySelectorAll('#pause-tabs button').forEach((btn) => {
    btn.addEventListener('click', () => setTab(btn.dataset.tab));
  });

  return {
    open,
    close,
    render,
    setTab,
    cycleTab,
    get currentTab() {
      return currentTab;
    },
    get lastTab() {
      return lastTab;
    },
    get isOpen() {
      return openFlag;
    },
    drawBigMap,
  };
}
