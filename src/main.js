/* Main: renderer, world streaming, player, entities, ambience, HUD, debug API. */
import * as THREE from 'three';
import { WORLD, BIOMES, SEED } from './worldData.js';
import { initShared, GEOS, MATS } from './props.js';
import { buildChunk, chunkStats, pickSurprise, surveySurprises } from './chunks.js';
import { heightAt, biomeIdAt } from './terrain.js';
import { EntityField } from './entities.js';
import { Sky, Ambience } from './atmosphere.js';
import { buildAmbientSystems } from './particles.js';

/* ---------------------------------------------------------------- setup */

const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcfe0ee, 0.0016);

const camera = new THREE.PerspectiveCamera(66, window.innerWidth / window.innerHeight, 0.1, 1200);
camera.position.set(0, 8, 0);

initShared();
const sky = new Sky(scene);
const ambience = new Ambience(scene);
const systems = buildAmbientSystems(scene);
for (const [id, sys] of Object.entries(systems)) ambience.registerSystem(id, sys);

const worldGroup = new THREE.Group();
scene.add(worldGroup);

const entityField = new EntityField(scene);

addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------------------------------------------------------- streamer */

const chunks = new Map(); // "cx,cz" -> {group, meta}
const R = WORLD.viewRadius;
const cs = WORLD.chunkSize;

function chunkKey(cx, cz) { return cx + ',' + cz; }

function ensureChunk(cx, cz) {
  const key = chunkKey(cx, cz);
  if (chunks.has(key)) return;
  let built;
  try {
    built = buildChunk(cx, cz);
  } catch (err) {
    console.error('chunk build failed', cx, cz, err);
    chunkStats.failed++;
    return;
  }
  worldGroup.add(built.group);
  chunks.set(key, { group: built.group, meta: built });
  // Journal a surprise the first time its chunk is built near the player.
  if (built.surprise) {
    const wx = cx * cs + cs / 2, wz = cz * cs + cs / 2;
    maybeAnnounceDiscovery(built.surprise, wx, wz);
  }
}

function cullChunks(px, pz) {
  const pcx = Math.floor(px / cs), pcz = Math.floor(pz / cs);
  for (const [key, ch] of chunks) {
    const [cx, cz] = key.split(',').map(Number);
    if (Math.abs(cx - pcx) > R + 1 || Math.abs(cz - pcz) > R + 1) {
      worldGroup.remove(ch.group);
      ch.group.traverse((o) => {
        if (o.geometry && o.geometry !== GEOS.cube && o.geometry !== GEOS.sphere) o.geometry.dispose();
      });
      chunks.delete(key);
    }
  }
}

function streamAround(px, pz, force = false) {
  const pcx = Math.floor(px / cs), pcz = Math.floor(pz / cs);
  const wanted = [];
  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      wanted.push([pcx + dx, pcz + dz, dx * dx + dz * dz]);
    }
  }
  wanted.sort((a, b) => a[2] - b[2]);
  let built = 0;
  const budget = force ? 12 : 2; // keep frames responsive; force is for tests/boot
  for (const [cx, cz] of wanted) {
    if (!chunks.has(chunkKey(cx, cz))) {
      ensureChunk(cx, cz);
      built++;
      if (built >= budget) break;
    }
  }
  cullChunks(px, pz);
}

/* ---------------------------------------------------------------- player */

const player = {
  pos: new THREE.Vector3(4, 0, 4),
  yaw: 0.6,
  pitch: -0.05,
  vel: new THREE.Vector3(),
  speedWalk: 7.2,
  speedStroll: 12.5,
  onGround: true,
};

player.pos.y = heightAt(player.pos.x, player.pos.z) + 1.7;

const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') tryInteract();
  if (e.code === 'KeyJ') toggleJournal();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });

const canvas = renderer.domElement;
let pointerLocked = false;
function requestLock(e) {
  // Synthetic clicks (tests) carry no user gesture; skip silently for them.
  if (e && e.isTrusted === false) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch {}
}
canvas.addEventListener('click', (e) => { if (started && !pointerLocked) requestLock(e); });
document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === canvas; });
document.addEventListener('mousemove', (e) => {
  if (!pointerLocked) return;
  player.yaw -= e.movementX * 0.0023;
  player.pitch -= e.movementY * 0.0023;
  player.pitch = Math.max(-1.2, Math.min(1.2, player.pitch));
});

