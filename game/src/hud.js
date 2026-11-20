// SOLMARIS — the HUD: wanted stars, money, clock, mission objective, health
// and armour, the minimap, prompts and banners — plus the weapon slots and
// wheel, the respect bar, the police dispatch board, dialogue cards, the
// vehicle panel, and the shop/garage panels — plus the start screen, the
// pause menu and the mission briefing. All DOM over the 3D canvas.
import { ROAD_LINES, ROAD_W, CITY_HALF, WORLD_HALF, BEACH_Z, WATER_Z, MISSIONS, PLACES, WEAPONS, districtAt } from './config.js';
import { clockString, moneyString, dist2D } from './utils.js';
import { currentStation, audioUnlocked } from './audio.js';

const MAP_SIZE = 190;
const MAP_SCALE = MAP_SIZE / (WORLD_HALF * 2 + 16);

function $(id) {
  return document.getElementById(id);
}

export function createHUD(callbacks) {
  const minimap = $('minimap');
  const mapCtx = minimap.getContext('2d');
  let bannerTimer = null;
  let flashTimer = null;
  let dialogueTimer = null;
  let weaponSig = '';
  let dispatchSig = '';
  let wheelSig = '';
  let panelOpts = null;

  function toMapX(x) {
    return MAP_SIZE / 2 + x * MAP_SCALE;
  }
  function toMapZ(z) {
    return MAP_SIZE / 2 + z * MAP_SCALE;
  }

  function drawMinimap(world) {
    const ctx = mapCtx;
    const now = world.time;
    // City ground.
    ctx.fillStyle = '#16283a';
    ctx.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
    // Water and beach to the south.
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(0, toMapZ(WATER_Z), MAP_SIZE, MAP_SIZE - toMapZ(WATER_Z));
    ctx.fillStyle = '#c8b078';
    ctx.fillRect(0, toMapZ(BEACH_Z), MAP_SIZE, toMapZ(WATER_Z) - toMapZ(BEACH_Z));
    // Park block: one 44-unit block centred on (-29, -29).
    ctx.fillStyle = '#3f7a34';
    ctx.fillRect(toMapX(-51), toMapZ(-51), 44 * MAP_SCALE, 44 * MAP_SCALE);
    // Roads.
    ctx.strokeStyle = '#43566a';
    ctx.lineWidth = Math.max(3, ROAD_W * MAP_SCALE);
    for (const line of ROAD_LINES) {
      ctx.beginPath();
      ctx.moveTo(toMapX(-CITY_HALF - 10), toMapZ(line));
      ctx.lineTo(toMapX(CITY_HALF + 10), toMapZ(line));
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(toMapX(line), toMapZ(-CITY_HALF - 10));
      ctx.lineTo(toMapX(line), toMapZ(CITY_HALF + 10));
      ctx.stroke();
    }
    // Cars as small dots (traffic grey, police flashing).
    for (const car of world.vehicles.cars) {
      if (car.dead) continue;
      if (car.type === 'police') {
        ctx.fillStyle = Math.floor(now * 4) % 2 === 0 ? '#ff4040' : '#4080ff';
        ctx.beginPath();
        ctx.arc(toMapX(car.x), toMapZ(car.z), 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (car.role === 'player') {
        // The player's car is the player arrow; skip the dot.
      } else {
        ctx.fillStyle = 'rgba(200,200,200,0.5)';
        ctx.fillRect(toMapX(car.x) - 1, toMapZ(car.z) - 1, 2, 2);
      }
    }
    // Enemies.
    for (const enemy of world.combat.enemies) {
      if (enemy.dead) continue;
      ctx.fillStyle = '#ff3030';
      ctx.beginPath();
      ctx.arc(toMapX(enemy.x), toMapZ(enemy.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Police helicopter (cyan) and pickups (green health, blue armour).
    if (world.heli && world.heli.active) {
      ctx.fillStyle = '#40d0ff';
      ctx.beginPath();
      ctx.arc(toMapX(world.heli.state.x), toMapZ(world.heli.state.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (world.pickups) {
      for (const item of world.pickups.list) {
        if (!item.available) continue;
        ctx.fillStyle = item.kind === 'health' ? '#40d040' : '#4080ff';
        ctx.fillRect(toMapX(item.x) - 2, toMapZ(item.z) - 2, 4, 4);
      }
    }
    // Shops: $ Harbor Arms (gold), G North Garage (orange), H safehouse (green).
    ctx.font = 'bold 11px Arial, sans-serif';
    ctx.textAlign = 'center';
    for (const [place, color, glyph] of [
      [PLACES.gunshop, '#ffe93a', '$'],
      [PLACES.garage, '#ff9030', 'G'],
      [PLACES.safehouse, '#3aff88', 'H'],
    ]) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toMapX(place.x), toMapZ(place.z), 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111111';
      ctx.fillText(glyph, toMapX(place.x), toMapZ(place.z) + 4);
    }
    // Objective marker: pulsing diamond (yellow when a job is live, green
    // when idle — Mara's marina, or a fare already aboard the cab).
    const marker = world.missions.markerTarget()
      || (world.activities ? world.activities.markerTarget() : null);
    if (marker) {
      const pulse = 4 + Math.sin(now * 4) * 1.5;
      const fareWaiting = world.activities && world.activities.state.phase === 'waiting';
      ctx.fillStyle = (world.missions.state.active || fareWaiting) ? '#ffe93a' : '#3aff88';
      ctx.save();
      ctx.translate(toMapX(marker.x), toMapZ(marker.z));
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-pulse / 2, -pulse / 2, pulse, pulse);
      ctx.restore();
    }
    // Player arrow, rotated to the heading.
    const heading = world.player.state.inCar && world.player.state.car
      ? world.player.state.car.heading
      : world.player.state.heading;
    ctx.save();
    ctx.translate(toMapX(world.playerX), toMapZ(world.playerZ));
    ctx.rotate(heading);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#111111';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // North marker.
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', MAP_SIZE / 2, 11);
  }

  function setStars(wanted, hiding, now) {
    const stars = $('stars');
    let html = '';
    const blinkOff = hiding && Math.floor(now * 2.5) % 2 === 0;
    for (let i = 1; i <= 5; i += 1) {
      const lit = i <= wanted && !blinkOff;
      html += `<span class="star ${lit ? 'lit' : ''}">★</span>`;
    }
    stars.innerHTML = html;
  }

  /** The weapon slots under the money: key, name, ammo — or the price when
   * it is still on the shelf at Harbor Arms. Rebuilt only when it changes. */
  function updateWeapons(world) {
    const w = world.weapons;
    const sig = `${w.state.current}|${w.state.owned.join(',')}|${w.state.owned.map((id) => { const a = w.state.ammo[id]; return a ? `${a.mag}/${a.reserve}` : ''; }).join(',')}|${w.state.reloading}`;
    if (sig === weaponSig) return;
    weaponSig = sig;
    let html = '';
    for (const def of WEAPONS) {
      const owned = w.state.owned.includes(def.id);
      const sel = w.state.current === def.id;
      const ammo = w.state.ammo[def.id];
      const line = !owned
        ? `<div class="wprice">$${def.price.toLocaleString('en-US')}</div>`
        : def.id === 'fists'
          ? '<div class="wammo">∞</div>'
          : `<div class="wammo">${w.state.reloading && sel ? 'RELOADING' : `${ammo.mag} / ${ammo.reserve}`}</div>`;
      html += `<div class="wslot ${sel ? 'sel' : ''} ${owned ? '' : 'locked'}"><div class="wkey">${def.key}</div><div class="wname">${def.name}</div>${line}</div>`;
    }
    $('weapons').innerHTML = html;
  }

  /** The respect bar: rank, points, and the road to the next rank. */
  function updateRespect(world) {
    const r = world.respect;
    const rank = r.rank();
    const next = r.nextRank();
    $('respect-label').innerHTML = `${rank.name} <span class="rpts">${r.state.points}${next ? ` / ${next.at}` : ' — MAX'}</span>`;
    $('respect-fill').style.width = `${Math.round(r.progress() * 100)}%`;
  }

  /** The dispatch board: every responding unit, nearest first. Only while hot. */
  function updateDispatch(world) {
    const wanted = world.police.wanted;
    if (wanted === 0) {
      if (dispatchSig !== '') {
        dispatchSig = '';
        $('dispatch').innerHTML = '';
      }
      return;
    }
    const units = world.police.units(world);
    const sig = `${wanted}|${units.map((u) => `${u.name}:${u.dist}:${u.status}`).join(',')}`;
    if (sig === dispatchSig) return;
    dispatchSig = sig;
    let html = `<div class="disp-head">● SPD RESPONSE &nbsp; ${units.length} UNIT${units.length === 1 ? '' : 'S'} · CODE ${wanted}</div>`;
    for (const u of units.slice(0, 6)) {
      html += `<div class="disp-row"><span>${u.name}</span><span>${u.dist} m</span><span class="dstat ${u.status.replace(' ', '')}">${u.status}</span></div>`;
    }
    if (units.length > 6) html += `<div class="disp-row"><span>+${units.length - 6} more units</span><span></span><span></span></div>`;
    $('dispatch').innerHTML = html;
  }

  /** The vehicle panel: model, condition, speed and gear — only while driving. */
  function updateVehicle(world) {
    const car = world.player.state.inCar ? world.player.state.car : null;
    if (!car) {
      $('vehicle-name').textContent = '';
      $('speed').textContent = '';
      return;
    }
    const up = car.upgrades || {};
    const tuned = (up.engine || 0) > 0 || (up.armor || 0) > 0 || up.turbo ? ' ★' : '';
    $('vehicle-name').textContent = `${car.name}${tuned}`;
    const condition = Math.round(100 * (1 - car.damage / (car.maxDamage || 100)));
    const fill = $('condition-fill');
    fill.style.width = `${Math.max(0, condition)}%`;
    fill.className = `fill ${condition < 30 ? 'low' : ''}`;
    const kmh = Math.round(Math.abs(car.speed) * 3.6);
    const gear = kmh < 25 ? 'G1' : kmh < 50 ? 'G2' : kmh < 80 ? 'G3' : kmh < 115 ? 'G4' : 'G5';
    $('speed').textContent = `${gear} · ${kmh} km/h`;
  }

  /** The weapon wheel (Q): a radial picker over the action. */
  function updateWheel(world) {
    const w = world.weapons;
    const wheel = $('wheel');
    if (!w.state.wheelOpen) {
      if (wheelSig !== '') {
        wheelSig = '';
        wheel.classList.remove('show');
      }
      return;
    }
    const sig = `${w.state.current}|${w.state.owned.join(',')}`;
    if (sig === wheelSig && wheel.classList.contains('show')) return;
    wheelSig = sig;
    wheel.querySelectorAll('.wheel-slot').forEach((el) => el.remove());
    const angles = [-90, -18, 54, 126, 198];
    WEAPONS.forEach((def, i) => {
      const owned = w.state.owned.includes(def.id);
      const sel = w.state.current === def.id;
      const ammo = w.state.ammo[def.id];
      const a = (angles[i] * Math.PI) / 180;
      const el = document.createElement('div');
      el.className = `wheel-slot ${sel ? 'sel' : ''} ${owned ? '' : 'locked'}`;
      el.style.left = `${180 + Math.cos(a) * 132 - 56}px`;
      el.style.top = `${180 + Math.sin(a) * 132 - 30}px`;
      el.innerHTML = `<div class="wkey">${def.key}</div><div class="wname">${def.name}</div>${
        !owned ? `<div class="wprice">$${def.price.toLocaleString('en-US')}</div>`
          : def.id === 'fists' ? '<div class="wammo">∞</div>'
            : `<div class="wammo">${ammo.mag} / ${ammo.reserve}</div>`}`;
      if (owned) el.addEventListener('click', () => w.select(def.id, world));
      wheel.appendChild(el);
    });
    wheel.classList.add('show');
  }

  function update(dt, world) {
    if (!world.playing) return;
    setStars(world.police.wanted, world.police.hiding, world.time);
    const insight = $('insight');
    if (world.police.wanted === 0) {
      insight.textContent = '';
      insight.className = '';
    } else if (world.police.inSight) {
      insight.textContent = 'IN SIGHT — break line of sight';
      insight.className = 'seen';
    } else {
      insight.textContent = 'HIDDEN — stay out of sight';
      insight.className = 'hidden';
    }
    $('money').textContent = moneyString(world.money);
    $('clock').textContent = clockString(world.dayMinutes);
    $('radio').textContent = audioUnlocked()
      ? `♪ ${currentStation().name} — ${currentStation().desc}`
      : '';
    $('district').textContent = districtAt(world.playerX, world.playerZ);
    updateWeapons(world);
    updateRespect(world);
    updateDispatch(world);
    updateVehicle(world);
    updateWheel(world);
    let objective = world.missions.objectiveText();
    let marker = world.missions.markerTarget();
    let missionName = world.missions.state.active ? world.missions.currentMission().name : 'SOLMARIS';
    if (!world.missions.state.active && world.activities) {
      const fareText = world.activities.objectiveText();
      if (fareText) {
        objective = fareText;
        marker = world.activities.markerTarget();
        missionName = 'TAXI FARE';
      }
    }
    let objectiveHtml = `<div class="obj-mission">${missionName}</div><div class="obj-text">${objective}</div>`;
    if (marker) {
      const d = Math.round(dist2D(world.playerX, world.playerZ, marker.x, marker.z));
      objectiveHtml += `<div class="obj-dist">${d}m</div>`;
    }
    $('objective').innerHTML = objectiveHtml;
    const hp = world.player.state.health;
    const armor = world.player.state.armor;
    $('health-fill').style.width = `${hp}%`;
    $('health-fill').className = `fill ${hp < 30 ? 'low' : ''}`;
    $('armor-fill').style.width = `${armor}%`;
    $('armor-row').style.display = armor > 0 ? 'flex' : 'none';
    if (world.player.state.inCar) {
      $('ammo').textContent = '';
    } else {
      const def = world.weapons.current();
      const ammo = world.weapons.currentAmmo();
      $('ammo').textContent = ammo
        ? `🔫 ${def.name} — ${world.weapons.state.reloading ? 'RELOADING' : `${ammo.mag} / ${ammo.reserve}`}`
        : `🥊 ${def.name}`;
    }
    $('prompt').textContent = world.prompt || '';
    // Busted meter.
    const busted = world.police.bustedProgress;
    $('busted-meter').style.display = busted > 0 ? 'block' : 'none';
    $('busted-fill').style.width = `${busted * 100}%`;
    // Carjack progress.
    const jack = world.player.state.jack;
    $('jack-meter').style.display = jack ? 'block' : 'none';
    if (jack) $('jack-fill').style.width = `${Math.min(100, (jack.t / 0.9) * 100)}%`;
    // Damage vignette.
    const vignette = $('vignette');
    const sinceDamage = world.time - world.player.state.lastDamageAt;
    vignette.style.opacity = sinceDamage < 0.6 ? String(0.55 * (1 - sinceDamage / 0.6)) : hp < 30 ? '0.3' : '0';
    drawMinimap(world);
  }

  function showBanner(title, sub, seconds) {
    const banner = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub || '';
    banner.classList.add('show');
    if (bannerTimer) clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => banner.classList.remove('show'), seconds * 1000);
  }

  function flash(text, kind) {
    const el = $('flash');
    el.textContent = text;
    el.className = `show ${kind || ''}`;
    if (flashTimer) clearTimeout(flashTimer);
    flashTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /** The dialogue card: a character speaks. Seconds defaults to 6; staged
   * screenshots pass a long time so the card is still there at capture. */
  function showDialogue(name, role, line, color, seconds) {
    $('dlg-portrait').style.background = color || '#d88a2e';
    $('dlg-portrait').textContent = name.split(' ').map((w) => w[0]).join('').slice(0, 2);
    $('dlg-name').textContent = name;
    $('dlg-role').textContent = role || '';
    $('dlg-line').textContent = line;
    $('dialogue').classList.add('show');
    if (dialogueTimer) clearTimeout(dialogueTimer);
    dialogueTimer = setTimeout(() => $('dialogue').classList.remove('show'), (seconds || 6) * 1000);
  }

  /** A shop/garage panel. opts: { title, subtitle, getItems, getMoney, onBuy,
   * onClose }. Rows re-render after every purchase, so prices, locks and the
   * money line always match the game. */
  function openPanel(opts) {
    panelOpts = opts;
    $('shop-title').textContent = opts.title;
    $('shop-sub').textContent = opts.subtitle || '';
    const render = () => {
      $('shop-money').textContent = opts.getMoney ? opts.getMoney() : '';
      const rows = $('shop-rows');
      rows.innerHTML = '';
      for (const item of opts.getItems()) {
        const row = document.createElement('div');
        row.className = 'shop-row';
        const info = document.createElement('div');
        info.className = 'sinfo';
        const nm = document.createElement('div');
        nm.className = 'sname';
        nm.textContent = item.name;
        const ds = document.createElement('div');
        ds.className = 'sdesc';
        ds.textContent = item.locked ? (item.lockReason || 'Locked') : item.desc;
        info.append(nm, ds);
        const btn = document.createElement('button');
        btn.className = 'shop-buy';
        btn.textContent = item.owned ? 'OWNED' : item.locked ? 'LOCKED' : item.price > 0 ? `BUY $${item.price.toLocaleString('en-US')}` : 'DO IT';
        btn.disabled = !!(item.owned || item.locked);
        btn.addEventListener('click', () => {
          const res = opts.onBuy(item.id);
          if (!res.ok && res.reason && callbacks.onPanelMessage) callbacks.onPanelMessage(res.reason);
          render();
        });
        row.append(info, btn);
        rows.appendChild(row);
      }
    };
    render();
    $('shop-panel').classList.add('show');
  }

  function closePanel() {
    panelOpts = null;
    $('shop-panel').classList.remove('show');
  }

  function showBriefing(mission) {
    $('briefing-title').textContent = mission.name;
    $('briefing-giver').textContent = `From ${mission.giver} — Reward $${mission.reward.toLocaleString('en-US')}`;
    $('briefing-text').textContent = mission.briefing;
    $('briefing').classList.add('show');
  }

  function hideBriefing() {
    $('briefing').classList.remove('show');
  }

  function showMenu(saved, storyComplete) {
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
    $('btn-continue').style.display = saved ? 'block' : 'none';
    $('menu-complete').style.display = storyComplete ? 'block' : 'none';
    $('menu-missions').textContent = storyComplete
      ? `Story complete — all ${MISSIONS.length} missions done.`
      : `${MISSIONS.length - (saved ? saved.missionIndex : 0)} missions waiting in Solmaris.`;
  }

  function hideMenu() {
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
  }

  function showPause() {
    $('pause').classList.remove('hidden');
  }

  function hidePause() {
    $('pause').classList.add('hidden');
  }

  // Wire the buttons.
  $('btn-new').addEventListener('click', () => callbacks.onNewGame());
  $('btn-continue').addEventListener('click', () => callbacks.onContinue());
  $('btn-resume').addEventListener('click', () => callbacks.onResume());
  $('btn-restart').addEventListener('click', () => callbacks.onRestart());
  $('btn-title').addEventListener('click', () => callbacks.onTitle());
  $('btn-briefing-go').addEventListener('click', () => callbacks.onBriefingClose());
  $('btn-mute').addEventListener('click', () => callbacks.onMute());
  $('shop-close').addEventListener('click', () => callbacks.onPanelClose());

  return {
    update,
    showBanner,
    flash,
    showDialogue,
    openPanel,
    closePanel,
    showBriefing,
    hideBriefing,
    showMenu,
    hideMenu,
    showPause,
    hidePause,
    setMutedLabel(muted) {
      $('btn-mute').textContent = muted ? '🔇 Sound off' : '🔊 Sound on';
    },
  };
}
