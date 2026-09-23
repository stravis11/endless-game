/* The shape of the land: biome map, height field, surface colours.
   Everything is a pure function of (x, z) + SEED. Biome identity is fixed per
   140-unit climate cell; height/scale/ridge and colours are bilinearly blended
   across the four neighbouring cells so borders stay smooth. Cell lookups are
   cached — the same few hundred cells serve thousands of vertex queries. */

import * as THREE from 'three';
import { fbm2, ridged2, lerp, clamp, smoothstep, hash2 } from './rng.js';
import { BIOMES, BIOME_KEYS, SEED } from './worldData.js';

export const CELL = 140;

/* -------- climate cells: stable shuffled weighted pick -------- */

const cellCache = new Map();

function shuffleOrder(zoneSeed) {
  const order = BIOME_KEYS.slice();
  let s = zoneSeed >>> 0;
  for (let i = order.length - 1; i > 0; i--) {
    s = (Math.imul(s ^ (s >>> 13), 0x5bd1e995) + i) >>> 0;
    const j = s % (i + 1);
    const tmp = order[i]; order[i] = order[j]; order[j] = tmp;
  }
  return order;
}

export function cellBiome(cx, cz) {
  const key = (cx + 50000) * 100000 + (cz + 50000);
  let id = cellCache.get(key);
  if (id !== undefined) return id;
  // Zone identity from two continent-scale noises sampled at the cell centre.
  const wx = (cx + 0.5) * CELL, wz = (cz + 0.5) * CELL;
  const a = fbm2(wx * 0.0012, wz * 0.0012, SEED ^ 0xA17, 3);
  const b = fbm2(wx * 0.0021, wz * 0.0021, SEED ^ 0x2E9, 3);
  const zoneSeed = (Math.floor(a * 65535) * 7919 + Math.floor(b * 65535) * 104729) >>> 0;
  const order = shuffleOrder(zoneSeed);
  const h = hash2(cx, cz, SEED ^ 0xB10);
  let total = 0;
  for (const k of order) total += BIOMES[k].weight;
  let t = h * total;
  id = order[order.length - 1];
  for (const k of order) {
    t -= BIOMES[k].weight;
    if (t <= 0) { id = k; break; }
  }
  if (cellCache.size > 30000) cellCache.clear();
  cellCache.set(key, id);
  return id;
}

/* Public helper: biome id covering a world point. */
export function biomeIdAt(x, z) {
  return cellBiome(Math.floor(x / CELL), Math.floor(z / CELL));
}

/* Bilinear blend of the four surrounding cells' biome definitions.
   Cell centres sit at (i + 0.5) * CELL. */
const _cornerIds = [0, 0, 0, 0];
const _cornerW = [0, 0, 0, 0];
export function biomeBilinear(x, z) {
  const fx = x / CELL - 0.5;
  const fz = z / CELL - 0.5;
  const x0 = Math.floor(fx), z0 = Math.floor(fz);
  const tx = fx - x0, tz = fz - z0;
  _cornerIds[0] = cellBiome(x0, z0);
  _cornerIds[1] = cellBiome(x0 + 1, z0);
  _cornerIds[2] = cellBiome(x0, z0 + 1);
  _cornerIds[3] = cellBiome(x0 + 1, z0 + 1);
  _cornerW[0] = (1 - tx) * (1 - tz);
  _cornerW[1] = tx * (1 - tz);
  _cornerW[2] = (1 - tx) * tz;
  _cornerW[3] = tx * tz;
  return { ids: _cornerIds, w: _cornerW };
}

/* -------- height field -------- */

const _p = { scale: 1, amp: 4, ridge: 0 };
export function heightParamsAt(x, z) {
  const { ids, w } = biomeBilinear(x, z);
  let scale = 0, amp = 0, ridge = 0;
  for (let i = 0; i < 4; i++) {
    const b = BIOMES[ids[i]];
    scale += b.scale * w[i];
    amp += b.amp * w[i];
    ridge += b.ridge * w[i];
  }
  _p.scale = scale; _p.amp = amp; _p.ridge = ridge;
  return _p;
}

export function heightAt(x, z) {
  const p = heightParamsAt(x, z);
  const n = fbm2(x * 0.008 * p.scale, z * 0.008 * p.scale, SEED ^ 0x77, 4);
  const r = p.ridge > 0.02 ? ridged2(x * 0.006 * p.scale, z * 0.006 * p.scale, SEED ^ 0x99, 4) : 0;
  let h = (n - 0.42) * p.amp * 2 + r * p.amp * p.ridge * 2.2;
  // Continental swell so lakes and valleys appear without border cliffs.
  const cont = (fbm2(x * 0.0015, z * 0.0015, SEED ^ 0x55, 3) - 0.5) * 14;
  h += cont;
  // Shore flattening near water level.
  if (h < 2.2 && h > -3) {
    const t = smoothstep(-3, 2.2, h);
    h = lerp(h * 0.55 - 1.4, h, t);
  }
  return h;
}

/* -------- surface colour -------- */

const _cA = new THREE.Color(), _cB = new THREE.Color();
const _sand = new THREE.Color(0xe8d8ae), _bed = new THREE.Color(0x7d988c);
const _acc = new THREE.Color();
export function surfaceColor(x, z, h, out) {
  const { ids, w } = biomeBilinear(x, z);
  const jitter = hash2(Math.floor(x * 3), Math.floor(z * 3), SEED ^ 0xC0);
  const t = clamp((h + 0.5) / 9, 0, 1);
  _acc.setRGB(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    if (w[i] <= 0) continue;
    const b = BIOMES[ids[i]];
    _cA.setHex(b.top[0]);
    _cB.setHex(b.top[1]);
    _cA.lerp(_cB, t * 0.7 + jitter * 0.3);
    _acc.r += _cA.r * w[i];
    _acc.g += _cA.g * w[i];
    _acc.b += _cA.b * w[i];
  }
  out.copy(_acc);
  if (h < 0.4) out.lerp(_sand, smoothstep(0.4, -0.4, h) * 0.85);
  if (h < -1.2) out.lerp(_bed, smoothstep(-1.2, -5, h) * 0.8);
  return out;
}
