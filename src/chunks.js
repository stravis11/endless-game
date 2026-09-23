/* Chunk construction: terrain mesh, vertex colours, water, scattered props,
   and rare procedural surprises. buildChunk(cx, cz) is deterministic. */
import * as THREE from 'three';
import { mulberry32, hash2 } from './rng.js';
import { WORLD, BIOMES, SURPRISES, SEED } from './worldData.js';
import { heightAt, surfaceColor, biomeIdAt } from './terrain.js';
import { GEOS, MATS, buildPropInstances, resolveKind, hasPropKind } from './props.js';

export const chunkStats = { requested: 0, loaded: 0, failed: 0, fallback: 0 };

const _c = new THREE.Color();

function groundPart(group, geoName, matName, x, y, z, sx, sy, sz, rotY = 0, tiltX = 0, tiltZ = 0) {
  const mesh = new THREE.Mesh(GEOS[geoName], MATS[matName]);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.rotation.set(tiltX, rotY, tiltZ);
  group.add(mesh);
  return mesh;
}

/* ---------------- surprise builders ---------------- */

const SURPRISE_BUILDERS = {
  flowerRing(g, rng) {
    const n = 12 + Math.floor(rng() * 8);
    const r = 2.2 + rng() * 1.8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const mat = rng() < 0.45 ? 'flowerPink' : rng() < 0.7 ? 'flowerWhite' : 'flowerYellow';
      groundPart(g, 'icosahedron', mat, x, 0.3, z, 0.3, 0.3, 0.3, rng() * 3);
    }
  },
  boulderFace(g, rng) {
    groundPart(g, 'icosahedron', 'rock', 0, 1.1, 0, 3.2, 2.2, 3.0, rng() * 3);
    groundPart(g, 'icosahedron', 'rockDark', -0.8, 1.6, 1.25, 0.4, 0.4, 0.25);
    groundPart(g, 'icosahedron', 'rockDark', 0.8, 1.6, 1.25, 0.4, 0.4, 0.25);
    groundPart(g, 'torus', 'rockDark', 0, 0.7, 1.3, 0.8, 0.35, 0.3, 0, Math.PI / 2.2);
  },
  tinyBridge(g, rng) {
    const len = 4.5;
    groundPart(g, 'cube', 'wood', 0, 0.9, 0, 1.4, 0.14, len);
    for (const sx of [-0.6, 0.6]) {
      for (const sz of [-len / 2 + 0.2, len / 2 - 0.2]) {
        groundPart(g, 'cylinder', 'wood', sx, 1.25, sz, 0.09, 0.8, 0.09);
      }
    }
    for (const sz of [-len / 2 + 0.2, len / 2 - 0.2]) {
      groundPart(g, 'cylinder', 'wood', -0.6, 1.0, sz, 0.08, 0.7, 0.08, 0, 0, Math.PI / 2);
    }
  },
  picnic(g, rng) {
    groundPart(g, 'cube', 'fabricRed', 0, 0.06, 0, 2.2, 0.08, 2.2);
    groundPart(g, 'cube', 'wood', -0.5, 0.32, -0.3, 0.7, 0.1, 0.7);
    groundPart(g, 'cube', 'wood', 0.55, 0.3, 0.35, 0.55, 0.09, 0.55);
    groundPart(g, 'cylinder', 'fabricTeal', 0.1, 0.36, -0.5, 0.22, 0.24, 0.22);
    groundPart(g, 'icosahedron', 'flowerPink', -0.35, 0.42, 0.1, 0.2, 0.2, 0.2);
  },
  stoneStack(g, rng) {
    let y = 0.2;
    for (let i = 0; i < 5 + Math.floor(rng() * 4); i++) {
      const s = 0.9 - i * 0.13;
      groundPart(g, 'icosahedron', 'stone', (rng() - 0.5) * 0.12, y + s * 0.35, (rng() - 0.5) * 0.12, s * 1.1, s * 0.7, s * 1.1, rng() * 3);
      y += s * 0.6;
    }
  },
  swing(g, rng) {
    groundPart(g, 'cylinder', 'bark', 0, 2.2, 0, 0.4, 4.4, 0.4);
    groundPart(g, 'icosahedron', 'leaf', 0, 4.9, 0, 3.0, 2.0, 3.0);
    for (const rx of [-0.55, 0.55]) {
      groundPart(g, 'cylinder', 'wood', rx, 2.6, 0.75, 0.04, 1.9, 0.04, 0, 0.16 * Math.sign(rx));
    }
    groundPart(g, 'cube', 'wood', 0, 1.6, 0.78, 1.3, 0.1, 0.42);
  },
  hotSpring(g, rng) {
    groundPart(g, 'torus', 'stone', 0, 0.18, 0, 6.4, 1.5, 6.4, 0, Math.PI / 2);
    const pool = groundPart(g, 'cylinder', 'glass', 0, 0.16, 0, 5.6, 0.24, 5.6);
    pool.material = new THREE.MeshLambertMaterial({ color: 0xbfe8e2, transparent: true, opacity: 0.75, emissive: 0x2a4a44, emissiveIntensity: 0.4 });
  },
  giantMushroom(g, rng) {
    groundPart(g, 'cylinder', 'shell', 0, 2.0, 0, 1.6, 4.0, 1.6);
    groundPart(g, 'sphere', 'mushroomCap', 0, 4.6, 0, 8.5, 3.4, 8.5);
    for (let i = 0; i < 3; i++) {
      const a = rng() * Math.PI * 2;
      groundPart(g, 'cylinder', 'shell', Math.cos(a) * 3.4, 0.5, Math.sin(a) * 3.4, 0.4, 1.0, 0.4);
      groundPart(g, 'sphere', 'mushroomCapWhite', Math.cos(a) * 3.4, 1.2, Math.sin(a) * 3.4, 1.3, 0.8, 1.3);
    }
  },
  wishTree(g, rng) {
    groundPart(g, 'cylinder', 'darkBark', 0, 1.6, 0, 0.5, 3.2, 0.5);
    groundPart(g, 'icosahedron', 'sakuraLeaf', 0, 3.8, 0, 4.2, 2.4, 4.2);
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, r = 1.2 + rng() * 1.6;
      const mat = rng() < 0.5 ? 'fabricRed' : 'fabricTeal';
      groundPart(g, 'cube', mat, Math.cos(a) * r, 2.6 + rng() * 1.6, Math.sin(a) * r, 0.14, 0.3, 0.03, rng() * 3);
    }
  },
  obelisk(g, rng) {
    groundPart(g, 'cube', 'monolith', 0, 3.4, 0, 1.5, 6.8, 1.5, rng() * 0.4);
    groundPart(g, 'icosahedron', 'lanternGlow', 0, 7.2, 0, 0.5, 0.5, 0.5);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      groundPart(g, 'icosahedron', 'stone', Math.cos(a) * 3.2, 0.3, Math.sin(a) * 3.2, 0.8, 0.55, 0.8, rng() * 3);
    }
  },
  sundial(g, rng) {
    groundPart(g, 'cylinder', 'stone', 0, 0.35, 0, 4.4, 0.7, 4.4);
    groundPart(g, 'cube', 'metal', 0, 1.1, 0, 0.22, 1.5, 0.06, 0, 0, 0.6);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      groundPart(g, 'cube', 'rockDark', Math.cos(a) * 1.8, 0.74, Math.sin(a) * 1.8, 0.12, 0.06, 0.3, -a);
    }
  },
  beacon(g, rng) {
    groundPart(g, 'cylinder', 'stone', 0, 4.5, 0, 3.0, 9.0, 3.0);
    groundPart(g, 'cylinder', 'fabricRed', 0, 9.4, 0, 3.1, 0.9, 3.1);
    groundPart(g, 'icosahedron', 'lanternGlow', 0, 10.2, 0, 1.4, 1.4, 1.4);
    groundPart(g, 'cone', 'fabricRed', 0, 11.2, 0, 2.2, 1.6, 2.2);
  },
  floatingIsle(g, rng) {
    const y = 16 + rng() * 5;
    groundPart(g, 'icosahedron', 'rock', 0, y, 0, 9, 4, 9, rng() * 3);
    groundPart(g, 'icosahedron', 'rockDark', 0, y - 2.4, 0, 5.5, 3.2, 5.5);
    groundPart(g, 'icosahedron', 'leaf', 0, y + 1.9, 0, 7, 2.4, 7);
    groundPart(g, 'cylinder', 'bark', 0.8, y + 3.0, 0.4, 0.4, 2.2, 0.4);
    groundPart(g, 'icosahedron', 'leaf', 0.8, y + 4.4, 0.4, 2.4, 1.6, 2.4);
    for (let i = 0; i < 4; i++) {
      const a = rng() * Math.PI * 2, r = 2 + rng() * 2.4;
      groundPart(g, 'icosahedron', 'flowerGlow', Math.cos(a) * r, y + 1.2, Math.sin(a) * r, 0.4, 0.4, 0.4);
    }
  },
  whaleSkeleton(g, rng) {
    const L = 22;
    groundPart(g, 'icosahedron', 'bone', -L * 0.45, 1.6, 0, 3.4, 2.6, 2.4);
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const x = -L * 0.3 + t * L * 0.75;
      const s = 1.9 - t * 1.1;
      groundPart(g, 'torus', 'bone', x, 1.7, 0, s * 2.2, s * 2.2, s * 1.4, 0, Math.PI / 2, 0.12 * Math.sin(t * 5));
    }
    for (const zz of [-2.2, 2.2]) {
      groundPart(g, 'cylinder', 'bone', L * 0.28, 1.6, zz * 1.4, 0.16, 5.5, 0.16, 0, 0, Math.PI / 2.15);
    }
  },
  doorway(g, rng) {
    groundPart(g, 'cube', 'stone', 0, 2.4, -0.5, 0.5, 4.8, 0.5);
    groundPart(g, 'cube', 'stone', 0, 2.4, 0.5, 0.5, 4.8, 0.5);
    groundPart(g, 'cube', 'stone', 0, 5.0, 0, 0.5, 0.5, 1.6);
    const door = groundPart(g, 'cube', 'doorGlow', 0, 2.3, 0.15, 0.14, 4.4, 1.3, 0, 0, 0.18);
    door.material = MATS.doorGlow;
  },
  giantSnail(g, rng) {
    groundPart(g, 'sphere', 'bark', 0, 1.5, 0, 3.4, 2.8, 3.0);
    groundPart(g, 'icosahedron', 'leaf', 0, 3.3, 0, 3.4, 1.4, 3.0);
    groundPart(g, 'sphere', 'shell', 3.1, 1.3, 0, 2.0, 1.7, 2.0);
    for (const dx of [0.35, 0.75]) {
      groundPart(g, 'cylinder', 'shell', 4.0 + dx * 0.2, 2.6, dx * 0.6 - 0.3, 0.08, 1.5, 0.08, 0, 0, 0.35 * (dx > 0.5 ? -1 : 1));
    }
  },
  meteorGarden(g, rng) {
    groundPart(g, 'icosahedron', 'rockDark', 0, 1.0, 0, 3.6, 2.0, 3.6, rng() * 3);
    const core = groundPart(g, 'icosahedron', 'flowerGlow', 0, 1.7, 0, 1.1, 1.1, 1.1);
    core.material = new THREE.MeshBasicMaterial({ color: 0xa8d8ff });
    for (let i = 0; i < 9; i++) {
      const a = rng() * Math.PI * 2, r = 2.6 + rng() * 2.6;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      groundPart(g, 'cylinder', 'reed', x, 0.35, z, 0.05, 0.7, 0.05);
      groundPart(g, 'icosahedron', 'flowerGlow', x, 0.75, z, 0.3, 0.3, 0.3);
    }
  },
  carousel(g, rng) {
    groundPart(g, 'cylinder', 'wood', 0, 0.5, 0, 8.0, 1.0, 8.0);
    groundPart(g, 'cylinder', 'fabricRed', 0, 5.0, 0, 7.6, 0.5, 7.6);
    groundPart(g, 'cone', 'fabricRed', 0, 6.6, 0, 7.0, 2.6, 7.0);
    groundPart(g, 'cylinder', 'metal', 0, 3.0, 0, 0.3, 6.0, 0.3);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const x = Math.cos(a) * 2.6, z = Math.sin(a) * 2.6;
      groundPart(g, 'cylinder', 'metal', x, 2.8, z, 0.07, 4.4, 0.07);
      const horse = groundPart(g, 'icosahedron', rng() < 0.5 ? 'fabricTeal' : 'flowerWhite', x, 1.7, z, 1.1, 0.8, 0.55);
      horse.rotation.y = -a;
    }
  },
};

