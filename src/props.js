/* Prop geometry + placement. One InstancedMesh per (kind, material, chunk). */
import * as THREE from 'three';
import { BIOMES } from './worldData.js';

/* Shared geometries and materials, created once. */
export const GEOS = {};
export const MATS = {};

export function initShared() {
  const lam = (c, extra = {}) => new THREE.MeshLambertMaterial({ color: c, ...extra });

  GEOS.cube = new THREE.BoxGeometry(1, 1, 1);
  GEOS.sphere = new THREE.SphereGeometry(0.5, 10, 8);
  GEOS.cone = new THREE.ConeGeometry(0.5, 1, 7);
  GEOS.cylinder = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
  GEOS.icosahedron = new THREE.IcosahedronGeometry(0.5, 0);
  GEOS.torus = new THREE.TorusGeometry(0.5, 0.18, 8, 14);

  MATS.bark = lam(0x8a6a4a);
  MATS.birchBark = lam(0xe8e4da);
  MATS.darkBark = lam(0x6a5240);
  MATS.leaf = lam(0x6faf62);
  MATS.birchLeaf = lam(0xa8d878);
  MATS.pineLeaf = lam(0x4e7d55);
  MATS.willowLeaf = lam(0x7fa86e);
  MATS.palmLeaf = lam(0x6fae5f);
  MATS.sakuraLeaf = lam(0xf0b8cc);
  MATS.rock = lam(0x9a958c);
  MATS.rockDark = lam(0x7d786f);
  MATS.flowerPink = lam(0xf2a8c0);
  MATS.flowerYellow = lam(0xf2d878);
  MATS.flowerWhite = lam(0xf5f0e8);
  MATS.flowerGlow = new THREE.MeshBasicMaterial({ color: 0xbfe8ff });
  MATS.lavender = lam(0xb89ad8);
  MATS.mushroomCap = lam(0xd86f5f);
  MATS.mushroomCapWhite = lam(0xe8e0d0);
  MATS.wood = lam(0xa87c56);
  MATS.cactus = lam(0x6f9e5f);
  MATS.ice = new THREE.MeshLambertMaterial({ color: 0xcfe8f5, transparent: true, opacity: 0.85 });
  MATS.reed = lam(0x8fae5f);
  MATS.shell = lam(0xf0e0cc);
  MATS.bone = lam(0xe8e2d0);
  MATS.stone = lam(0xa8a29a);
  MATS.monolith = new THREE.MeshLambertMaterial({ color: 0x8a94b8, emissive: 0x3040a0, emissiveIntensity: 0.35 });
  MATS.lanternGlow = new THREE.MeshBasicMaterial({ color: 0xffd88a });
  MATS.doorGlow = new THREE.MeshBasicMaterial({ color: 0xc0a8ff });
  MATS.metal = lam(0xb8b2a8);
  MATS.fabricRed = lam(0xd87f6f);
  MATS.fabricTeal = lam(0x6fa8a0);
  MATS.glass = new THREE.MeshLambertMaterial({ color: 0xd0e8e8, transparent: true, opacity: 0.6 });
}

/* Each prop kind is a list of parts:
   { geo, mat, y, sx, sy, sz, ox?, oz?, rotY?, tilt?, tiltX?, jitter? }
   y is the pivot height above ground; jitter wobbles per-instance scale. */