function updatePlayer(dt) {
  const run = keys['ShiftLeft'] || keys['ShiftRight'];
  const speed = run ? player.speedStroll : player.speedWalk;
  const fwd = (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0);
  const strafe = (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0);
  const len = Math.hypot(fwd, strafe) || 1;
  const dirX = (Math.sin(player.yaw) * -fwd + Math.cos(player.yaw) * strafe) / len;
  const dirZ = (Math.cos(player.yaw) * -fwd - Math.sin(player.yaw) * strafe) / len;
  const moving = fwd !== 0 || strafe !== 0;

  const targetVX = moving ? dirX * speed : 0;
  const targetVZ = moving ? dirZ * speed : 0;
  player.vel.x += (targetVX - player.vel.x) * Math.min(1, dt * 9);
  player.vel.z += (targetVZ - player.vel.z) * Math.min(1, dt * 9);

  player.pos.x += player.vel.x * dt;
  player.pos.z += player.vel.z * dt;

  const groundH = heightAt(player.pos.x, player.pos.z);
  const eye = Math.max(groundH, WORLD.waterLevel - 0.6) + 1.7;
  player.pos.y += (eye - player.pos.y) * Math.min(1, dt * 11);

  camera.position.set(player.pos.x, player.pos.y, player.pos.z);
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;

  // Gentle head-bob when moving; very subtle.
  if (moving) {
    const t = performance.now() / 1000;
    camera.position.y += Math.sin(t * (run ? 9 : 6.5)) * (run ? 0.075 : 0.05);
  }
}

/* ---------------------------------------------------------------- HUD */

const biomeChip = document.getElementById('biome-chip');
const journalEl = document.getElementById('journal');
const journalList = document.getElementById('journal-list');
const speechEl = document.getElementById('speech');
const discoveryEl = document.getElementById('discovery');
const hintEl = document.getElementById('hint');
const introEl = document.getElementById('intro');

const journal = [];
let journalOpen = false;
let lastBiome = '';

function addJournal(text, kind = 'note') {
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  journal.unshift({ text, kind, time });
  if (journal.length > 60) journal.pop();
  renderJournal();
}

function renderJournal() {
  journalList.innerHTML = journal
    .map((j) => `<li>${j.kind === 'gift' ? '🎁 ' : j.kind === 'discovery' ? '✦ ' : '· '}<b>${j.time}</b> — ${j.text}</li>`)
    .join('');
}

function toggleJournal() {
  journalOpen = !journalOpen;
  journalEl.classList.toggle('hidden', !journalOpen);
}

let speechTimer = null;
function showSpeech(who, line, gift) {
  speechEl.innerHTML = `<span class="who">${who}</span>${line}${gift ? `<span class="gift">They gave you ${gift}.</span>` : ''}`;
  speechEl.classList.add('show');
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => speechEl.classList.remove('show'), 4200);
}

let discoveryTimer = null;
function showDiscovery(label) {
  discoveryEl.innerHTML = `<b>discovered</b>${label}`;
  discoveryEl.classList.add('show');
  clearTimeout(discoveryTimer);
  discoveryTimer = setTimeout(() => discoveryEl.classList.remove('show'), 4600);
}

const announced = new Set();
function maybeAnnounceDiscovery(surprise, wx, wz) {
  const key = surprise.id + '@' + Math.floor(wx / cs) + ',' + Math.floor(wz / cs);
  if (announced.has(key)) return;
  announced.add(key);
  const dist = Math.hypot(wx - player.pos.x, wz - player.pos.z);
  if (dist < cs * (R + 1)) {
    showDiscovery(surprise.label);
    addJournal(`Found ${surprise.label}.`, 'discovery');
  }
}

function tryInteract() {
  if (!started) return;
  entityField.setPlayerPos(player.pos);
  const e = entityField.nearest(7);
  if (!e) return;
  const r = e.interact();
  showSpeech(r.species, r.line, r.gift);
  addJournal(`Talked with ${r.species}. They said: “${r.line}”`);
  if (r.gift) addJournal(`${r.species} gave you ${r.gift}.`, 'gift');
}

document.getElementById('start-btn').addEventListener('click', (e) => {
  started = true;
  introEl.classList.add('hidden');
  requestLock(e);
  setTimeout(() => hintEl.classList.add('hidden'), 9000);
});
let started = false;

/* ---------------------------------------------------------------- boot */

addJournal('You step outside. The world unfolds in every direction.');
streamAround(player.pos.x, player.pos.z, true);
camera.position.set(player.pos.x, player.pos.y + 2, player.pos.z);

/* ---------------------------------------------------------------- loop */