/* Pick a surprise for a chunk: null (most chunks), or {tier, id, label}. */
export function pickSurprise(cx, cz) {
  const h = hash2(cx, cz, SEED ^ 0x5C);
  let tier = null;
  if (h < 0.012) tier = 'rare';
  else if (h < 0.075) tier = 'uncommon';
  else if (h < 0.30) tier = 'common';
  if (!tier) return null;
  const list = SURPRISES[tier];
  const h2 = hash2(cx, cz, SEED ^ (tier === 'rare' ? 0x1A : tier === 'uncommon' ? 0x1B : 0x1C));
  let t = h2 * list.reduce((p, c) => p + c.weight, 0);
  for (const item of list) {
    t -= item.weight;
    if (t <= 0) return { tier, id: item.id, label: item.label };
  }
  return { tier, id: list[0].id, label: list[0].label };
}

/* Survey rarity curve over an abstract grid of chunks (for G3). */
export function surveySurprises(n) {
  const tiers = { common: 0, uncommon: 0, rare: 0 };
  let total = 0;
  for (let i = 0; i < n; i++) {
    const cx = Math.floor(mulberry32(i * 7919 + 13)() * 1e6) - 5e5;
    const cz = Math.floor(mulberry32(i * 104729 + 7)() * 1e6) - 5e5;
    const s = pickSurprise(cx, cz);
    if (s) { tiers[s.tier]++; total++; }
  }
  return { total, tiers };
}

