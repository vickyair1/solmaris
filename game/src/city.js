// SOLMARIS — the city itself: grid streets, buildings, palms, beach, marina,
// streetlights, clouds and sun. Procedural from a seed, so every load (and
// every screenshot) shows the same Solmaris.
import * as THREE from 'three';
import { PITCH, ROAD_W, BLOCK, ROAD_LINES, CITY_HALF, WORLD_HALF, BEACH_Z, WATER_Z, PALETTE } from './config.js';
import { clamp, dist2D, intRange, pick, range } from './utils.js';
import {
  buildFacadeSet,
  facadeTexture,
  roofTexture,
  roadTexture,
  sidewalkTexture,
  sandTexture,
  waterTexture,
  grassTexture,
  signTexture,
} from './textures.js';

/** Landmark blocks, keyed by "bx,bz" (block indices -3..2). */
const LANDMARKS = {
  '-3,-2': { kind: 'police', sign: 'POLICE', bg: 0x1e3a5f, fg: 0xffffff, color: 0xd8dee8 },
  '1,1': { kind: 'hospital', sign: 'HOSPITAL', bg: 0xffffff, fg: 0xc23b2e, color: 0xf0f0f0 },
  '-1,-2': { kind: 'bank', sign: 'SOLMARIS BANK', bg: 0x2e4a3a, fg: 0xe8d9a8, color: 0xd8cdb0 },
  '-1,-1': { kind: 'park' },
  '1,-1': { kind: 'parking' },
  '-3,-3': { kind: 'warehouse', sign: 'HIDEOUT', bg: 0x3a3a3a, fg: 0xe8c832, color: 0x8a8a92 },
  '0,-3': { kind: 'garage', sign: 'NORTH GARAGE', bg: 0xc23b2e, fg: 0xffffff, color: 0xd8b0a0 },
};

/** Scale a box's UVs so facade windows keep their size on any building. */
function scaledBox(w, h, d) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const uv = geo.attributes.uv;
  // BoxGeometry groups: +x, -x, +y, -y, +z, -z — 4 vertices each, in order.
  const scales = [
    [d / 9, h / 9], [d / 9, h / 9],
    [w / 9, d / 9], [w / 9, d / 9],
    [w / 9, h / 9], [w / 9, h / 9],
  ];
  for (let face = 0; face < 6; face += 1) {
    for (let v = 0; v < 4; v += 1) {
      const i = face * 4 + v;
      uv.setXY(i, uv.getX(i) * scales[face][0], uv.getY(i) * scales[face][1]);
    }
  }
  return geo;
}

