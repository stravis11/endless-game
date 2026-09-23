/* Living things: 8 gentle species with simple behaviours and interactions. */
import * as THREE from 'three';
import { mulberry32 } from './rng.js';
import { SPECIES, SPECIES_KEYS, GIFTS, SEED } from './worldData.js';
import { heightAt } from './terrain.js';

const _v = new THREE.Vector3();

export class Entity {
  constructor(species, x, z, worldSeedSalt) {
    this.species = species;
    this.id = `${species}-${Math.floor(mulberry32(worldSeedSalt)() * 1e9)}-${Date.now().toString(36)}`;
    const def = SPECIES[species];
    this.def = def;
    this.pos = new THREE.Vector3(x, 0, z);
    this.homeY = 0;
    this.phase = mulberry32(worldSeedSalt ^ 0xF00D)() * Math.PI * 2;
    this.wanderAngle = mulberry32(worldSeedSalt ^ 0xBEEF)() * Math.PI * 2;
    this.state = 'wander';
    this.speed = def.speed * (0.8 + mulberry32(worldSeedSalt ^ 0x77)() * 0.4);
    this.group = buildCreature(def, worldSeedSalt);
    this.befriended = false;
    this.giftGiven = false;
    this.lineIndex = Math.floor(Math.random() * def.lines.length);
    this.following = false;
    this.followTimer = 0;
  }

  update(dt, playerPos, time) {
    const def = this.def;
    const toPlayer = _v.copy(playerPos).sub(this.pos);
    toPlayer.y = 0;
    const dist = toPlayer.length();

    if (this.following) {
      // Follow at a respectful distance.
      if (dist > 4.5) {
        toPlayer.normalize();
        this.pos.addScaledVector(toPlayer, def.speed * 1.35 * dt);
      } else if (dist < 2.6) {
        this.pos.addScaledVector(toPlayer.normalize(), -def.speed * 0.4 * dt);
      }
      this.pos.y = groundYFor(this);
      this.group.position.copy(this.pos);
      return;
    }

    if (dist < 7) {
      // Curiosity: turn toward the player, approach slowly, then linger.
      const target = Math.atan2(toPlayer.x, toPlayer.z);
      let d = target - this.wanderAngle;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.wanderAngle += d * Math.min(1, dt * 2.4);
      if (dist > 3.4) this.tryMove(toPlayer, def.speed * 0.55 * dt);
    } else {
      // Wander with smooth heading noise.
      this.wanderAngle += (Math.sin(time * 0.31 + this.phase) + Math.sin(time * 0.13 + this.phase * 2.7)) * 0.7 * dt;
      this.tryMove(
        new THREE.Vector3(Math.sin(this.wanderAngle), 0, Math.cos(this.wanderAngle)),
        def.speed * 0.45 * dt,
      );
    }
    this.pos.y = groundYFor(this);
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.wanderAngle + Math.PI;
  }

  wangleSafe() { return this.wanderAngle; }

  /* Land animals stay out of the water; swimmers/waders/flyers go anywhere. */
  tryMove(dir, dist) {
    const aquatic = this.def.kind === 'wader' || this.def.kind === 'floater' || this.def.kind === 'flutter';
    const nx = this.pos.x + dir.x * dist;
    const nz = this.pos.z + dir.z * dist;
    if (aquatic || heightAt(nx, nz) >= 0.3) {
      this.pos.x = nx;
      this.pos.z = nz;
    } else {
      // Gently steer away from the shoreline.
      this.wanderAngle += 1.1;
    }
  }

