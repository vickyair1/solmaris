// SOLMARIS — Air One, the police helicopter. It joins the chase at 3 stars,
// shadows the player from above with a searchlight, and peels away when the
// heat cools off. It trails behind the player so the driving camera — which
// looks back down the road — catches it in the sky over the pursuit.
import * as THREE from 'three';
import { HELI } from './config.js';
import { clamp, dist2D, dampAngle } from './utils.js';

export function createHelicopter(scene) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.4, metalness: 0.4 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x18242e, roughness: 0.15, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.4, 4.6), bodyMat);
  body.position.y = 0;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 1.6), glassMat);
  cabin.position.set(0, 0.3, 1.9);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 4.2), bodyMat);
  tail.position.set(0, 0.2, -3.8);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.2, 0.9), bodyMat);
  fin.position.set(0, 0.7, -5.6);
  const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 3.4), darkMat);
  skidL.position.set(1.1, -1.0, 0.4);
  const skidR = skidL.clone();
  skidR.position.x = -1.1;
  // Main rotor: two long blades on a mast; spins fast in update().
  const rotor = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(9.5, 0.08, 0.5);
  const bladeA = new THREE.Mesh(bladeGeo, darkMat);
  const bladeB = new THREE.Mesh(bladeGeo, darkMat);
  bladeB.rotation.y = Math.PI / 2;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 6), darkMat);
  mast.position.y = 0.5;
  rotor.add(bladeA, bladeB, mast);
  rotor.position.y = 0.9;
  // Blinking red beacon on the belly.
  const beaconMat = new THREE.MeshStandardMaterial({ color: 0xd02020, emissive: 0xff2020, emissiveIntensity: 2 });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), beaconMat);
  beacon.position.set(0, -0.8, 0);
  group.add(body, cabin, tail, fin, skidL, skidR, rotor, beacon);
  group.visible = false;
  scene.add(group);

  // Searchlight: a translucent cone from the heli to the ground plus a pool
  // of light that tracks the player. Both read clearly from the street.
  const coneMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.06,
    blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const cone = new THREE.Mesh(new THREE.ConeGeometry(4, 1, 12, 1, true), coneMat);
  cone.visible = false;
  scene.add(cone);
  const poolMat = new THREE.MeshBasicMaterial({
    color: 0xfff2b0, transparent: true, opacity: 0.15,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 20), poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.visible = false;
  scene.add(pool);

  const state = {
    active: false,
    leaving: false,
    x: 0, z: 0, y: HELI.height,
    heading: 0,
    rotorAngle: 0,
    bobPhase: 0,
  };
  const UP = new THREE.Vector3(0, 1, 0);
  const tmpDir = new THREE.Vector3();

  function setVisible(v) {
    group.visible = v;
    cone.visible = v;
    pool.visible = v;
  }

  function spawn(px, pz, heading) {
    // Appear high behind the player, already on station.
    const bx = Math.sin(heading);
    const bz = -Math.cos(heading);
    state.x = px - bx * (HELI.followDistance + 30);
    state.z = pz - bz * (HELI.followDistance + 30);
    state.y = HELI.height;
    state.heading = heading;
    state.active = true;
    state.leaving = false;
    setVisible(true);
  }

  function update(dt, world) {
    const wanted = world.police.wanted;
    if (!state.active && wanted >= HELI.wantedLevel) {
      const heading = world.player.state.inCar && world.player.state.car
        ? world.player.state.car.heading
        : world.player.state.heading;
      spawn(world.playerX, world.playerZ, heading);
    }
    if (!state.active) return;
    if (wanted < HELI.wantedLevel) state.leaving = true;

    state.rotorAngle += dt * 28;
    rotor.rotation.y = state.rotorAngle;
    beaconMat.emissiveIntensity = Math.floor(world.time * 2.5) % 2 === 0 ? 2.5 : 0.2;

    if (state.leaving) {
      // Climb away to the north and switch off once clear of the city.
      state.y += dt * 14;
      state.z -= dt * HELI.speed;
      group.position.set(state.x, state.y, state.z);
      if (state.y > 90 || state.z < -260) {
        state.active = false;
        state.leaving = false;
        setVisible(false);
      }
      return;
    }

    // Trail the player: behind their heading, up high, closing gently.
    const heading = world.player.state.inCar && world.player.state.car
      ? world.player.state.car.heading
      : world.player.state.heading;
    const bx = Math.sin(heading);
    const bz = -Math.cos(heading);
    const tx = world.playerX - bx * HELI.followDistance;
    const tz = world.playerZ - bz * HELI.followDistance;
    const d = dist2D(state.x, state.z, tx, tz);
    const speed = clamp(d * 0.9, 6, HELI.speed);
    if (d > 0.5) {
      state.x += ((tx - state.x) / d) * speed * dt;
      state.z += ((tz - state.z) / d) * speed * dt;
    }
    state.heading = dampAngle(state.heading, heading, 2.5, dt);
    state.bobPhase += dt * 1.4;
    state.y = HELI.height + Math.sin(state.bobPhase) * 1.2;
    group.position.set(state.x, state.y, state.z);
    group.rotation.y = state.heading;
    group.rotation.z = Math.sin(state.bobPhase * 0.7) * 0.04;

    // Aim the searchlight at the player: cone apex at the heli, base on the ground.
    const px = world.playerX;
    const pz = world.playerZ;
    const dx = px - state.x;
    const dz = pz - state.z;
    const len = Math.sqrt(dx * dx + state.y * state.y + dz * dz);
    tmpDir.set(-dx / len, state.y / len, -dz / len); // from player toward heli
    cone.quaternion.setFromUnitVectors(UP, tmpDir);
    cone.scale.set(1, len, 1);
    cone.position.set((state.x + px) / 2, state.y / 2, (state.z + pz) / 2);
    pool.position.set(px, 0.06, pz);
  }

  return {
    state,
    get active() {
      return state.active;
    },
    update,
    reset() {
      state.active = false;
      state.leaving = false;
      setVisible(false);
    },
  };
}
