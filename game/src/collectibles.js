// SOLMARIS — sun charms: 20 small golden octahedrons hidden around the
// city at ground level — beach, docks, alleys, park, behind buildings.
// No minimap blips: finding them is the hunt. Walk or drive within 3m and
// one is yours: $50, 5 respect, and a flash counting them down.
import * as THREE from 'three';
import { CHARMS } from './config.js';
import { dist2D } from './utils.js';
import { sfx } from './audio.js';

const PICKUP_RADIUS = 3;

export function createCollectibles(scene, effects) {
  const meshes = [];
  const mat = new THREE.MeshStandardMaterial({ color: 0xffd23a, metalness: 0.7, roughness: 0.25, emissive: 0x8a6a00, emissiveIntensity: 0.5 });
  for (const spot of CHARMS) {
    const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), mat);
    mesh.position.set(spot.x, 1.2, spot.z);
    mesh.castShadow = true;
    scene.add(mesh);
    meshes.push(mesh);
  }

  const state = { found: [] }; // indices into CHARMS, in find order

  function foundCount() {
    return state.found.length;
  }

  function isFound(i) {
    return state.found.includes(i);
  }

  function update(dt, world) {
    for (let i = 0; i < CHARMS.length; i += 1) {
      const mesh = meshes[i];
      if (isFound(i)) {
        mesh.visible = false;
        continue;
      }
      mesh.rotation.y += dt * 2.4;
      mesh.position.y = 1.2 + Math.sin(world.time * 2 + i) * 0.25;
      if (dist2D(world.playerX, world.playerZ, CHARMS[i].x, CHARMS[i].z) < PICKUP_RADIUS) {
        state.found.push(i);
        mesh.visible = false;
        world.money += 50;
        effects.sparkle(CHARMS[i].x, 1.5, CHARMS[i].z);
        sfx.pickup();
        if (world.respect) world.respect.add(world, 5, 'sun charm', true);
        if (world.career) world.career.state.charmsFound = state.found.length;
        if (world.hud) world.hud.flash(`SUN CHARM ${state.found.length}/${CHARMS.length} — +$50`, '');
        if (world.save) world.save();
      }
    }
  }

  return {
    state,
    foundCount,
    isFound,
    update,
    reset() {
      state.found = [];
      for (const mesh of meshes) mesh.visible = true;
    },
    serialize() {
      return { found: [...state.found] };
    },
    apply(data) {
      this.reset();
      if (!data || typeof data !== 'object' || !Array.isArray(data.found)) return;
      state.found = data.found.filter((i) => Number.isInteger(i) && i >= 0 && i < CHARMS.length);
      for (const i of state.found) meshes[i].visible = false;
    },
  };
}
