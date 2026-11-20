// SOLMARIS — the HUD: wanted stars, money, clock, mission objective, health
// and armour, the minimap, prompts and banners — plus the start screen, the
// pause menu and the mission briefing. All DOM over the 3D canvas.
import { ROAD_LINES, ROAD_W, CITY_HALF, WORLD_HALF, BEACH_Z, WATER_Z, MISSIONS, districtAt } from './config.js';
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

  function update(dt, world) {
    if (!world.playing) return;
    setStars(world.police.wanted, world.police.hiding, world.time);
    $('money').textContent = moneyString(world.money);
    $('clock').textContent = clockString(world.dayMinutes);
    $('radio').textContent = audioUnlocked()
      ? `♪ ${currentStation().name} — ${currentStation().desc}`
      : '';
    $('district').textContent = districtAt(world.playerX, world.playerZ);
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
    $('ammo').textContent = world.player.state.inCar
      ? ''
      : `🔫 ${world.player.state.reloading > 0 ? 'RELOADING' : `${world.player.state.ammo} / 12`}`;
    const speed = world.player.state.inCar && world.player.state.car
      ? Math.abs(world.player.state.car.speed) * 3.6
      : 0;
    $('speed').textContent = world.player.state.inCar ? `${Math.round(speed)} km/h` : '';
    $('prompt').textContent = world.prompt || '';
    // Busted meter.
    const busted = world.police.bustedProgress;
    $('busted-meter').style.display = busted > 0 ? 'block' : 'none';
    $('busted-fill').style.width = `${busted * 100}%`;
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

  return {
    update,
    showBanner,
    flash,
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