let last = performance.now();
let elapsed = 0;
let frameSamples = [];
let ambientSampleLog = [];

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;

  if (started) updatePlayer(dt);
  else { // slow idle drift before start
    player.yaw += dt * 0.02;
    camera.rotation.y = player.yaw;
  }

  streamAround(player.pos.x, player.pos.z);
  entityField.setPlayerPos(player.pos);
  entityField.update(player.pos, dt, elapsed);
  sky.update(dt, player.pos);
  scene.fog.density = sky.fogDensity ?? scene.fog.density;
  ambience.update(dt, player.pos);

  // Water: layered sine waves + sun-glint-friendly normals.
  for (const [, ch] of chunks) {
    for (const child of ch.group.children) {
      if (child.userData?.isWater) {
        const t = elapsed;
        const attr = child.geometry.attributes.position;
        const base = child.geometry.userData.base;
        const px = child.position.x, pz = child.position.z;
        for (let i = 0; i < attr.count; i++) {
          const bx = base[i * 3] + px, bz = base[i * 3 + 2] + pz;
          attr.setY(i,
            Math.sin(bx * 0.42 + t * 1.6) * 0.42 +
            Math.sin(bz * 0.61 - t * 1.1) * 0.3 +
            Math.sin((bx + bz * 0.7) * 0.3 + t * 0.75) * 0.22);
        }
        attr.needsUpdate = true;
        child.geometry.computeVertexNormals();
      }
    }
  }

  // Biome chip
  const b = biomeIdAt(player.pos.x, player.pos.z);
  if (b !== lastBiome) {
    lastBiome = b;
    biomeChip.innerHTML = `${BIOMES[b].label}<small>${Math.round(player.pos.x)}, ${Math.round(player.pos.z)} · ${chunks.size} chunks</small>`;
  }

  if (frameSamples.length < 600) frameSamples.push(dt);
  renderer.render(scene, camera);
}
requestAnimationFrame(tick);

/* ---------------------------------------------------------------- debug API */

window.__GAME__ = {
  player,
  scene,
  camera,
  renderer,
  chunks,
  chunkStats,
  debug: {
    state() {
      return {
        pos: { x: player.pos.x, y: player.pos.y, z: player.pos.z },
        yaw: player.yaw,
        chunks: chunks.size,
        started,
      };
    },
    stats() {
      const avgFrame = frameSamples.length ? frameSamples.reduce((a, b) => a + b, 0) / frameSamples.length : 0;
      return {
        chunkStats: { ...chunkStats },
        loaded: chunks.size,
        entities: entityField.entities.size,
        avgFrameMs: +(avgFrame * 1000).toFixed(2),
      };
    },
    forceStream() { streamAround(player.pos.x, player.pos.z, true); },
    biomeAt(x, z) { return biomeIdAt(x, z); },
    biomeAtWorld(x, z) { return biomeIdAt(x, z); },
    heightAt,
    surveySurprises(n) {
      return surveySurprises(n);
    },
    surpriseAt(cx, cz) { return pickSurprise(cx, cz); },
    spawnCheckAll(radius) {
      // drive the weighted picker across species by sampling spawn attempts
      const out = {};
      for (let i = 0; i < radius; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = 24 + Math.random() * 46;
        const x = player.pos.x + Math.cos(a) * r;
        const z = player.pos.z + Math.sin(a) * r;
        const h = heightAt(x, z);
        if (h < 0.3) continue;
        const sp = entityField.debugPickSpecies(h);
        out[sp] = (out[sp] || 0) + 1;
      }
      return out;
    },
    spawnSpecies(index) {
      const keys = Object.keys(entityField.debugSpeciesTable());
      const sp = keys[index % keys.length];
      const a = Math.random() * Math.PI * 2, r = 30;
      const e = entityField.debugForceSpawn(sp, player.pos.x + Math.cos(a) * r, player.pos.z + Math.sin(a) * r);
      return e ? e.id : null;
    },
    nearestEntity() {
      entityField.setPlayerPos(player.pos);
      const e = entityField.nearest(1000);
      return e ? { id: e.id, species: e.species, dist: +e.pos.distanceTo(player.pos).toFixed(1) } : null;
    },
    interact(id) {
      const e = entityField.entities.get(id) || entityField.nearest(1000);
      if (!e) return { ok: false };
      entityField.setPlayerPos(player.pos);
      const r = e.interact();
      showSpeech(r.species, r.line, r.gift);
      addJournal(`Talked with ${r.species}. They said: “${r.line}”`);
      if (r.gift) addJournal(`${r.species} gave you ${r.gift}.`, 'gift');
      return { ok: true, ...r };
    },
    ambient() {
      const snap = ambience.snapshot();
      return {
        hasDamage: false, // there is no damage mechanic anywhere in this game
        ambientEvents: Object.keys(systems),
        activeNow: snap.activeNow,
        recentlyScheduled: snap.scheduled,
        totalKinds: snap.total,
        dayPhase: sky.phase,
        dayTime: +sky.time.toFixed(3),
      };
    },
    teleport(x, z) { player.pos.x = x; player.pos.z = z; },
  },
};