const BUILDERS = {
  tree: () => [
    { geo: 'cylinder', mat: 'bark', y: 1.1, sx: 0.35, sy: 2.2, sz: 0.35 },
    { geo: 'icosahedron', mat: 'leaf', y: 2.9, sx: 2.3, sy: 2.0, sz: 2.3 },
  ],
  birch: () => [
    { geo: 'cylinder', mat: 'birchBark', y: 1.6, sx: 0.22, sy: 3.2, sz: 0.22 },
    { geo: 'icosahedron', mat: 'birchLeaf', y: 3.9, sx: 1.8, sy: 1.5, sz: 1.8 },
  ],
  pine: () => [
    { geo: 'cylinder', mat: 'darkBark', y: 0.9, sx: 0.3, sy: 1.8, sz: 0.3 },
    { geo: 'cone', mat: 'pineLeaf', y: 2.2, sx: 2.0, sy: 2.6, sz: 2.0 },
    { geo: 'cone', mat: 'pineLeaf', y: 3.6, sx: 1.5, sy: 2.0, sz: 1.5 },
    { geo: 'cone', mat: 'pineLeaf', y: 4.7, sx: 1.0, sy: 1.5, sz: 1.0 },
  ],
  sakura: () => [
    { geo: 'cylinder', mat: 'darkBark', y: 1.2, sx: 0.4, sy: 2.4, sz: 0.4 },
    { geo: 'icosahedron', mat: 'sakuraLeaf', y: 3.2, sx: 2.8, sy: 1.8, sz: 2.8 },
  ],
  willow: () => [
    { geo: 'cylinder', mat: 'darkBark', y: 1.3, sx: 0.45, sy: 2.6, sz: 0.45 },
    { geo: 'icosahedron', mat: 'willowLeaf', y: 3.4, sx: 3.2, sy: 1.6, sz: 3.2 },
  ],
  palm: () => [
    { geo: 'cylinder', mat: 'bark', y: 1.8, sx: 0.25, sy: 3.6, sz: 0.25, tilt: 0.15 },
    { geo: 'icosahedron', mat: 'palmLeaf', y: 3.9, sx: 2.2, sy: 0.7, sz: 2.2 },
  ],
  cactus: () => [
    { geo: 'cylinder', mat: 'cactus', y: 1.0, sx: 0.5, sy: 2.0, sz: 0.5 },
    { geo: 'cylinder', mat: 'cactus', y: 1.4, sx: 0.3, sy: 0.9, sz: 0.3, ox: 0.55 },
    { geo: 'cylinder', mat: 'cactus', y: 1.7, sx: 0.3, sy: 0.9, sz: 0.3, ox: -0.55 },
  ],
  rock: () => [{ geo: 'icosahedron', mat: 'rock', y: 0.3, sx: 1.2, sy: 0.8, sz: 1.2, jitter: 0.4 }],
  iceShard: () => [{ geo: 'cone', mat: 'ice', y: 1.2, sx: 0.9, sy: 2.4, sz: 0.9, tilt: 0.12 }],
  flower: () => [
    { geo: 'cylinder', mat: 'reed', y: 0.25, sx: 0.05, sy: 0.5, sz: 0.05 },
    { geo: 'icosahedron', mat: 'flowerPink', y: 0.55, sx: 0.3, sy: 0.3, sz: 0.3 },
  ],
  flowerYellow: () => [
    { geo: 'cylinder', mat: 'reed', y: 0.25, sx: 0.05, sy: 0.5, sz: 0.05 },
    { geo: 'icosahedron', mat: 'flowerYellow', y: 0.55, sx: 0.3, sy: 0.3, sz: 0.3 },
  ],
  flowerWhite: () => [
    { geo: 'cylinder', mat: 'reed', y: 0.25, sx: 0.05, sy: 0.5, sz: 0.05 },
    { geo: 'icosahedron', mat: 'flowerWhite', y: 0.55, sx: 0.3, sy: 0.3, sz: 0.3 },
  ],
  glowFlower: () => [
    { geo: 'cylinder', mat: 'reed', y: 0.3, sx: 0.05, sy: 0.6, sz: 0.05 },
    { geo: 'icosahedron', mat: 'flowerGlow', y: 0.66, sx: 0.34, sy: 0.34, sz: 0.34 },
  ],
  lavender: () => [
    { geo: 'cylinder', mat: 'reed', y: 0.3, sx: 0.05, sy: 0.6, sz: 0.05 },
    { geo: 'icosahedron', mat: 'lavender', y: 0.62, sx: 0.26, sy: 0.42, sz: 0.26 },
  ],
  grassTuft: () => [{ geo: 'cone', mat: 'leaf', y: 0.3, sx: 0.5, sy: 0.6, sz: 0.5 }],
  reed: () => [{ geo: 'cylinder', mat: 'reed', y: 0.55, sx: 0.06, sy: 1.1, sz: 0.06 }],
  mushroom: () => [
    { geo: 'cylinder', mat: 'shell', y: 0.18, sx: 0.14, sy: 0.36, sz: 0.14 },
    { geo: 'sphere', mat: 'mushroomCap', y: 0.42, sx: 0.5, sy: 0.32, sz: 0.5 },
  ],
  mushroomWhite: () => [
    { geo: 'cylinder', mat: 'shell', y: 0.18, sx: 0.14, sy: 0.36, sz: 0.14 },
    { geo: 'sphere', mat: 'mushroomCapWhite', y: 0.42, sx: 0.5, sy: 0.32, sz: 0.5 },
  ],
  shell: () => [{ geo: 'torus', mat: 'shell', y: 0.12, sx: 0.4, sy: 0.3, sz: 0.4, tiltX: Math.PI / 2 }],
  bones: () => [{ geo: 'cylinder', mat: 'bone', y: 0.3, sx: 0.18, sy: 1.2, sz: 0.18, tiltX: Math.PI / 2.4 }],
  stoneRing: () => [{ geo: 'icosahedron', mat: 'stone', y: 0.25, sx: 0.8, sy: 0.5, sz: 0.8 }],
  lantern: () => [
    { geo: 'cylinder', mat: 'darkBark', y: 1.2, sx: 0.08, sy: 2.4, sz: 0.08 },
    { geo: 'icosahedron', mat: 'lanternGlow', y: 2.5, sx: 0.45, sy: 0.45, sz: 0.45 },
  ],
  monolith: () => [{ geo: 'cube', mat: 'monolith', y: 3.2, sx: 1.2, sy: 6.4, sz: 0.8 }],
};

