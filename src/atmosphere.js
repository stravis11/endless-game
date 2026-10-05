/* Sky dome, sun/moon, fog, and the ambient event scheduler.
   All soft, all optional, all peaceful. */
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { AMBIENT_EVENTS, BIOMES } from './worldData.js';

const SKY_VERT = `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const SKY_FRAG = `
varying vec3 vWorldPos;
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 botColor;
uniform vec3 sunDir;
uniform vec3 sunColor;
void main() {
  vec3 dir = normalize(vWorldPos);
  float h = dir.y * 0.5 + 0.5;
  vec3 col = mix(botColor, midColor, smoothstep(0.0, 0.5, h));
  col = mix(col, topColor, smoothstep(0.5, 1.0, h));
  float sunAmt = pow(max(dot(dir, normalize(sunDir)), 0.0), 24.0);
  col += sunColor * sunAmt * 0.8;
  float glow = pow(max(dot(dir, normalize(sunDir)), 0.0), 4.0);
  col += sunColor * glow * 0.18;
  gl_FragColor = vec4(col, 1.0);
}`;

export class Sky {
  constructor(scene) {
    this.scene = scene;
    this.uniforms = {
      topColor: { value: new THREE.Color(0x7fb2e8) },
      midColor: { value: new THREE.Color(0xcfe0ee) },
      botColor: { value: new THREE.Color(0xf2e8d8) },
      sunDir: { value: new THREE.Vector3(0.4, 0.7, 0.25) },
      sunColor: { value: new THREE.Color(0xfff0d0) },
    };
    const geo = new THREE.SphereGeometry(900, 24, 16);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(geo, mat);
    this.dome.frustumCulled = false;
    scene.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
    scene.add(this.sun);
    this.hemi = new THREE.HemisphereLight(0xcfe4f5, 0x8a9a78, 0.85);
    scene.add(this.hemi);
    this.ambient = new THREE.AmbientLight(0xf0e8dc, 0.35);
    scene.add(this.ambient);

    this.dayLength = 420; // seconds per full cycle
    this.time = 0.4; // start mid-morning
    this.fogColor = new THREE.Color(0xcfe0ee);
    this.fogDensity = 0.0042;
    this._sunDir = new THREE.Vector3();
  }

  update(dt, playerPos) {
    this.time = (this.time + dt / this.dayLength) % 1;
    const ang = this.time * Math.PI * 2 - Math.PI / 2;
    const sunY = Math.sin(ang);
    const sunX = Math.cos(ang) * 0.6;
    const sunDir = this._sunDir.set(sunX, Math.max(sunY, -0.35), 0.35).normalize();
    this.uniforms.sunDir.value.copy(sunDir);

    // Palette drift across the day: night -> dawn -> noon -> dusk.
    const t = this.time;
    const dayAmt = smooth01(sunY);
    const nightC = { top: 0x2a3555, mid: 0x3d4a6b, bot: 0x55607e, sun: 0xaab8d8, light: 0.28, fogN: 0.0058 };
    const dawnC = { top: 0x8a9ad8, mid: 0xe8b8a0, bot: 0xf5d9b8, sun: 0xffc890, light: 0.9, fogN: 0.0048 };
    const dayC = { top: 0x7fb2e8, mid: 0xcfe0ee, bot: 0xf2e8d8, sun: 0xfff0d0, light: 1.5, fogN: 0.0042 };
    const duskC = { top: 0x6a7ab8, mid: 0xe8a88a, bot: 0xf0c8a0, sun: 0xffb070, light: 0.85, fogN: 0.0048 };

    const P = mixPalettes(nightC, dawnC, dayC, duskC, t, sunY);
    this.uniforms.topColor.value.setHex(P.top);
    this.uniforms.midColor.value.setHex(P.mid);
    this.uniforms.botColor.value.setHex(P.bot);
    this.uniforms.sunColor.value.setHex(P.sun);
    this.sun.intensity = P.light * (0.35 + 0.65 * dayAmt);
    // Fill light fades with the sun (same daytime values), so nights are dark.
    this.hemi.intensity = 0.15 + 0.75 * dayAmt;
    this.ambient.intensity = 0.12 + 0.26 * dayAmt;
    this.sun.color.setHex(P.sun);

    this.sun.position.copy(sunDir).multiplyScalar(300).add(playerPos);
    this.sun.target.position.copy(playerPos);
    this.sun.target.updateMatrixWorld();
    this.dome.position.copy(playerPos);
    // Distant terrain fades into the horizon colour of the sky dome, so the
    // edge of the streamed world is never visible against a mismatched sky.
    this.fogColor.setHex(P.mid);
    this.fogDensity = P.fogN;
  }

  get phase() {
    const t = this.time;
    if (t < 0.22 || t > 0.82) return 'night';
    if (t < 0.34) return 'dawn';
    if (t < 0.66) return 'day';
    return 'dusk';
  }
}

function smooth01(v) { return Math.min(1, Math.max(0, v * 1.6 + 0.25)); }

function mixPalettes(N, D, Day, K, t, sunY) {
  // Segment-based blending: night->dawn->day->dusk->night.
  // Hold full daylight through the middle of the day and full dark through
  // the night; dawn and dusk are short transitions around sunrise/sunset.
  const stops = [0.0, 0.20, 0.27, 0.36, 0.64, 0.74, 0.82, 1.0];
  const pals = [N, N, D, Day, Day, K, N, N];
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1]) i++;
  const a = stops[i], b = stops[i + 1];
  const f = Math.min(1, Math.max(0, (t - a) / Math.max(1e-5, b - a)));
  const A = pals[i], B = pals[i + 1];
  return {
    top: mixHex(A.top, B.top, f),
    mid: mixHex(A.mid, B.mid, f),
    bot: mixHex(A.bot, B.bot, f),
    sun: mixHex(A.sun, B.sun, f),
    light: A.light + (B.light - A.light) * f,
    fogN: A.fogN + (B.fogN - A.fogN) * f,
  };
}

const _mixA = new THREE.Color(), _mixB = new THREE.Color();
function mixHex(h1, h2, f) {
  return _mixA.setHex(h1).lerp(_mixB.setHex(h2), f).getHex();
}

/* ---------------- ambient events ---------------- */

/* Events that suit any landscape; the rest come from the biome's own list. */
const ANYWHERE = new Set(['birds', 'windGusts']);
/* Events that only make sense at certain times of day. */
const WHEN = {
  fireflies: ['dusk', 'night'],
  aurora: ['night'],
  shootingStars: ['night'],
  butterflies: ['dawn', 'day'],
};

export class Ambience {
  constructor(scene) {
    this.scene = scene;
    this.active = new Map(); // id -> {endTime, label}
    this.nextAt = new Map(); // id -> next start time
    this.clock = 0;
    this.history = [];
    this.rng = mulberry32(0xA1E);
    for (const ev of AMBIENT_EVENTS) this.nextAt.set(ev.id, this.rng() * ev.meanGap * 0.5);
    this.systems = {};
  }

  registerSystem(id, system) {
    this.systems[id] = system;
  }

  fits(id, biome, phase) {
    const b = BIOMES[biome];
    if (!ANYWHERE.has(id) && !(b && b.ambient.includes(id))) return false;
    return !WHEN[id] || WHEN[id].includes(phase);
  }

  /* biome and phase decide what may happen here and now. */
  update(dt, playerPos, biome, phase) {
    this.clock += dt;
    for (const ev of AMBIENT_EVENTS) {
      if (this.active.has(ev.id) || this.clock < this.nextAt.get(ev.id)) continue;
      if (!this.fits(ev.id, biome, phase)) {
        this.nextAt.set(ev.id, this.clock + 8); // not here, not now: look again soon
        continue;
      }
      const dur = ev.dur * (0.7 + this.rng() * 0.6);
      this.active.set(ev.id, { endTime: this.clock + dur, label: ev.label });
      this.history.push({ id: ev.id, start: this.clock, dur });
      if (this.history.length > 400) this.history.shift();
      const sys = this.systems[ev.id];
      if (sys) sys.start(playerPos);
    }
    for (const [id, st] of [...this.active]) {
      // Wandering out of the biome (or into daylight) ends an event early.
      if (this.clock >= st.endTime || !this.fits(id, biome, phase)) {
        this.active.delete(id);
        const sys = this.systems[id];
        if (sys) sys.stop();
        const ev = AMBIENT_EVENTS.find((e) => e.id === id);
        this.nextAt.set(id, this.clock + ev.meanGap * (0.5 + this.rng()));
      }
    }
    // Systems keep updating after stop() so they can fade out gently.
    for (const sys of Object.values(this.systems)) sys.update(dt, playerPos);
  }

  snapshot() {
    return {
      activeNow: [...this.active.values()].map((v) => v.label),
      scheduled: this.history.slice(-12).map((h) => h.id),
      total: AMBIENT_EVENTS.length,
    };
  }
}