/* ---------------- chunk build ---------------- */

export function buildChunk(cx, cz) {
  chunkStats.requested++;
  const group = new THREE.Group();
  group.position.set(cx * WORLD.chunkSize, 0, cz * WORLD.chunkSize);

  const size = WORLD.chunkSize;
  const segs = WORLD.segs;
  const rng = mulberry32((Math.imul(cx, 73856093) ^ Math.imul(cz, 83492791) ^ SEED) >>> 0);

  /* --- terrain geometry --- */
  const geo = new THREE.PlaneGeometry(size, size, segs, segs);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const heights = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const wx = cx * size + pos.getX(i);
    const wz = cz * size + pos.getZ(i);
    const h = heightAt(wx, wz);
    pos.setY(i, h);
    heights[i] = h;
    surfaceColor(wx, wz, h, _c);
    colors[i * 3] = _c.r; colors[i * 3 + 1] = _c.g; colors[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(geo, groundMat);
  ground.receiveShadow = false;
  ground.castShadow = false;
  group.add(ground);

  /* --- water (only if the chunk dips below sea level) --- */
  let hasWater = false;
  let minH = Infinity, maxH = -Infinity;
  for (let i = 0; i < pos.count; i++) { minH = Math.min(minH, heights[i]); maxH = Math.max(maxH, heights[i]); }
  if (minH < WORLD.waterLevel + 0.35) {
    hasWater = true;
    const wgeo = new THREE.PlaneGeometry(size, size, 56, 56);
    wgeo.rotateX(-Math.PI / 2);
    // Store base positions so the animation can wave around them.
    const wpos = wgeo.attributes.position;
    wgeo.userData.base = wpos.array.slice();
    const wmat = new THREE.MeshPhongMaterial({
      color: 0x6fb8d4, transparent: true, opacity: 0.8,
      emissive: 0x122b36, emissiveIntensity: 0.3,
      shininess: 55, specular: 0xb8dcf0,
      flatShading: true,
    });
    const water = new THREE.Mesh(wgeo, wmat);
    water.position.y = WORLD.waterLevel;
    water.userData.isWater = true;
    group.add(water);
  }

  /* --- props --- */
  const biomeCounts = {};
  const propCounts = {};
  const biome = biomeIdAt(cx * size + size / 2, cz * size + size / 2);
  biomeCounts[biome] = (biomeCounts[biome] || 0) + 1;

  const bdef = BIOMES[biome];
  const area = size * size;
  for (const { kind, density } of bdef.props) {
    const count = Math.max(0, Math.round(density * (area / 10000) * 4));
    const positions = [];
    for (let i = 0; i < count; i++) {
      const x = (rng() - 0.5) * (size - 6);
      const z = (rng() - 0.5) * (size - 6);
      const wx = cx * size + x, wz = cz * size + z;
      const h = heightAt(wx, wz);
      if (h < WORLD.waterLevel + 0.25 && kind !== 'reed') continue; // keep land props dry
      if (h > 13 && !['pine', 'rock', 'iceShard', 'monolith'].includes(kind)) continue; // alpine line
      const s = 0.7 + rng() * 0.7;
      positions.push({ x, y: h - 0.05, z, s, rot: rng() * Math.PI * 2 });
    }
    const resolved = resolveKind(kind, biome, rng);
    if (positions.length && hasPropKind(resolved)) {
      buildPropInstances(group, resolved, positions);
      propCounts[resolved] = (propCounts[resolved] || 0) + positions.length;
    }
  }

  /* --- surprise --- */
  const surprise = pickSurprise(cx, cz);
  if (surprise) {
    const builder = SURPRISE_BUILDERS[surprise.id];
    if (builder) {
      const sg = new THREE.Group();
      // Place near chunk middle-ish but off the exact centre for variety.
      const sx = (rng() - 0.5) * size * 0.4;
      const sz = (rng() - 0.5) * size * 0.4;
      const h = heightAt(cx * size + sx, cz * size + sz);
      sg.position.set(sx, h - 0.1, sz);
      builder(sg, rng);
      group.add(sg);
    }
  }

  chunkStats.loaded++;
  return { group, biome, biomeCounts, propCounts, surprise, hasWater, minH, maxH };
}

/* Debug helper: what biome covers a world point (for tests). */
export function biomeAtWorld(x, z) {
  return biomeIdAt(x, z).id;
}