export function buildCity(scene, rng) {
  const colliders = [];
  const animated = { clouds: [], boats: [], water: null };

  // ---- lights and sky ------------------------------------------------------
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 180, 520);

  const sun = new THREE.DirectionalLight(PALETTE.sun, 2.9);
  sun.position.set(90, 140, 70);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);
  const hemi = new THREE.HemisphereLight(0xbdd8f0, 0x8a7a5a, 0.95);
  scene.add(hemi);

  // ---- ground --------------------------------------------------------------
  const groundMat = new THREE.MeshStandardMaterial({ color: 0xa8a294, roughness: 1 });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2 + 260, WORLD_HALF * 2 + 260), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 60);
  ground.receiveShadow = true;
  scene.add(ground);

  // ---- roads ---------------------------------------------------------------
  // Two orientations: east-west roads repeat the tile along U, north-south
  // along V, so the centre dashes always run down the road.
  const roadLen = CITY_HALF * 2 + ROAD_W;
  const roadTexX = roadTexture('x');
  roadTexX.wrapS = THREE.RepeatWrapping;
  roadTexX.wrapT = THREE.RepeatWrapping;
  roadTexX.repeat.set(roadLen / 14, 1);
  const roadTexZ = roadTexture('z');
  roadTexZ.wrapS = THREE.RepeatWrapping;
  roadTexZ.wrapT = THREE.RepeatWrapping;
  roadTexZ.repeat.set(1, roadLen / 14);
  const roadMatX = new THREE.MeshStandardMaterial({ map: roadTexX, roughness: 0.95 });
  const roadMatZ = new THREE.MeshStandardMaterial({ map: roadTexZ, roughness: 0.95 });
  const roadGeoX = new THREE.PlaneGeometry(roadLen, ROAD_W);
  const roadGeoZ = new THREE.PlaneGeometry(ROAD_W, roadLen);
  for (const line of ROAD_LINES) {
    const rx = new THREE.Mesh(roadGeoX, roadMatX);
    rx.rotation.x = -Math.PI / 2;
    rx.position.set(0, 0.01, line);
    rx.receiveShadow = true;
    scene.add(rx);
    const rz = new THREE.Mesh(roadGeoZ, roadMatZ);
    rz.rotation.x = -Math.PI / 2;
    rz.position.set(line, 0.02, 0);
    rz.receiveShadow = true;
    scene.add(rz);
  }

  // ---- blocks: sidewalks, buildings, parks ---------------------------------
  const facades = buildFacadeSet();
  for (const tex of facades) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  const facadeMats = facades.map((tex) => new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  const roofTex = roofTexture(42);
  roofTex.wrapS = THREE.RepeatWrapping;
  roofTex.wrapT = THREE.RepeatWrapping;
  const roofMat = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 1 });
  const bottomMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 1 });
  const sidewalkTex = sidewalkTexture();
  sidewalkTex.wrapS = THREE.RepeatWrapping;
  sidewalkTex.wrapT = THREE.RepeatWrapping;
  sidewalkTex.repeat.set(3, 3);
  const sidewalkMat = new THREE.MeshStandardMaterial({ map: sidewalkTex, roughness: 1 });
  const grassTex = grassTexture();
  grassTex.wrapS = THREE.RepeatWrapping;
  grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(3, 3);
  const grassMat = new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 });

  const slabGeo = new THREE.BoxGeometry(BLOCK, 0.3, BLOCK);

  function addBuilding(cx, cz, w, d, h, facadeIndex, sign) {
    const mats = [facadeMats[facadeIndex], facadeMats[facadeIndex], roofMat, bottomMat, facadeMats[facadeIndex], facadeMats[facadeIndex]];
    const mesh = new THREE.Mesh(scaledBox(w, h, d), mats);
    mesh.position.set(cx, 0.3 + h / 2, cz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
    if (sign) {
      const signMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.min(w * 0.9, 18), 3.2),
        new THREE.MeshBasicMaterial({ map: signTexture(sign.text, sign.bg, sign.fg) }),
      );
      // Face the nearest road (south side by default).
      signMesh.position.set(cx, Math.min(h - 2, 9), cz + d / 2 + 0.15);
      scene.add(signMesh);
    }
    return mesh;
  }

  const palmSpots = [];
  for (let bx = -3; bx <= 2; bx += 1) {
    for (let bz = -3; bz <= 2; bz += 1) {
      const cx = bx * PITCH + PITCH / 2;
      const cz = bz * PITCH + PITCH / 2;
      const key = `${bx},${bz}`;
      const landmark = LANDMARKS[key];
      const isPark = landmark && landmark.kind === 'park';
      const slab = new THREE.Mesh(slabGeo, isPark ? grassMat : sidewalkMat);
      slab.position.set(cx, 0.15, cz);
      slab.receiveShadow = true;
      scene.add(slab);

      if (isPark) {
        for (let i = 0; i < 7; i += 1) {
          palmSpots.push({ x: cx + range(rng, -16, 16), z: cz + range(rng, -16, 16), s: range(rng, 0.9, 1.3) });
        }
        continue;
      }
      if (landmark && landmark.kind === 'parking') {
        // Open lot: no buildings, parked cars go here (vehicles.js reads this).
        continue;
      }
      if (landmark && landmark.sign) {
        const idx = PALETTE.building.indexOf(landmark.color);
        addBuilding(cx, cz, 34, 30, landmark.kind === 'bank' ? 16 : 22, idx >= 0 ? idx : 0, landmark);
        continue;
      }
      // Normal block: 1 big, 2 medium or 4 small buildings.
      const distCentre = dist2D(cx, cz, 0, 0);
      const heightBoost = clamp(1 - distCentre / 320, 0, 1); // downtown taller
      const layout = rng();
      if (layout < 0.4) {
        const h = 10 + heightBoost * 34 + range(rng, 0, 8);
        addBuilding(cx, cz, 30, 30, h, intRange(rng, 0, 7), null);
      } else if (layout < 0.75) {
        const h1 = 8 + heightBoost * 26 + range(rng, 0, 6);
        const h2 = 8 + heightBoost * 26 + range(rng, 0, 6);
        addBuilding(cx - 10, cz, 18, 26, h1, intRange(rng, 0, 7), null);
        addBuilding(cx + 11, cz, 18, 26, h2, intRange(rng, 0, 7), null);
      } else {
        for (const [ox, oz] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) {
          const h = 7 + heightBoost * 18 + range(rng, 0, 6);
          addBuilding(cx + ox, cz + oz, 15, 15, h, intRange(rng, 0, 7), null);
        }
      }
      // A palm or two on some blocks.
      if (rng() < 0.5) palmSpots.push({ x: cx + range(rng, -18, 18), z: cz + range(rng, -18, 18), s: range(rng, 0.8, 1.1) });
    }
  }

  // ---- beach, water, pier, boats -------------------------------------------
  const sandTex = sandTexture();
  sandTex.wrapS = THREE.RepeatWrapping;
  sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(24, 3);
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_HALF * 2 + 200, WATER_Z - BEACH_Z),
    new THREE.MeshStandardMaterial({ map: sandTex, roughness: 1 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, 0.02, (BEACH_Z + WATER_Z) / 2);
  sand.receiveShadow = true;
  scene.add(sand);

  const waterTex = waterTexture();
  waterTex.wrapS = THREE.RepeatWrapping;
  waterTex.wrapT = THREE.RepeatWrapping;
  waterTex.repeat.set(10, 6);
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.94 });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_HALF * 2 + 400, 220), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, 0.05, WATER_Z + 110);
  scene.add(water);
  animated.water = water;

  // Marina plaza at the south road (Mara's spot) + pier.
  const plazaMat = new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 1 });
  const plaza = new THREE.Mesh(new THREE.BoxGeometry(60, 0.3, 26), plazaMat);
  plaza.position.set(-29, 0.15, 196);
  plaza.receiveShadow = true;
  scene.add(plaza);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 });
  const pier = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 44), woodMat);
  pier.position.set(-58, 0.4, 232);
  pier.castShadow = true;
  scene.add(pier);
  for (let i = 0; i < 5; i += 1) {
    for (const side of [-2.6, 2.6]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2.4, 6), woodMat);
      post.position.set(-58 + side, 0, 214 + i * 9);
      scene.add(post);
    }
  }
  // Three little boats bobbing near the pier.
  const hullMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 });
  const cabinMat = new THREE.MeshStandardMaterial({ color: 0x2e6ac2, roughness: 0.6 });
  for (const [bx, bz, rot] of [[-72, 268, 0.4], [-44, 282, -0.3], [-84, 292, 0.9]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 6.5), hullMat);
    hull.position.y = 0.4;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1, 2.6), cabinMat);
    cabin.position.set(0, 1.4, -0.6);
    boat.add(hull, cabin);
    boat.position.set(bx, 0.1, bz);
    boat.rotation.y = rot;
    scene.add(boat);
    animated.boats.push(boat);
  }

  // ---- palms (instanced: two draw calls for the whole city) -----------------
  for (let z = -174; z <= 174; z += 29) {
    if (ROAD_LINES.includes(z)) continue;
    palmSpots.push({ x: -8.5, z, s: 1 });
    palmSpots.push({ x: 8.5, z, s: 1 });
  }
  for (let x = -200; x <= 200; x += 26) palmSpots.push({ x, z: BEACH_Z + 4, s: range(rng, 0.9, 1.2) });
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 6, 6);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x7a5a38, roughness: 1 });
  const crownGeo = new THREE.IcosahedronGeometry(2.3, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x3a7a3a, roughness: 1, flatShading: true });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, palmSpots.length);
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, palmSpots.length);
  const dummy = new THREE.Object3D();
  palmSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 3 * spot.s, spot.z);
    dummy.rotation.set(range(rng, -0.08, 0.08), 0, range(rng, -0.08, 0.08));
    dummy.scale.set(spot.s, spot.s, spot.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spot.x, 6.6 * spot.s, spot.z);
    dummy.rotation.set(0, rng() * Math.PI, 0);
    dummy.scale.set(spot.s, spot.s * 0.55, spot.s);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
  });
  trunks.castShadow = true;
  crowns.castShadow = true;
  scene.add(trunks, crowns);

  // ---- streetlights (instanced poles + lamps) ------------------------------
  const lightSpots = [];
  for (const lx of ROAD_LINES) {
    for (const lz of ROAD_LINES) {
      if ((ROAD_LINES.indexOf(lx) + ROAD_LINES.indexOf(lz)) % 2 === 0) {
        lightSpots.push({ x: lx + 8.5, z: lz + 8.5 });
      }
    }
  }
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7.5, 6);
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x3a3f45, roughness: 0.7, metalness: 0.4 });
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, lightSpots.length);
  const lampGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff8d8, emissive: 0xffe9a0, emissiveIntensity: 0.7 });
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, lightSpots.length);
  lightSpots.forEach((spot, i) => {
    dummy.position.set(spot.x, 3.75, spot.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poles.setMatrixAt(i, dummy.matrix);
    dummy.position.set(spot.x, 7.6, spot.z);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
  });
  scene.add(poles, lamps);

  // ---- clouds ---------------------------------------------------------------
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, fog: false });
  for (let i = 0; i < 9; i += 1) {
    const cloud = new THREE.Group();
    const puffs = intRange(rng, 2, 4);
    for (let p = 0; p < puffs; p += 1) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(range(rng, 6, 12), 8, 6), cloudMat);
      puff.position.set(p * 9 - puffs * 4, range(rng, -1, 1.5), range(rng, -3, 3));
      puff.scale.y = 0.45;
      cloud.add(puff);
    }
    cloud.position.set(range(rng, -260, 260), range(rng, 70, 110), range(rng, -260, 260));
    scene.add(cloud);
    animated.clouds.push(cloud);
  }

  // ---- road network helpers --------------------------------------------------
  const intersections = [];
  for (const x of ROAD_LINES) {
    for (const z of ROAD_LINES) intersections.push({ x, z });
  }

  function nearestRoadValue(v) {
    let best = ROAD_LINES[0];
    let bestD = Math.abs(v - best);
    for (const line of ROAD_LINES) {
      const d = Math.abs(v - line);
      if (d < bestD) {
        bestD = d;
        best = line;
      }
    }
    return best;
  }

  function nearestIntersection(x, z) {
    return { x: nearestRoadValue(x), z: nearestRoadValue(z) };
  }

  function isOnRoad(x, z) {
    const dx = Math.abs(x - nearestRoadValue(x));
    const dz = Math.abs(z - nearestRoadValue(z));
    return dx <= ROAD_W / 2 + 1 || dz <= ROAD_W / 2 + 1;
  }

  function update(dt, time, focusX, focusZ) {
    // Sun shadow box follows the player so shadows stay crisp nearby.
    sun.position.set(focusX + 90, 140, focusZ + 70);
    sun.target.position.set(focusX, 0, focusZ);
    for (const cloud of animated.clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 300) cloud.position.x = -300;
    }
    for (let i = 0; i < animated.boats.length; i += 1) {
      const boat = animated.boats[i];
      boat.position.y = 0.1 + Math.sin(time * 0.8 + i * 2) * 0.18;
      boat.rotation.z = Math.sin(time * 0.6 + i) * 0.03;
    }
    if (animated.water) {
      animated.water.position.y = 0.05 + Math.sin(time * 0.5) * 0.03;
    }
  }

  return { colliders, intersections, nearestRoadValue, nearestIntersection, isOnRoad, update };
}
