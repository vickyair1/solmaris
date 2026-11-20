// SOLMARIS — pickups: health crosses and armour vests at fixed spots around
// the city (hospital, police HQ, marina, bank, safehouse, garage). Walk over
// one to collect it; it comes back after 45 seconds. Armour previously had
// no way to be earned at all — now the vest on the HUD means something.
import * as THREE from 'three';
import { PLACES, PLAYER } from './config.js';
import { dist2D } from './utils.js';
import { sfx } from './audio.js';

const SPOTS = [
  { place: 'hospital', kind: 'health' },
  { place: 'policeStation', kind: 'armor' },
  { place: 'marina', kind: 'health' },
  { place: 'bank', kind: 'armor' },
  { place: 'safehouse', kind: 'health' },
  { place: 'garage', kind: 'armor' },
];
const RESPAWN = 45;

export function createPickups(scene, effects) {
  const list = [];
  const healthMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x30c030, emissiveIntensity: 0.7, roughness: 0.4 });
  const healthCrossMat = new THREE.MeshStandardMaterial({ color: 0x30c030, emissive: 0x20a020, emissiveIntensity: 0.9, roughness: 0.4 });
  const armorMat = new THREE.MeshStandardMaterial({ color: 0x2a6ac2, emissive: 0x2040a0, emissiveIntensity: 0.9, roughness: 0.4 });
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });

  for (const spot of SPOTS) {
    const at = PLACES[spot.place];
    const group = new THREE.Group();
    if (spot.kind === 'health') {
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.3), healthMat);
      const crossV = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.7, 0.36), healthCrossMat);
      const crossH = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.36), healthCrossMat);
      group.add(box, crossV, crossH);
    } else {
      const vest = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.0, 0.3), armorMat);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.24, 0.34), healthMat);
      stripe.position.y = 0.18;
      group.add(vest, stripe);
    }
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 20), ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -1.1;
    group.add(ring);
    group.position.set(at.x, 1.4, at.z);
    scene.add(group);
    list.push({ x: at.x, z: at.z, kind: spot.kind, mesh: group, available: true, timer: 0 });
  }

  function update(dt, world) {
    const px = world.playerX;
    const pz = world.playerZ;
    for (const item of list) {
      if (!item.available) {
        item.timer -= dt;
        if (item.timer <= 0) {
          item.available = true;
          item.mesh.visible = true;
        }
        continue;
      }
      item.mesh.rotation.y += dt * 1.8;
      item.mesh.position.y = 1.4 + Math.sin(world.time * 2 + item.x) * 0.18;
      if (dist2D(px, pz, item.x, item.z) < 2.6) {
        const player = world.player.state;
        if (item.kind === 'health' && player.health >= PLAYER.maxHealth) continue;
        if (item.kind === 'armor' && player.armor >= PLAYER.maxArmor) continue;
        if (item.kind === 'health') {
          player.health = Math.min(PLAYER.maxHealth, player.health + 50);
          world.hud.flash('Health +50', '');
        } else {
          player.armor = Math.min(PLAYER.maxArmor, player.armor + 50);
          world.hud.flash('Armour +50', '');
        }
        effects.sparkle(item.x, 1.5, item.z);
        sfx.pickup();
        item.available = false;
        item.timer = RESPAWN;
        item.mesh.visible = false;
      }
    }
  }

  return { list, update };
}
