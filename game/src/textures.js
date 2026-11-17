// SOLMARIS — every texture is drawn on a canvas at load time. No image files,
// no network: the whole city is procedural, so the entry stays one folder.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { mulberry32 } from './utils.js';

function canvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function hexCss(hex) {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

/** A building face: tinted concrete, a grid of windows, some lit, some dark. */
export function facadeTexture(baseHex, seed) {
  const rng = mulberry32(seed);
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = hexCss(baseHex);
    ctx.fillRect(0, 0, w, h);
    // Subtle vertical grime near the bottom.
    const grime = ctx.createLinearGradient(0, h * 0.7, 0, h);
    grime.addColorStop(0, 'rgba(0,0,0,0)');
    grime.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = grime;
    ctx.fillRect(0, h * 0.7, w, h * 0.3);
    // Window grid: 4 columns, 10 rows, with frames.
    const cols = 4;
    const rows = 10;
    const cellW = w / cols;
    const cellH = h / rows;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const x = c * cellW + 4;
        const y = r * cellH + 5;
        const ww = cellW - 8;
        const wh = cellH - 10;
        const roll = rng();
        if (roll < 0.18) ctx.fillStyle = '#ffe9a8'; // lit window
        else if (roll < 0.55) ctx.fillStyle = '#2e4a5e'; // dark glass
        else ctx.fillStyle = '#7fa8c0'; // sky reflection
        ctx.fillRect(x, y, ww, wh);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(x, y, ww, 3);
      }
    }
    // Ground floor: darker storefront band with an awning stripe.
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(0, h - 26, w, 26);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(0, h - 26, w, 3);
  });
}

/** Flat roof: dark membrane with vents and an AC unit or two. */
export function roofTexture(seed) {
  const rng = mulberry32(seed);
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#6a6258';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    for (let i = 0; i < 40; i += 1) {
      ctx.fillRect(rng() * w, rng() * h, 2 + rng() * 6, 2 + rng() * 6);
    }
    ctx.fillStyle = '#8a8478';
    ctx.fillRect(18, 20, 26, 18);
    ctx.fillRect(84, 70, 22, 30);
    ctx.fillStyle = '#4a4640';
    ctx.fillRect(24, 26, 14, 6);
    ctx.fillRect(90, 78, 10, 14);
  });
}

/**
 * Asphalt with a dashed centre line, tiled along a road strip. The dashes
 * run along the road's length, so east-west roads ('x') get horizontal
 * dashes and north-south roads ('z') get vertical ones — one texture for
 * both would stripe the road sideways.
 */
export function roadTexture(axis) {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = hexCss(0x3d4148);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 120; i += 1) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // Centre dashes along the road's length; edge lines parallel to them.
    if (axis === 'x') {
      ctx.fillStyle = '#d8d3a8';
      ctx.fillRect(8, h / 2 - 2, 40, 4);
      ctx.fillRect(80, h / 2 - 2, 40, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(0, 3, w, 2);
      ctx.fillRect(0, h - 5, w, 2);
    } else {
      ctx.fillStyle = '#d8d3a8';
      ctx.fillRect(w / 2 - 2, 8, 4, 40);
      ctx.fillRect(w / 2 - 2, 80, 4, 40);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillRect(3, 0, 2, h);
      ctx.fillRect(w - 5, 0, 2, h);
    }
  });
}

/** Sidewalk paving: light concrete with expansion joints. */
export function sidewalkTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = hexCss(0xb9b3a4);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath();
      ctx.moveTo(i * 32, 0);
      ctx.lineTo(i * 32, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 32);
      ctx.lineTo(w, i * 32);
      ctx.stroke();
    }
  });
}

/** Sand with a few speckles, for the south beach. */
export function sandTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = hexCss(0xe8d9a8);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,90,40,0.25)';
    for (let i = 0; i < 200; i += 1) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  });
}

/** Water: deep blue with soft moving-looking streaks (the plane also pulses). */
export function waterTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = hexCss(0x2e7fa8);
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i += 1) {
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 3;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y - 8, w * 0.6, y + 8, w, y);
      ctx.stroke();
    }
  });
}

/** Grass for parks: green with mow stripes. */
export function grassTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = hexCss(0x7fae5a);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < 4; i += 1) ctx.fillRect(0, i * 32, w, 16);
    ctx.fillStyle = 'rgba(0,60,0,0.12)';
    for (let i = 0; i < 90; i += 1) {
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  });
}

/** A big bold sign for a landmark building: POLICE, HOSPITAL, BANK, MARINA. */
export function signTexture(text, bgHex, fgHex) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = hexCss(bgHex);
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = hexCss(fgHex);
    ctx.font = 'bold 64px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.strokeStyle = hexCss(fgHex);
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  });
}

/** A soft round glow sprite for beacons, muzzle flashes and explosions. */
export function glowTexture() {
  return canvasTexture(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

/** Pre-built facade variants so buildings share a handful of materials. */
export function buildFacadeSet() {
  return PALETTE.building.map((hex, i) => facadeTexture(hex, 1000 + i * 77));
}
