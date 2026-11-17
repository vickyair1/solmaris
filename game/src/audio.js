// SOLMARIS — every sound is synthesized with WebAudio: no audio files, no
// network. Engine hum, sirens, gunshots and a small bass loop, all from
// oscillators and filtered noise. Starts on the first user gesture.

let ctx = null;
let master = null;
let muted = false;
let engineNodes = null;
let sirenNodes = null;
let musicTimer = null;
let musicStep = 0;

function ensureContext() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return false;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    return true;
  } catch {
    return false;
  }
}

/** Call from any click/key handler: browsers only allow audio after a gesture. */
export function unlockAudio() {
  if (ensureContext()) startMusic();
}

export function setMuted(value) {
  muted = value;
  if (master && ctx) master.gain.setValueAtTime(muted ? 0 : 0.5, ctx.currentTime);
}

export function isMuted() {
  return muted;
}

function tone(freq, dur, type, volume, slideTo) {
  if (!ensureContext()) return;
  const t0 = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain);
  gain.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noiseBurst(dur, volume, filterFreq, type = 'lowpass') {
  if (!ensureContext()) return;
  const t0 = ctx.currentTime;
  const length = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  source.connect(filter);
  filter.connect(gain);
  gain.connect(master);
  source.start(t0);
}

export const sfx = {
  click() {
    tone(880, 0.07, 'sine', 0.25);
  },
  shoot() {
    noiseBurst(0.12, 0.5, 1800, 'highpass');
    tone(160, 0.1, 'square', 0.2, 60);
  },
  enemyShoot() {
    noiseBurst(0.1, 0.22, 1400, 'highpass');
  },
  punch() {
    tone(120, 0.12, 'sine', 0.5, 50);
    noiseBurst(0.08, 0.25, 500);
  },
  pickup() {
    tone(660, 0.09, 'sine', 0.3);
    setTimeout(() => tone(990, 0.14, 'sine', 0.3), 90);
  },
  crash(strength = 1) {
    noiseBurst(0.25, 0.4 * strength, 700);
    tone(90, 0.2, 'sine', 0.4, 40);
  },
  explosion() {
    noiseBurst(0.8, 0.7, 300);
    tone(60, 0.7, 'sine', 0.6, 28);
  },
  reload() {
    tone(440, 0.05, 'square', 0.12);
    setTimeout(() => tone(330, 0.06, 'square', 0.12), 120);
  },
  missionStart() {
    tone(392, 0.12, 'triangle', 0.3);
    setTimeout(() => tone(523, 0.12, 'triangle', 0.3), 120);
    setTimeout(() => tone(659, 0.2, 'triangle', 0.3), 240);
  },
  missionComplete() {
    [523, 659, 784, 1047].forEach((f, i) => {
      setTimeout(() => tone(f, 0.22, 'triangle', 0.32), i * 130);
    });
  },
  missionFail() {
    [392, 330, 262].forEach((f, i) => {
      setTimeout(() => tone(f, 0.25, 'sawtooth', 0.15), i * 160);
    });
  },
  busted() {
    tone(220, 0.5, 'sawtooth', 0.2, 110);
  },
  checkpoint() {
    tone(784, 0.1, 'sine', 0.3);
    setTimeout(() => tone(1175, 0.16, 'sine', 0.3), 100);
  },
};

/** Continuous engine hum; pitch follows the car's speed. Call every frame. */
export function updateEngine(speed01, throttle, driving) {
  if (!ensureContext()) return;
  if (!driving) {
    if (engineNodes) {
      try {
        engineNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
      } catch { /* already stopped */ }
      const nodes = engineNodes;
      engineNodes = null;
      setTimeout(() => {
        try {
          nodes.osc.stop();
        } catch { /* already stopped */ }
      }, 400);
    }
    return;
  }
  if (!engineNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start();
    engineNodes = { osc, gain, filter };
  }
  const freq = 55 + speed01 * 130 + (throttle ? 12 : 0);
  engineNodes.osc.frequency.setTargetAtTime(freq, ctx.currentTime, 0.08);
  engineNodes.gain.gain.setTargetAtTime(0.05 + speed01 * 0.05 + (throttle ? 0.02 : 0), ctx.currentTime, 0.1);
}

/** Two-tone police siren loop while any police car is active. */
export function updateSiren(active, nearestDistance) {
  if (!ensureContext()) return;
  if (!active) {
    if (sirenNodes) {
      try {
        sirenNodes.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        const nodes = sirenNodes;
        sirenNodes = null;
        setTimeout(() => {
          try {
            nodes.osc.stop();
            nodes.lfo.stop();
          } catch { /* already stopped */ }
        }, 600);
      } catch { /* already stopped */ }
    }
    return;
  }
  if (!sirenNodes) {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 800;
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 0.7;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 160;
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);
    const gain = ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(master);
    osc.start();
    lfo.start();
    sirenNodes = { osc, lfo, gain };
  }
  const volume = Math.max(0.015, 0.09 * (1 - Math.min(1, nearestDistance / 120)));
  sirenNodes.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.3);
}

// ---- music: a tiny 8-step bass loop, low in the mix ------------------------
// Original pattern in A minor, written for this game.
const BASS_LINE = [55, 0, 55, 65.41, 0, 55, 82.41, 73.42];

function startMusic() {
  if (musicTimer !== null || !ctx) return;
  musicTimer = setInterval(() => {
    if (muted || !ctx) return;
    const freq = BASS_LINE[musicStep % BASS_LINE.length];
    musicStep += 1;
    if (freq > 0) tone(freq, 0.32, 'triangle', 0.1);
    // A soft hat tick on every other step.
    if (musicStep % 2 === 0) noiseBurst(0.03, 0.03, 6000, 'highpass');
  }, 210);
}