  interact() {
    const def = this.def;
    this.lineIndex = (this.lineIndex + 1) % def.lines.length;
    const line = def.lines[this.lineIndex];
    const result = { ok: true, line, species: def.label, reaction: '', gift: null, followed: false };

    if (!this.befriended) {
      this.befriended = true;
      result.reaction = `${def.label} hops with delight`;
      // Gifts and companionships are probabilistic per species rarity.
      if (!this.giftGiven && Math.random() < 0.45) {
        this.giftGiven = true;
        result.gift = GIFTS[Math.floor(Math.random() * GIFTS.length)];
      } else if (Math.random() < 0.3) {
        this.following = true;
        result.followed = true;
        result.reaction = `${def.label} decides to tag along`;
      }
    } else {
      result.reaction = `${def.label} greets you warmly`;
    }
    return result;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
}

function groundYFor(e) {
  const h = heightAt(e.pos.x, e.pos.z);
  const base = Math.max(h, 0.05);
  if (e.def.kind === 'floater' || e.def.kind === 'flutter') return base + 1.6 + Math.sin(e.phase) * 0.0; // bob applied via group child
  return base;
}

/* ---------------- creature bodies ---------------- */

function buildCreature(def, salt) {
  const g = new THREE.Group();
  const rng = mulberry32(salt);
  const mat = new THREE.MeshLambertMaterial({ color: def.color });
  const mat2 = new THREE.MeshLambertMaterial({ color: def.color2 });
  const s = def.size;

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.5 * s, 10, 8), mat);
  body.scale.set(1.15, 0.9, 1.35);
  body.position.y = 0.5 * s;
  g.add(body);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.3 * s, 9, 7), mat);
  head.position.set(0, 0.85 * s, 0.55 * s);
  g.add(head);

  // Eyes (all species get friendly eyes).
  for (const ex of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055 * s, 6, 5), new THREE.MeshBasicMaterial({ color: 0x2a2a30 }));
    eye.position.set(ex * s, 0.92 * s, 0.78 * s);
    g.add(eye);
  }

  const kind = def.kind;
  if (kind === 'hopper' || kind === 'trotter' || kind === 'sniffer') {
    // Ears / snout accents
    if (kind === 'hopper') {
      for (const ex of [-0.14, 0.14]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.09 * s, 0.5 * s, 6), mat2);
        ear.position.set(ex * s, 1.3 * s, 0.45 * s);
        ear.rotation.z = ex > 0 ? -0.25 : 0.25;
        g.add(ear);
      }
    }
    if (kind === 'sniffer') {
      const snout = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * s, 0.12 * s, 0.35 * s, 7), mat2);
      snout.rotation.x = Math.PI / 2;
      snout.position.set(0, 0.8 * s, 0.95 * s);
      g.add(snout);
    }
    if (kind === 'trotter') {
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.12 * s, 0.4 * s, 6), mat2);
      tail.position.set(0, 0.75 * s, -0.7 * s);
      tail.rotation.x = 1.2;
      g.add(tail);
      // Lantern
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.9 * s, 5), mat2);
      post.position.set(0.3 * s, 1.15 * s, -0.3 * s);
      g.add(post);
      const glow = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16 * s, 0), new THREE.MeshBasicMaterial({ color: 0xffd88a }));
      glow.position.set(0.3 * s, 1.65 * s, -0.3 * s);
      g.add(glow);
    }
    // Legs
    for (const lx of [-0.22, 0.22]) {
      for (const lz of [-0.3, 0.3]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07 * s, 0.06 * s, 0.4 * s, 5), mat2);
        leg.position.set(lx * s, 0.2 * s, lz * s);
        g.add(leg);
      }
    }
  } else if (kind === 'walker') {
    // Turtle: dome + flat body
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 10, 8), mat2);
    shell.scale.set(1.2, 0.55, 1.4);
    shell.position.y = 0.62 * s;
    g.add(shell);
    for (const lx of [-0.3, 0.3]) {
      for (const lz of [-0.35, 0.35]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1 * s, 0.09 * s, 0.3 * s, 5), mat);
        leg.position.set(lx * s, 0.15 * s, lz * s);
        g.add(leg);
      }
    }
    const head2 = new THREE.Mesh(new THREE.SphereGeometry(0.18 * s, 8, 6), mat);
    head2.position.set(0, 0.5 * s, 0.72 * s);
    g.add(head2);
  } else if (kind === 'floater' || kind === 'flutter') {
    // Wisp / sprite: core + orbiting motes
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 * s, 1), new THREE.MeshBasicMaterial({ color: def.color }));
    core.position.y = 0.5 * s;
    g.add(core);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 8, 6), new THREE.MeshBasicMaterial({ color: def.color2, transparent: true, opacity: 0.35 }));
    core.add(halo);
    const nMotes = kind === 'flutter' ? 3 : 2;
    for (let i = 0; i < nMotes; i++) {
      const mote = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09 * s, 0), new THREE.MeshBasicMaterial({ color: def.color2 }));
      mote.position.set(Math.cos(i * 2.1) * 0.5 * s, 0.2 * s + i * 0.12, Math.sin(i * 2.1) * 0.5 * s);
      mote.userData.orbit = i * 2.1;
      g.add(mote);
    }
  } else if (kind === 'wader') {
    // Heron: long legs, long neck, glassy body
    for (const lx of [-0.12, 0.12]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.9 * s, 5), mat2);
      leg.position.set(lx * s, 0.45 * s, 0);
      g.add(leg);
    }
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.08 * s, 0.9 * s, 6), mat);
    neck.position.set(0, 1.35 * s, 0.18 * s);
    neck.rotation.x = 0.4;
    g.add(neck);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.06 * s, 0.55 * s, 6), mat2);
    beak.position.set(0, 1.72 * s, 0.55 * s);
    beak.rotation.x = Math.PI / 2.2;
    g.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.18 * s, 0.6 * s, 6), mat);
    tail.position.set(0, 0.85 * s, -0.55 * s);
    tail.rotation.x = -1.9;
    g.add(tail);
  } else if (kind === 'grazer') {
    // Sheep: fluffy body clouds
    const body2 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55 * s, 0), mat);
    body2.scale.set(1.3, 1.0, 1.5);
    body2.position.y = 0.62 * s;
    g.add(body2);
    for (let i = 0; i < 5; i++) {
      const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28 * s, 0), mat);
      const a = (i / 5) * Math.PI * 2;
      puff.position.set(Math.cos(a) * 0.35 * s, 0.75 * s + Math.sin(i * 2.3) * 0.12, Math.sin(a) * 0.45 * s);
      g.add(puff);
    }
    for (const lx of [-0.22, 0.22]) {
      for (const lz of [-0.28, 0.28]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06 * s, 0.05 * s, 0.4 * s, 5), mat2);
        leg.position.set(lx * s, 0.2 * s, lz * s);
        g.add(leg);
      }
    }
  }

  return g;
}