export function hasPropKind(kind) {
  return !!BUILDERS[kind];
}

/* Resolve 'flower'/'mushroom' variants per biome deterministically at build time. */
export function resolveKind(kind, biomeKey, rng) {
  if (kind === 'flower') {
    const r = rng();
    return r < 0.4 ? 'flowerPink' : r < 0.8 ? 'flowerYellow' : 'flowerWhite';
  }
  if (kind === 'flowerPink' || kind === 'flowerYellow' || kind === 'flowerWhite') return kind;
  if (kind === 'mushroom') return rng() < 0.6 ? 'mushroom' : 'mushroomWhite';
  return kind;
}

const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scl = new THREE.Vector3();
const _zero = new THREE.Vector3(0, 0, 0);

/* positions: [{x,y,z,s,rot}] already ground-snapped by the chunk builder.
   Builds instanced meshes (one per distinct material) into the given group. */
export function buildPropInstances(group, kind, positions) {
  if (!positions.length) return;
  if (!BUILDERS[kind]) return;
  const parts = BUILDERS[kind]();
  const byKey = new Map();
  for (const part of parts) {
    const geo = GEOS[part.geo];
    const mat = MATS[part.mat];
    if (!geo || !mat) continue;
    const key = part.mat + '|' + part.geo;
    if (!byKey.has(key)) byKey.set(key, { matName: part.mat, geoName: part.geo, parts: [] });
    byKey.get(key).parts.push(part);
  }
  for (const { matName, geoName, parts: matParts } of byKey.values()) {
    const total = positions.length * matParts.length;
    const geo = GEOS[geoName];
    const mesh = new THREE.InstancedMesh(geo, MATS[matName], total);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    let idx = 0;
    for (const p of positions) {
      for (const part of matParts) {
        const j = 1 + (part.jitter ? (Math.sin(p.x * 12.9898 + p.z * 78.233) * 43758.5453 % 1) * part.jitter : 0);
        _pos.set(p.x + (part.ox || 0), p.y + part.y * p.s, p.z + (part.oz || 0));
        _scl.set(part.sx * p.s * j, part.sy * p.s * j, part.sz * p.s * j);
        _euler.set(part.tiltX || 0, (p.rot || 0) + (part.rotY || 0), part.tilt || 0);
        _quat.setFromEuler(_euler);
        _mat4.compose(_pos, _quat, _scl);
        mesh.setMatrixAt(idx++, _mat4);
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
}