/* ---------------- spawner ---------------- */

export class EntityField {
  constructor(scene) {
    this.scene = scene;
    this.entities = new Map();
    this.spawnBudgetPerTick = 2;
  }

  /* Maintain 8-14 creatures within ~70 units of the player. Deterministic-ish
     placement from cell hash; identity randomized at spawn. */
  update(playerPos, dt, time) {
    const targetCount = 12;
    const R = 70;
    // Despawn far ones
    for (const [id, e] of this.entities) {
      if (e.pos.distanceTo(playerPos) > R + 30) {
        e.dispose();
        this.scene.remove(e.group);
        this.entities.delete(id);
      }
    }
    // Spawn new ones near the player
    let attempts = 0;
    while (this.entities.size < targetCount && attempts < 24) {
      attempts++;
      const a = Math.random() * Math.PI * 2;
      const r = 24 + Math.random() * (R - 24);
      const x = playerPos.x + Math.cos(a) * r;
      const z = playerPos.z + Math.sin(a) * r;
      const h = heightAt(x, z);
      if (h < 0.3) continue; // not in water
      const species = weightedSpeciesPick(h);
      const e = new Entity(species, x, z, (Math.imul(Math.floor(x * 7), 13) ^ Math.imul(Math.floor(z * 7), 17) ^ SEED) >>> 0);
      this.entities.set(e.id, e);
      this.scene.add(e.group);
      if (attempts > 12) break; // spread spawns across frames
    }
    for (const e of this.entities.values()) e.update(dt, playerPos, time);
  }

  nearest(maxDist = 6) {
    let best = null, bestD = maxDist;
    if (!this.playerPos) return null;
    for (const e of this.entities.values()) {
      const dd = e.pos.distanceTo(this.playerPos);
      if (dd < bestD) { best = e; bestD = dd; }
    }
    return best;
  }

  setPlayerPos(p) { this.playerPos = p; }

  debugSpeciesTable() { return SPECIES; }

  debugPickSpecies(h) { return weightedSpeciesPick(h); }

  debugForceSpawn(species, x, z) {
    // Nudge outward until we find dry land for non-aquatic species.
    const def = SPECIES[species];
    const aquatic = def.kind === 'wader' || def.kind === 'floater' || def.kind === 'flutter';
    let sx = x, sz = z;
    if (!aquatic) {
      for (let tries = 0; tries < 24 && heightAt(sx, sz) < 0.3; tries++) {
        sx += 8;
        sz += 3;
      }
    }
    const e = new Entity(species, sx, sz, (Math.imul(Math.floor(sx * 7), 13) ^ Math.imul(Math.floor(sz * 7), 17) ^ SEED ^ 0xABCDEF) >>> 0);
    e.pos.y = Math.max(heightAt(sx, sz), 0.05);
    e.group.position.copy(e.pos);
    this.entities.set(e.id, e);
    this.scene.add(e.group);
    return e;
  }
}

/* Species pick biased by height band + rarity weight. */
function weightedSpeciesPick(h) {
  const r = Math.random();
  // Simple rarity-weighted choice; height adds gentle flavour (herons like water edges).
  let pool = SPECIES_KEYS.slice();
  const weights = pool.map((k) => {
    let w = SPECIES[k].rarity;
    if (k === 'glassHeron' && h < 1.6) w *= 4;
    if (k === 'trufflePig' && h > 2 && h < 7) w *= 1.5;
    if (k === 'skyWisp' && h > 8) w *= 3;
    if (k === 'cloudSheep' && h > 4) w *= 1.6;
    return w;
  });
  const total = weights.reduce((p, c) => p + c, 0);
  let t = r * total;
  for (let i = 0; i < pool.length; i++) {
    t -= weights[i];
    if (t <= 0) return pool[i];
  }
  return pool[0];
}
